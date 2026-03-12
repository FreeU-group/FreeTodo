from __future__ import annotations

import array
import struct


def pcm16le_to_wav(
    pcm_data: bytes,
    *,
    sample_rate: int = 16000,
    num_channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes:
    """Wrap raw PCM16LE bytes into WAV container bytes."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_data)

    fmt_chunk_size = 16
    riff_chunk_size = 4 + (8 + fmt_chunk_size) + (8 + data_size)

    header = b"RIFF"
    header += struct.pack("<I", riff_chunk_size)
    header += b"WAVE"

    header += b"fmt "
    header += struct.pack(
        "<IHHIIHH",
        fmt_chunk_size,
        1,  # PCM
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
    )

    header += b"data"
    header += struct.pack("<I", data_size)
    return header + pcm_data


def apply_agc_to_pcm(  # noqa: C901, PLR0913
    logger,
    pcm_bytes: bytes,
    *,
    log_stats: bool = True,
    warn_silence: bool = True,
    silence_max_abs: int = 50,
    silence_rms: float = 20,
    max_gain: float = 4.0,
    apply_threshold_gain: float = 1.05,
    target_peak_ratio: float = 0.85,
) -> bytes:
    """Peak-based AGC (V1)."""
    int16_max = 32767
    int16_min = -32768
    try:
        samples = array.array("h")
        samples.frombytes(pcm_bytes)
        if not samples:
            return pcm_bytes

        max_abs = max(abs(s) for s in samples)
        rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
        if log_stats:
            logger.info(f"录音原始PCM: samples={len(samples)}, max_abs={max_abs}, rms={rms:.2f}")

        if max_abs < silence_max_abs and rms < silence_rms:
            if warn_silence:
                logger.warning("录音PCM振幅极低，可能无声；请检查麦克风/权限/设备输入。")
            return pcm_bytes

        target_peak = target_peak_ratio * int16_max
        gain = target_peak / max_abs if max_abs > 0 else 1.0
        gain = min(gain, max_gain)
        if gain <= apply_threshold_gain:
            return pcm_bytes

        if log_stats:
            logger.info(f"应用自动增益: x{gain:.2f}")

        for i in range(len(samples)):
            v = int(samples[i] * gain)
            if v > int16_max:
                v = int16_max
            elif v < int16_min:
                v = int16_min
            samples[i] = v
        return samples.tobytes()
    except Exception as e:
        logger.debug(f"音量检测失败: {e}")
        return pcm_bytes
