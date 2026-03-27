"""Audio decoder helpers for the omi-compatible listen websocket."""

from __future__ import annotations

import ctypes.util
import os
import sys

from util.logging_config import get_logger

logger = get_logger()

opuslib = None
_opus_available = False


def _patch_find_library_for_homebrew():
    """Patch ``find_library`` to search common Homebrew lib paths on macOS."""
    if sys.platform != "darwin":
        return ctypes.util.find_library

    original = ctypes.util.find_library

    def _find_library_homebrew(name: str) -> str | None:
        result = original(name)
        if result is None:
            for prefix in ("/opt/homebrew/lib", "/usr/local/lib"):
                candidate = os.path.join(prefix, f"lib{name}.dylib")
                if os.path.isfile(candidate):
                    return candidate
        return result

    ctypes.util.find_library = _find_library_homebrew
    return original


_orig_find_library = _patch_find_library_for_homebrew()
try:
    import opuslib  # type: ignore[import-untyped]

    _opus_available = True
except (ImportError, Exception):
    try:
        import pyogg  # type: ignore[import-untyped]

        pyogg_dir = os.path.dirname(pyogg.__file__)
        if pyogg_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = pyogg_dir + os.pathsep + os.environ.get("PATH", "")
            if sys.platform == "win32":
                os.add_dll_directory(pyogg_dir)
        import opuslib  # type: ignore[import-untyped]

        _opus_available = True
    except Exception:
        logger.warning("opuslib unavailable - Opus audio decoding disabled")
finally:
    ctypes.util.find_library = _orig_find_library


class _OpusDecoder:
    """Thin wrapper around ``opuslib`` for 16 kHz mono Opus frames."""

    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        if not _opus_available or opuslib is None:
            raise RuntimeError("opuslib is not installed - run: pip install opuslib")
        self._dec = opuslib.Decoder(sample_rate, channels)
        self._frame_size = sample_rate // 50

    def decode(self, data: bytes) -> bytes:
        """Decode one Opus packet to PCM-16 LE bytes."""
        return self._dec.decode(data, self._frame_size)


def _pcm8_to_pcm16(data: bytes) -> bytes:
    """Up-sample 8 kHz PCM-16 LE to 16 kHz by simple sample doubling."""
    import array

    samples = array.array("h")
    samples.frombytes(data)
    out = array.array("h")
    for sample in samples:
        out.append(sample)
        out.append(sample)
    return out.tobytes()


def build_decoder(codec: str, sample_rate: int):
    """Return ``(decode_fn, effective_sample_rate)`` for the input codec."""
    if codec in ("opus", "opus_fs320"):
        decoder = _OpusDecoder(sample_rate=sample_rate)
        return decoder.decode, sample_rate

    if codec == "pcm8":
        return _pcm8_to_pcm16, 16000

    return None, sample_rate
