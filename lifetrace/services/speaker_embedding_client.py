"""Speaker embedding extraction using FunASR CAM++ model.

Provides a lazy-loaded singleton that extracts 192-dim speaker embeddings
from raw PCM audio.  The ``funasr`` package is an optional dependency; if
it is not installed the client reports itself as unavailable and all calls
to ``extract_embedding`` raise ``RuntimeError``.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import numpy as np

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()

_funasr_available_cache: dict[str, bool] = {}


def _check_funasr() -> bool:
    if "result" not in _funasr_available_cache:
        try:
            import funasr  # noqa: F401, PLC0415  # type: ignore[import-not-found]

            _funasr_available_cache["result"] = True
        except ImportError:
            _funasr_available_cache["result"] = False
            logger.warning(
                "funasr 未安装，说话人识别功能不可用。安装方法: pip install funasr modelscope"
            )
    return _funasr_available_cache["result"]


class SpeakerEmbeddingClient:
    """Extracts speaker embeddings via the local FunASR CAM++ model.

    The model is loaded lazily on first call to ``extract_embedding``.
    Thread-safe: the heavy model object is guarded by a lock.
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
        self._available = _check_funasr()

        cfg = settings.get("audio.speaker", {}) or {}
        self._model_name: str = cfg.get("model", "iic/speech_campplus_sv_zh-cn_16k-common")
        self._device: str = cfg.get("device", "cpu")
        self._embedding_dim: int = int(cfg.get("embedding_dim", 192))

    @property
    def available(self) -> bool:
        return self._available

    @property
    def embedding_dim(self) -> int:
        return self._embedding_dim

    def _ensure_model(self) -> Any:
        """Load the CAM++ model if not yet loaded (thread-safe)."""
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            if not self._available:
                raise RuntimeError("funasr 未安装，无法加载 CAM++ 模型")
            from funasr import AutoModel  # noqa: PLC0415  # type: ignore[import-not-found]

            logger.info(f"正在加载 CAM++ 说话人模型: {self._model_name} (device={self._device})")
            self._model = AutoModel(model=self._model_name, device=self._device)
            logger.info("CAM++ 说话人模型加载完成")
            return self._model

    def extract_embedding(self, pcm_bytes: bytes, sample_rate: int = 16000) -> np.ndarray:
        """Extract a speaker embedding from raw PCM-16LE mono audio.

        Args:
            pcm_bytes: Raw PCM audio bytes (16-bit signed LE, mono).
            sample_rate: Sample rate in Hz (must match the model expectation).

        Returns:
            1-D numpy float32 array of shape ``(embedding_dim,)``.

        Raises:
            RuntimeError: If funasr is not installed or model load fails.
            ValueError: If the audio is too short (< 0.5 s).
        """
        min_samples = sample_rate // 2  # 0.5 seconds minimum
        num_samples = len(pcm_bytes) // 2
        if num_samples < min_samples:
            raise ValueError(
                f"音频太短: {num_samples} 采样 ({num_samples / sample_rate:.2f}s), "
                f"最少需要 {min_samples} 采样 ({min_samples / sample_rate:.2f}s)"
            )

        model = self._ensure_model()

        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        result = model.generate(input=samples, output_dir=None, granularity="utterance")

        embedding = self._parse_embedding(result)
        return embedding

    async def extract_embedding_async(
        self, pcm_bytes: bytes, sample_rate: int = 16000
    ) -> np.ndarray:
        """Async wrapper – runs extraction in a thread pool."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.extract_embedding, pcm_bytes, sample_rate)

    def _parse_embedding(self, result: Any) -> np.ndarray:
        """Parse the model output into a 1-D numpy array."""
        try:
            if isinstance(result, list) and len(result) > 0:
                item = result[0]
                if isinstance(item, dict):
                    emb = item.get("spk_embedding")
                    if emb is None:
                        raise KeyError("spk_embedding not found in model output")
                    return self._to_numpy(emb)
                return self._to_numpy(item)
            return self._to_numpy(result)
        except Exception as e:
            raise RuntimeError(f"无法解析 CAM++ 模型输出: {e}") from e

    def _to_numpy(self, obj: Any) -> np.ndarray:
        """Convert torch.Tensor or numpy array to a flat float32 numpy array."""
        try:
            import torch  # noqa: PLC0415

            if isinstance(obj, torch.Tensor):
                obj = obj.detach().cpu().numpy()
        except ImportError:
            pass
        arr = np.asarray(obj, dtype=np.float32).flatten()
        if arr.shape[0] != self._embedding_dim:
            logger.warning(f"Embedding 维度不匹配: 期望 {self._embedding_dim}, 实际 {arr.shape[0]}")
        return arr

    def reinitialize(self) -> None:
        """Reload configuration (for hot-reload)."""
        with self._lock:
            self._model = None
        cfg = settings.get("audio.speaker", {}) or {}
        self._model_name = cfg.get("model", "iic/speech_campplus_sv_zh-cn_16k-common")
        self._device = cfg.get("device", "cpu")
        self._embedding_dim = int(cfg.get("embedding_dim", 192))
        self._available = _check_funasr()
        logger.info("SpeakerEmbeddingClient 已重新初始化")
