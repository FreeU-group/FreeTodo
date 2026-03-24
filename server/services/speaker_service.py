"""Speaker voiceprint store and identification helpers.

`VoiceprintStore` provides persistent speaker voiceprint storage and
cross-session re-identification with an in-memory cache.
"""

from __future__ import annotations

import base64
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from sqlmodel import select

from storage import get_session
from storage.models import SpeakerProfile, SpeakerVoiceprint
from storage.sql_utils import col
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

CacheEntry = tuple[int, str, np.ndarray, bool, int]


@dataclass
class SpeakerMatch:
    """Result of a speaker identification attempt."""

    speaker_id: int
    speaker_name: str
    confidence: float
    is_new: bool = False
    is_me: bool = False
    overlap_speakers: list[dict[str, Any]] | None = None


def _embedding_to_base64(embedding: np.ndarray) -> str:
    emb = np.asarray(embedding, dtype=np.float32)
    return base64.b64encode(emb.tobytes()).decode("ascii")


def _base64_to_embedding(b64: str, expected_dim: int | None = None) -> np.ndarray:
    raw = base64.b64decode(b64)
    emb = np.frombuffer(raw, dtype=np.float32)
    if expected_dim is not None and emb.size != expected_dim:
        raise ValueError(f"embedding dim mismatch: expected={expected_dim}, got={emb.size}")
    return emb.astype(np.float32, copy=False)


