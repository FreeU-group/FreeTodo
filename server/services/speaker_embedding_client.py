"""Speaker embedding extraction with pluggable backends.

Supported backends:
- ``campplus``: FunASR CAM++ (Chinese-friendly, lightweight).
- ``speechbrain_ecapa``: SpeechBrain ECAPA-TDNN (strong general SV baseline).
- ``auto``: prefer ECAPA when installed, otherwise CAM++.
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import threading
from typing import Any

import numpy as np

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()
TARGET_SAMPLE_RATE = 16000

_availability_cache: dict[str, bool] = {}


def _check_module(module_name: str, *, cache_key: str, install_hint: str) -> bool:
    if cache_key not in _availability_cache:
        try:
            __import__(module_name)
            _availability_cache[cache_key] = True
        except ImportError:
            _availability_cache[cache_key] = False
            logger.warning("%s not installed. %s", module_name, install_hint)
    return _availability_cache[cache_key]


def _check_funasr() -> bool:
    return _check_module(
        "funasr",
        cache_key="funasr",
        install_hint="Install with: pip install funasr modelscope",
    )


def _check_speechbrain() -> bool:
    return _check_module(
        "speechbrain",
        cache_key="speechbrain",
        install_hint="Install with: pip install speechbrain",
    )


def _check_pyannote() -> bool:
    return _check_module(
        "pyannote.audio",
        cache_key="pyannote_audio",
        install_hint="Install with: pip install pyannote.audio",
    )


def _ensure_hf_hub_compat() -> None:
    """Backwards compat for libs still passing `use_auth_token`."""
    with contextlib.suppress(Exception):
        import huggingface_hub  # noqa: PLC0415

        hf_hub_download = getattr(huggingface_hub, "hf_hub_download", None)
        if hf_hub_download is None:
            return
        sig = inspect.signature(hf_hub_download)
        if "use_auth_token" in sig.parameters:
            return

        original = hf_hub_download

        def _compat_hf_hub_download(*args: Any, **kwargs: Any) -> Any:
            use_auth_token = kwargs.pop("use_auth_token", None)
            if kwargs.get("token") is None and use_auth_token is not None:
                kwargs["token"] = use_auth_token
            try:
                return original(*args, **kwargs)
            except Exception:
                repo_id = kwargs.get("repo_id") if "repo_id" in kwargs else (args[0] if args else "")
                filename = (
                    kwargs.get("filename")
                    if "filename" in kwargs
                    else (args[1] if len(args) > 1 else "")
                )
                if str(filename) == "custom.py" and str(repo_id).startswith("speechbrain/"):
                    import tempfile  # noqa: PLC0415
                    from pathlib import Path  # noqa: PLC0415

                    placeholder = Path(tempfile.gettempdir()) / "speechbrain_empty_custom.py"
                    if not placeholder.exists():
                        placeholder.write_text("# placeholder custom module\n", encoding="utf-8")
                    logger.warning(
                        f"HuggingFace repo {repo_id} missing custom.py; "
                        "using placeholder module"
                    )
                    return str(placeholder)
                raise

        huggingface_hub.hf_hub_download = _compat_hf_hub_download  # type: ignore[attr-defined]

        with contextlib.suppress(Exception):
            import huggingface_hub.file_download as _fd  # noqa: PLC0415

            _fd.hf_hub_download = _compat_hf_hub_download  # type: ignore[attr-defined]


class SpeakerEmbeddingClient:
    """Extracts speaker embeddings from raw PCM audio.

    The backend is configurable by ``audio.speaker.embedding_backend``:
    ``campplus`` | ``speechbrain_ecapa`` | ``pyannote_embedding`` | ``auto``.
    """

    _instance: SpeakerEmbeddingClient | None = None
    _initialized: bool = False

    def __new__(cls) -> SpeakerEmbeddingClient:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if SpeakerEmbeddingClient._initialized:
            return
        SpeakerEmbeddingClient._initialized = True

        self._model: Any = None
        self._lock = threading.Lock()

        cfg = settings.get("audio.speaker", {}) or {}
        requested_backend = str(cfg.get("embedding_backend", "campplus")).strip().lower()
        self._backend = self._resolve_backend(requested_backend)
        self._campplus_model_name: str = cfg.get(
            "model", "iic/speech_campplus_sv_zh-cn_16k-common"
        )
        self._speechbrain_model_name: str = cfg.get(
            "speechbrain_model", "speechbrain/spkrec-ecapa-voxceleb"
        )
        self._pyannote_model_name: str = cfg.get("pyannote_embedding_model", "pyannote/embedding")
        self._device: str = str(cfg.get("device", "cpu"))
        self._embedding_dim: int = int(cfg.get("embedding_dim", 192))
        self._normalize_embedding: bool = bool(cfg.get("normalize_embedding", True))
        self._available = self._check_backend_available(self._backend)

    @property
    def available(self) -> bool:
        return self._available

    @property
    def embedding_dim(self) -> int:
        return self._embedding_dim

    @property
    def backend(self) -> str:
        return self._backend

    def _resolve_backend(self, requested: str) -> str:
        if requested == "auto":
            if _check_speechbrain():
                return "speechbrain_ecapa"
            return "campplus"
        if requested in {"campplus", "speechbrain_ecapa", "pyannote_embedding"}:
            return requested
        logger.warning("Unknown embedding backend %r; fallback to campplus", requested)
        return "campplus"

    def _check_backend_available(self, backend: str) -> bool:
        if backend == "pyannote_embedding":
            return _check_pyannote()
        if backend == "speechbrain_ecapa":
            return _check_speechbrain()
        return _check_funasr()

    def _fallback_to_campplus(self, reason: str) -> Any:
        if _check_funasr():
            logger.warning(f"{reason}; fallback to CAM++ model")
            self._backend = "campplus"
            return self._load_campplus_model()
        raise RuntimeError(f"{reason}; CAM++ unavailable")

    def _ensure_model(self) -> Any:
        """Load embedding model lazily (thread-safe)."""
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            if not self._available:
                raise RuntimeError(f"Embedding backend not available: {self._backend}")
            if self._backend == "campplus":
                self._model = self._load_campplus_model()
                return self._model
            if self._backend == "speechbrain_ecapa":
                try:
                    self._model = self._load_speechbrain_model()
                except Exception as e:
                    logger.warning(f"SpeechBrain backend load failed: {e}")
                    self._model = self._fallback_to_campplus("SpeechBrain load failed")
                return self._model
            if self._backend == "pyannote_embedding":
                try:
                    self._model = self._load_pyannote_model()
                except Exception as e:
                    logger.warning(f"Pyannote embedding backend load failed: {e}")
                    self._model = self._fallback_to_campplus("Pyannote load failed")
                return self._model

            self._model = self._fallback_to_campplus(
                f"Unsupported embedding backend: {self._backend}"
            )
            return self._model

    def _load_campplus_model(self) -> Any:
        from funasr import AutoModel  # noqa: PLC0415  # type: ignore[import-not-found]

        logger.info(
            f"Loading speaker embedding model: CAM++ ({self._campplus_model_name}, "
            f"device={self._device})"
        )
        model = AutoModel(
            model=self._campplus_model_name,
            device=self._device,
            disable_pbar=True,
            disable_log=True,
            disable_update=True,
            log_level="ERROR",
        )
        logger.info("CAM++ speaker embedding model ready")
        return model

    def _load_speechbrain_model(self) -> Any:
        from speechbrain.inference.speaker import (  # noqa: PLC0415
            EncoderClassifier,
        )
        _ensure_hf_hub_compat()

        logger.info(
            f"Loading speaker embedding model: SpeechBrain ECAPA ({self._speechbrain_model_name}, "
            f"device={self._device})"
        )
        model = EncoderClassifier.from_hparams(
            source=self._speechbrain_model_name,
            run_opts={"device": self._device},
        )
        logger.info("SpeechBrain ECAPA model ready")
        return model

    def _load_pyannote_model(self) -> Any:
        _ensure_hf_hub_compat()
        import torch  # noqa: PLC0415
        from pyannote.audio import Inference, Model  # noqa: PLC0415

        logger.info(
            f"Loading speaker embedding model: Pyannote ({self._pyannote_model_name}, "
            f"device={self._device})"
        )
        model = Model.from_pretrained(self._pyannote_model_name)
        inference = Inference(model, window="whole", device=torch.device(self._device))
        logger.info("Pyannote embedding model ready")
        return inference

    def extract_embedding(self, pcm_bytes: bytes, sample_rate: int = 16000) -> np.ndarray:
        """Extract a speaker embedding from PCM-16LE mono audio."""
        min_samples = sample_rate // 2  # 0.5 seconds minimum
        num_samples = len(pcm_bytes) // 2
        if num_samples < min_samples:
            raise ValueError(
                f"Audio too short: {num_samples} samples ({num_samples / sample_rate:.2f}s), "
                f"need >= {min_samples} ({min_samples / sample_rate:.2f}s)"
            )

        model = self._ensure_model()
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        if self._backend == "speechbrain_ecapa":
            embedding = self._extract_speechbrain_embedding(model, samples, sample_rate)
        elif self._backend == "pyannote_embedding":
            embedding = self._extract_pyannote_embedding(model, samples, sample_rate)
        else:
            result = model.generate(input=samples, output_dir=None, granularity="utterance")
            embedding = self._parse_campplus_embedding(result)

        if self._normalize_embedding:
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding = (embedding / norm).astype(np.float32)

        if embedding.shape[0] != self._embedding_dim:
            logger.warning(
                "Embedding dim mismatch: expected=%d actual=%d backend=%s",
                self._embedding_dim,
                embedding.shape[0],
                self._backend,
            )

        return embedding.astype(np.float32)

    def _extract_speechbrain_embedding(
        self, model: Any, samples: np.ndarray, sample_rate: int
    ) -> np.ndarray:
        import torch  # noqa: PLC0415
        import torchaudio  # noqa: PLC0415

        waveform = torch.from_numpy(samples).float().unsqueeze(0)  # [1, T]
        if sample_rate != TARGET_SAMPLE_RATE:
            waveform = torchaudio.functional.resample(
                waveform, sample_rate, TARGET_SAMPLE_RATE
            )
        lengths = torch.ones(1)

        with torch.no_grad():
            embedding = model.encode_batch(waveform, lengths)  # usually [1, 1, D]
        return np.asarray(embedding.detach().cpu().numpy(), dtype=np.float32).reshape(-1)

    def _extract_pyannote_embedding(
        self, model: Any, samples: np.ndarray, sample_rate: int
    ) -> np.ndarray:
        import torch  # noqa: PLC0415

        waveform = torch.from_numpy(samples).float().unsqueeze(0)  # [1, T]
        embedding = model({"waveform": waveform, "sample_rate": sample_rate})
        return np.asarray(embedding, dtype=np.float32).reshape(-1)

    async def extract_embedding_async(
        self, pcm_bytes: bytes, sample_rate: int = 16000
    ) -> np.ndarray:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.extract_embedding, pcm_bytes, sample_rate)

    def _parse_campplus_embedding(self, result: Any) -> np.ndarray:
        """Parse FunASR CAM++ output into a flat float32 array."""
        try:
            if isinstance(result, list) and result:
                item = result[0]
                if isinstance(item, dict):
                    emb = item.get("spk_embedding")
                    if emb is None:
                        raise KeyError("spk_embedding not found in CAM++ output")
                    return self._to_numpy(emb)
                return self._to_numpy(item)
            return self._to_numpy(result)
        except Exception as e:
            raise RuntimeError(f"Failed to parse CAM++ embedding output: {e}") from e

    def _to_numpy(self, obj: Any) -> np.ndarray:
        try:
            import torch  # noqa: PLC0415

            if isinstance(obj, torch.Tensor):
                obj = obj.detach().cpu().numpy()
        except ImportError:
            pass
        return np.asarray(obj, dtype=np.float32).flatten()

    def reinitialize(self) -> None:
        """Reload configuration and force lazy model reloading."""
        with self._lock:
            self._model = None

        cfg = settings.get("audio.speaker", {}) or {}
        requested_backend = str(cfg.get("embedding_backend", "campplus")).strip().lower()
        self._backend = self._resolve_backend(requested_backend)
        self._campplus_model_name = cfg.get("model", "iic/speech_campplus_sv_zh-cn_16k-common")
        self._speechbrain_model_name = cfg.get(
            "speechbrain_model", "speechbrain/spkrec-ecapa-voxceleb"
        )
        self._pyannote_model_name = cfg.get("pyannote_embedding_model", "pyannote/embedding")
        self._device = str(cfg.get("device", "cpu"))
        self._embedding_dim = int(cfg.get("embedding_dim", 192))
        self._normalize_embedding = bool(cfg.get("normalize_embedding", True))
        self._available = self._check_backend_available(self._backend)
        logger.info(f"SpeakerEmbeddingClient reinitialized (backend={self._backend})")
