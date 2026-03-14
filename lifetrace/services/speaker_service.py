"""Speaker voiceprint store and identification helpers.

**VoiceprintStore** – persistent voiceprint database backed by SQLite,
with an in-memory cache of embeddings for fast cosine-similarity lookups.
Used for *cross-session* speaker re-identification (future).

Real-time *within-session* diarization (including overlap handling) is
provided by :mod:`lifetrace.services.diart_diarizer`.
"""

from __future__ import annotations

import base64
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from sqlmodel import select

from lifetrace.storage import get_session
from lifetrace.storage.models import SpeakerProfile, SpeakerVoiceprint
from lifetrace.storage.sql_utils import col
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


@dataclass
class SpeakerMatch:
    """Result of a speaker identification attempt."""

    speaker_id: int
    speaker_name: str
    confidence: float
    is_new: bool = False


def _embedding_to_base64(embedding: np.ndarray) -> str:
    return base64.b64encode(embedding.astype(np.float32).tobytes()).decode("ascii")


def _base64_to_embedding(b64: str, dim: int = 192) -> np.ndarray:
    raw = base64.b64decode(b64)
    return np.frombuffer(raw, dtype=np.float32).reshape(dim)


class VoiceprintStore:
    """Manages the persistent voiceprint database with an in-memory cache.

    All DB writes go through SQLModel/SQLAlchemy sessions; the in-memory
    cache is a numpy matrix ``(N, dim)`` for vectorised cosine similarity.
    """

    _instance: VoiceprintStore | None = None
    _initialized: bool = False

    def __new__(cls) -> VoiceprintStore:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if VoiceprintStore._initialized:
            return
        VoiceprintStore._initialized = True

        self._lock = threading.Lock()

        cfg = settings.get("audio.speaker", {}) or {}
        self._embedding_dim: int = int(cfg.get("embedding_dim", 192))
        self._similarity_threshold: float = float(cfg.get("similarity_threshold", 0.65))
        self._max_speakers: int = int(cfg.get("max_speakers", 100))
        self._auto_create: bool = bool(cfg.get("auto_create_speaker", True))
        self._update_voiceprint: bool = bool(cfg.get("update_voiceprint", True))
        self._max_samples: int = int(cfg.get("max_samples_per_speaker", 10))

        # In-memory cache: list of (speaker_id, mean_embedding)
        self._cache: list[tuple[int, str, np.ndarray]] = []  # (id, name, mean_emb)
        self._cache_loaded = False

    def _ensure_cache(self) -> None:
        """Load all voiceprints from DB into memory (once)."""
        if self._cache_loaded:
            return
        with self._lock:
            if self._cache_loaded:
                return
            self._reload_cache_from_db()
            self._cache_loaded = True

    def _reload_cache_from_db(self) -> None:
        """Rebuild the in-memory cache from DB."""
        cache: list[tuple[int, str, np.ndarray]] = []
        try:
            with get_session() as session:
                profiles = list(
                    session.exec(
                        select(SpeakerProfile).where(
                            col(SpeakerProfile.is_active).is_(True),
                            col(SpeakerProfile.deleted_at).is_(None),
                        )
                    ).all()
                )
                for profile in profiles:
                    if profile.id is None:
                        continue
                    voiceprints = list(
                        session.exec(
                            select(SpeakerVoiceprint).where(
                                col(SpeakerVoiceprint.speaker_profile_id) == profile.id,
                                col(SpeakerVoiceprint.deleted_at).is_(None),
                            )
                        ).all()
                    )
                    if not voiceprints:
                        continue
                    embeddings = []
                    for vp in voiceprints:
                        try:
                            emb = _base64_to_embedding(vp.embedding, self._embedding_dim)
                            embeddings.append(emb)
                        except Exception as e:
                            logger.warning(f"跳过损坏的声纹 {vp.id}: {e}")
                    if embeddings:
                        mean_emb = np.mean(embeddings, axis=0).astype(np.float32)
                        norm = np.linalg.norm(mean_emb)
                        if norm > 0:
                            mean_emb = mean_emb / norm
                        cache.append((profile.id, profile.name, mean_emb))
        except Exception as e:
            logger.error(f"加载声纹缓存失败: {e}")

        self._cache = cache
        logger.info(f"声纹缓存已加载: {len(cache)} 位说话人")

    def reload_cache(self) -> None:
        """Force-reload the in-memory cache (e.g. after manual DB edits)."""
        with self._lock:
            self._reload_cache_from_db()
            self._cache_loaded = True

    def find_speaker(self, embedding: np.ndarray) -> SpeakerMatch | None:
        """Find the best-matching speaker for the given embedding.

        Returns ``None`` if no speaker exceeds the similarity threshold.
        """
        self._ensure_cache()
        if not self._cache:
            return None

        emb_norm = np.linalg.norm(embedding)
        if emb_norm == 0:
            return None
        query = (embedding / emb_norm).astype(np.float32)

        best_id = -1
        best_name = ""
        best_score = -1.0

        for sid, sname, mean_emb in self._cache:
            score = float(np.dot(query, mean_emb))
            if score > best_score:
                best_score = score
                best_id = sid
                best_name = sname

        if best_score >= self._similarity_threshold:
            return SpeakerMatch(
                speaker_id=best_id,
                speaker_name=best_name,
                confidence=best_score,
            )
        return None

    def register_speaker(
        self, embedding: np.ndarray, name: str | None = None, audio_duration: float = 0.0
    ) -> SpeakerMatch:
        """Create a new speaker profile and store the first voiceprint."""
        if len(self._cache) >= self._max_speakers:
            raise RuntimeError(f"声纹库已达上限 ({self._max_speakers})")

        emb_b64 = _embedding_to_base64(embedding)
        with get_session() as session:
            next_number = len(self._cache) + 1
            profile = SpeakerProfile(
                name=name or f"说话人 {next_number}",
                sample_count=1,
                is_active=True,
            )
            session.add(profile)
            session.commit()
            session.refresh(profile)
            if profile.id is None:
                raise RuntimeError("Failed to persist SpeakerProfile: id is None")

            voiceprint = SpeakerVoiceprint(
                speaker_profile_id=profile.id,
                embedding=emb_b64,
                embedding_dim=self._embedding_dim,
                audio_duration=audio_duration,
                quality_score=min(audio_duration / 5.0, 1.0),
            )
            session.add(voiceprint)
            session.commit()

            norm_emb = embedding / (np.linalg.norm(embedding) or 1.0)
            self._cache.append((profile.id, profile.name, norm_emb.astype(np.float32)))

            logger.info(f"新建说话人: id={profile.id}, name={profile.name}")
            return SpeakerMatch(
                speaker_id=profile.id,
                speaker_name=profile.name,
                confidence=1.0,
                is_new=True,
            )

    def add_voiceprint_sample(
        self,
        speaker_id: int,
        embedding: np.ndarray,
        audio_duration: float = 0.0,
    ) -> None:
        """Add another voiceprint sample to an existing speaker."""
        if not self._update_voiceprint:
            return

        with get_session() as session:
            existing_count = session.exec(
                select(SpeakerVoiceprint).where(
                    col(SpeakerVoiceprint.speaker_profile_id) == speaker_id,
                    col(SpeakerVoiceprint.deleted_at).is_(None),
                )
            ).all()
            if len(list(existing_count)) >= self._max_samples:
                return

            voiceprint = SpeakerVoiceprint(
                speaker_profile_id=speaker_id,
                embedding=_embedding_to_base64(embedding),
                embedding_dim=self._embedding_dim,
                audio_duration=audio_duration,
                quality_score=min(audio_duration / 5.0, 1.0),
            )
            session.add(voiceprint)

            profile = session.get(SpeakerProfile, speaker_id)
            if profile:
                profile.sample_count = (profile.sample_count or 0) + 1

            session.commit()

        self._update_cache_entry(speaker_id, embedding)

    _EMA_ALPHA = 0.15

    def _update_cache_entry(self, speaker_id: int, new_embedding: np.ndarray) -> None:
        """Update the cached mean embedding using exponential moving average."""
        new_norm = np.linalg.norm(new_embedding)
        if new_norm == 0:
            return
        new_unit = (new_embedding / new_norm).astype(np.float32)
        alpha = self._EMA_ALPHA

        for i, (sid, sname, mean_emb) in enumerate(self._cache):
            if sid == speaker_id:
                combined = (1.0 - alpha) * mean_emb + alpha * new_unit
                norm = np.linalg.norm(combined)
                if norm > 0:
                    combined = combined / norm
                self._cache[i] = (sid, sname, combined.astype(np.float32))
                return

    def identify_or_create(
        self, embedding: np.ndarray, audio_duration: float = 0.0
    ) -> SpeakerMatch:
        """Identify an existing speaker or create a new one.

        This is the main entry point for real-time speaker identification.
        """
        match = self.find_speaker(embedding)
        if match is not None:
            self.add_voiceprint_sample(match.speaker_id, embedding, audio_duration)
            return match

        if self._auto_create:
            return self.register_speaker(embedding, audio_duration=audio_duration)

        return SpeakerMatch(speaker_id=-1, speaker_name="未知", confidence=0.0)

    def get_all_speakers(self) -> list[dict[str, Any]]:
        """Return all active speakers (for API/management)."""
        with get_session() as session:
            profiles = list(
                session.exec(
                    select(SpeakerProfile).where(
                        col(SpeakerProfile.is_active).is_(True),
                        col(SpeakerProfile.deleted_at).is_(None),
                    )
                ).all()
            )
            return [
                {
                    "id": p.id,
                    "name": p.name,
                    "description": p.description,
                    "sample_count": p.sample_count,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in profiles
            ]

    def rename_speaker(self, speaker_id: int, new_name: str) -> bool:
        """Rename a speaker profile."""
        with get_session() as session:
            profile = session.get(SpeakerProfile, speaker_id)
            if not profile:
                return False
            profile.name = new_name
            session.commit()

        for i, (sid, _, mean_emb) in enumerate(self._cache):
            if sid == speaker_id:
                self._cache[i] = (sid, new_name, mean_emb)
                break
        return True