class VoiceprintStore:
    """Manages persistent voiceprints with an in-memory retrieval cache."""

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
        self._me_similarity_threshold: float = float(
            cfg.get("me_similarity_threshold", min(0.95, self._similarity_threshold + 0.08))
        )
        self._prioritize_me_first: bool = bool(cfg.get("prioritize_me_first", True))
        self._me_margin_vs_others: float = float(cfg.get("me_margin_vs_others", 0.03))

        self._max_speakers: int = int(cfg.get("max_speakers", 100))
        self._auto_create: bool = bool(cfg.get("auto_create_speaker", True))
        self._update_voiceprint: bool = bool(cfg.get("update_voiceprint", True))
        self._max_samples: int = int(cfg.get("max_samples_per_speaker", 10))

        # Hold ambiguous top1 matches unless score is very high.
        self._similarity_margin: float = float(cfg.get("similarity_margin", 0.04))
        self._similarity_high_confidence: float = float(
            cfg.get("similarity_high_confidence", min(0.95, self._similarity_threshold + 0.12))
        )

        # (speaker_id, speaker_name, mean_embedding, is_me, embedding_dim)
        self._cache: list[CacheEntry] = []
        self._cache_loaded = False

    def _speaker_count_in_cache(self) -> int:
        return len({sid for sid, *_ in self._cache})

    def _ensure_cache(self) -> None:
        """Load all voiceprints from DB into memory once."""
        if self._cache_loaded:
            return
        with self._lock:
            if self._cache_loaded:
                return
            self._reload_cache_from_db()
            self._cache_loaded = True

    def _voiceprint_weight(self, *, audio_duration: float, quality_score: float | None) -> float:
        """Estimate sample reliability for weighted centroid aggregation."""
        duration = max(0.0, float(audio_duration or 0.0))
        inferred_quality = min(duration / 5.0, 1.0)
        quality = inferred_quality if quality_score is None else float(quality_score)
        quality = min(max(quality, 0.0), 1.0)

        # Prefer cleaner and longer samples without fully discarding short speech.
        duration_weight = min(max(duration / 2.5, 0.35), 1.0)
        quality_weight = min(max(quality, 0.2), 1.0)
        return float(duration_weight * quality_weight)

    def _compute_weighted_centroid(self, samples: list[tuple[np.ndarray, float]]) -> np.ndarray | None:
        if not samples:
            return None
        normalized_samples: list[np.ndarray] = []
        weights: list[float] = []
        for emb, weight in samples:
            norm = float(np.linalg.norm(emb))
            if norm <= 0:
                continue
            normalized_samples.append((emb / norm).astype(np.float32))
            weights.append(max(1e-6, float(weight)))

        if not normalized_samples:
            return None

        stacked = np.stack(normalized_samples, axis=0)
        centroid = np.average(stacked, axis=0, weights=np.asarray(weights, dtype=np.float32))
        centroid = centroid.astype(np.float32)
        norm = float(np.linalg.norm(centroid))
        if norm <= 0:
            return None
        return (centroid / norm).astype(np.float32)

    def _reload_cache_from_db(self) -> None:
        """Rebuild the in-memory cache from DB."""
        cache: list[CacheEntry] = []
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
                            select(SpeakerVoiceprint)
                            .where(
                                col(SpeakerVoiceprint.speaker_profile_id) == profile.id,
                                col(SpeakerVoiceprint.deleted_at).is_(None),
                            )
                            .order_by(col(SpeakerVoiceprint.created_at).desc())
                        ).all()
                    )
                    if not voiceprints:
                        continue

                    # Keep separate centroids for each embedding dimension.
                    by_dim_samples: dict[int, list[tuple[np.ndarray, float]]] = {}

                    for vp in voiceprints:
                        expected_dim = int(vp.embedding_dim or 0) or None
                        try:
                            emb = _base64_to_embedding(vp.embedding, expected_dim=expected_dim)
                        except Exception as e:
                            logger.warning("Skip invalid speaker voiceprint %s: %s", vp.id, e)
                            continue

                        emb_dim = int(emb.shape[0])
                        weight = self._voiceprint_weight(
                            audio_duration=float(vp.audio_duration or 0.0),
                            quality_score=vp.quality_score,
                        )
                        by_dim_samples.setdefault(emb_dim, []).append((emb, weight))

                    for emb_dim, samples in by_dim_samples.items():
                        # Favor recent samples while preserving robustness.
                        recent = samples[: self._max_samples]
                        centroid = self._compute_weighted_centroid(recent)
                        if centroid is None:
                            continue
                        cache.append((profile.id, profile.name, centroid, bool(profile.is_me), emb_dim))

        except Exception as e:
            logger.error("Failed to load voiceprint cache: %s", e)

        self._cache = cache
        logger.info(
            "Voiceprint cache loaded: speakers=%d entries=%d",
            self._speaker_count_in_cache(),
            len(cache),
        )

    def reload_cache(self) -> None:
        """Force-reload the in-memory cache (e.g. after manual DB edits)."""
        with self._lock:
            self._reload_cache_from_db()
            self._cache_loaded = True

    def _score_cache(
        self, query: np.ndarray
    ) -> tuple[int, str, float, float, bool, int, str, float, float]:
        """Score query against cached speakers of the same embedding dimension.

        Returns:
            (best_id, best_name, best_score, second_score, best_is_me,
             best_me_id, best_me_name, best_me_score, best_other_score)
        """
        query_dim = int(query.shape[0])

        best_id = -1
        best_name = ""
        best_score = -1.0
        second_score = -1.0
        best_is_me = False

        best_me_id = -1
        best_me_name = ""
        best_me_score = -1.0
        best_other_score = -1.0

        for sid, sname, mean_emb, s_is_me, emb_dim in self._cache:
            if emb_dim != query_dim:
                continue

            score = float(np.dot(query, mean_emb))
            if score > best_score:
                second_score = best_score
                best_score = score
                best_id = sid
                best_name = sname
                best_is_me = s_is_me
            elif score > second_score:
                second_score = score

            if s_is_me:
                if score > best_me_score:
                    best_me_score = score
                    best_me_id = sid
                    best_me_name = sname
            elif score > best_other_score:
                best_other_score = score

        return (
            best_id,
            best_name,
            best_score,
            second_score,
            best_is_me,
            best_me_id,
            best_me_name,
            best_me_score,
            best_other_score,
        )

    def find_speaker(self, embedding: np.ndarray) -> SpeakerMatch | None:  # noqa: PLR0911
        """Find the best-matching speaker for the given embedding."""
        self._ensure_cache()
        if not self._cache:
            return None

        emb_norm = float(np.linalg.norm(embedding))
        if emb_norm <= 0:
            return None
        query = (embedding / emb_norm).astype(np.float32)

        (
            best_id,
            best_name,
            best_score,
            second_score,
            best_is_me,
            best_me_id,
            best_me_name,
            best_me_score,
            best_other_score,
        ) = self._score_cache(query)

        if best_id <= 0:
            logger.debug(
                "No speaker candidate for embedding_dim=%d (cache_entries=%d)",
                int(query.shape[0]),
                len(self._cache),
            )
            return None

        # Stage 1: explicit "me vs others" verification (priority path).
        if self._prioritize_me_first and best_me_id > 0:
            me_pass = best_me_score >= self._me_similarity_threshold
            margin_pass = best_other_score < 0 or (
                best_me_score - best_other_score >= self._me_margin_vs_others
            )
            if me_pass and margin_pass:
                return SpeakerMatch(
                    speaker_id=best_me_id,
                    speaker_name=best_me_name,
                    confidence=best_me_score,
                    is_me=True,
                )

        # Ambiguous top1/top2 can cause rapid speaker flips.
        if second_score >= 0:
            margin = best_score - second_score
            if (
                margin < self._similarity_margin
                and best_score < self._similarity_high_confidence
            ):
                logger.debug(
                    "Ambiguous speaker match held: best=%s score=%.3f second=%.3f margin=%.3f",
                    best_name,
                    best_score,
                    second_score,
                    margin,
                )
                return None

        # Stage 2: regular multi-speaker retrieval.
        threshold = self._similarity_threshold
        if best_is_me:
            threshold = max(threshold, self._me_similarity_threshold)

        if best_score >= threshold:
            return SpeakerMatch(
                speaker_id=best_id,
                speaker_name=best_name,
                confidence=best_score,
                is_me=best_is_me,
            )
        return None

    def register_speaker(
        self, embedding: np.ndarray, name: str | None = None, audio_duration: float = 0.0
    ) -> SpeakerMatch:
        """Create a new speaker profile and store the first voiceprint."""
        self._ensure_cache()
        speaker_count = self._speaker_count_in_cache()
        if speaker_count >= self._max_speakers:
            raise RuntimeError(f"Voiceprint store reached limit ({self._max_speakers})")

        emb_b64 = _embedding_to_base64(embedding)
        emb_dim = int(embedding.shape[0])

        with get_session() as session:
            next_number = speaker_count + 1
            profile = SpeakerProfile(
                name=name or f"说话人{next_number}",
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
                embedding_dim=emb_dim,
                audio_duration=audio_duration,
                quality_score=min(audio_duration / 5.0, 1.0),
            )
            session.add(voiceprint)
            session.commit()

            norm_emb = embedding / (np.linalg.norm(embedding) or 1.0)
            self._cache.append(
                (profile.id, profile.name, norm_emb.astype(np.float32), False, emb_dim)
            )

            logger.info("Created new speaker id=%s name=%s", profile.id, profile.name)
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
            existing_samples = list(
                session.exec(
                    select(SpeakerVoiceprint).where(
                        col(SpeakerVoiceprint.speaker_profile_id) == speaker_id,
                        col(SpeakerVoiceprint.deleted_at).is_(None),
                    )
                ).all()
            )
            if len(existing_samples) >= self._max_samples:
                return

            voiceprint = SpeakerVoiceprint(
                speaker_profile_id=speaker_id,
                embedding=_embedding_to_base64(embedding),
                embedding_dim=int(embedding.shape[0]),
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
        """Update cached centroid using exponential moving average."""
        new_norm = float(np.linalg.norm(new_embedding))
        if new_norm <= 0:
            return

        target_dim = int(new_embedding.shape[0])
        new_unit = (new_embedding / new_norm).astype(np.float32)
        alpha = self._EMA_ALPHA

        speaker_meta: tuple[str, bool] | None = None
        for i, (sid, sname, mean_emb, s_is_me, emb_dim) in enumerate(self._cache):
            if sid != speaker_id:
                continue
            if speaker_meta is None:
                speaker_meta = (sname, s_is_me)
            if emb_dim != target_dim:
                continue

            combined = (1.0 - alpha) * mean_emb + alpha * new_unit
            norm = float(np.linalg.norm(combined))
            if norm > 0:
                combined = combined / norm
            self._cache[i] = (sid, sname, combined.astype(np.float32), s_is_me, emb_dim)
            return

        # Speaker exists but this dimension has no cached centroid yet.
        if speaker_meta is not None:
            sname, s_is_me = speaker_meta
            self._cache.append((speaker_id, sname, new_unit, s_is_me, target_dim))

    def identify_or_create(
        self, embedding: np.ndarray, audio_duration: float = 0.0
    ) -> SpeakerMatch:
        """Identify an existing speaker or create a new one."""
        match = self.find_speaker(embedding)
        if match is not None:
            self.add_voiceprint_sample(match.speaker_id, embedding, audio_duration)
            return match

        if self._auto_create:
            return self.register_speaker(embedding, audio_duration=audio_duration)

        return SpeakerMatch(speaker_id=-1, speaker_name="未知", confidence=0.0)

    def get_all_speakers(self) -> list[dict[str, Any]]:
        """Return all active speakers for API/management."""
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
                    "is_me": bool(p.is_me),
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in profiles
            ]

    def clear_all(self) -> int:
        """Soft-delete all speakers and voiceprints; returns removed speaker count."""
        from util.time_utils import get_utc_now  # noqa: PLC0415

        now = get_utc_now()
        count = 0
        with get_session() as session:
            profiles = list(
                session.exec(
                    select(SpeakerProfile).where(col(SpeakerProfile.deleted_at).is_(None))
                ).all()
            )
            for profile in profiles:
                profile.deleted_at = now
                profile.is_active = False
                count += 1

            voiceprints = list(
                session.exec(
                    select(SpeakerVoiceprint).where(col(SpeakerVoiceprint.deleted_at).is_(None))
                ).all()
            )
            for voiceprint in voiceprints:
                voiceprint.deleted_at = now

            session.commit()

        with self._lock:
            self._cache.clear()

        logger.info("All speakers cleared: %d", count)
        return count

    def set_as_me(self, speaker_id: int) -> bool:
        """Mark one speaker as 'me'. Only one speaker can be me at a time."""
        with get_session() as session:
            current_me = list(
                session.exec(
                    select(SpeakerProfile).where(
                        col(SpeakerProfile.is_me).is_(True),
                        col(SpeakerProfile.deleted_at).is_(None),
                    )
                ).all()
            )
            for profile in current_me:
                profile.is_me = False

            target = session.get(SpeakerProfile, speaker_id)
            if not target or target.deleted_at is not None:
                return False
            target.is_me = True
            session.commit()

        for i, (sid, sname, mean_emb, _old_me, emb_dim) in enumerate(self._cache):
            self._cache[i] = (sid, sname, mean_emb, sid == speaker_id, emb_dim)

        logger.info("Speaker %s marked as me", speaker_id)
        return True

    def rename_speaker(self, speaker_id: int, new_name: str) -> bool:
        """Rename a speaker profile."""
        with get_session() as session:
            profile = session.get(SpeakerProfile, speaker_id)
            if not profile:
                return False
            profile.name = new_name
            session.commit()

        for i, (sid, _name, mean_emb, s_is_me, emb_dim) in enumerate(self._cache):
            if sid == speaker_id:
                self._cache[i] = (sid, new_name, mean_emb, s_is_me, emb_dim)
        return True
