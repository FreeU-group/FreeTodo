from __future__ import annotations

import re


def split_text_by_lines(*, text: str, max_chars: int) -> list[str]:  # noqa: C901
    """按行分块文本（不截断内容）。"""
    clean = (text or "").strip()
    if not clean:
        return []
    if max_chars <= 0:
        return [clean]

    lines = [line.strip() for line in clean.split("\n") if line.strip()]
    if not lines:
        return []

    chunks: list[str] = []
    buffer: list[str] = []
    buffer_chars = 0

    def flush() -> None:
        nonlocal buffer_chars
        if not buffer:
            return
        chunks.append("\n".join(buffer))
        buffer.clear()
        buffer_chars = 0

    for line in lines:
        if len(line) > max_chars:
            flush()
            for index in range(0, len(line), max_chars):
                segment = line[index : index + max_chars].strip()
                if segment:
                    chunks.append(segment)
            continue

        added = len(line) + (1 if buffer else 0)
        if buffer and buffer_chars + added > max_chars:
            flush()

        buffer.append(line)
        buffer_chars += len(line) + (1 if len(buffer) > 1 else 0)

    flush()
    return chunks


_PUNCT_SPLIT_RE = re.compile(r"(?<=[。！？!?；;，,])\s*")


def _split_long_line_by_punct(*, line: str, max_chars: int) -> list[str]:  # noqa: C901, PLR0912
    """超长单行按标点优先分割，必要时按字符硬切。"""
    clean = (line or "").strip()
    if not clean:
        return []
    if max_chars <= 0 or len(clean) <= max_chars:
        return [clean]

    parts = [part.strip() for part in _PUNCT_SPLIT_RE.split(clean) if part.strip()]
    if not parts:
        parts = [clean]

    output: list[str] = []
    buffer = ""
    for part in parts:
        if not buffer:
            if len(part) <= max_chars:
                buffer = part
                continue
            for index in range(0, len(part), max_chars):
                segment = part[index : index + max_chars].strip()
                if segment:
                    output.append(segment)
            continue

        separator = (
            "" if buffer.endswith(("。", "！", "？", "!", "?", "；", ";", "，", ",")) else " "
        )
        candidate = f"{buffer}{separator}{part}"
        if len(candidate) <= max_chars:
            buffer = candidate
            continue

        output.append(buffer)
        buffer = ""
        if len(part) <= max_chars:
            buffer = part
        else:
            for index in range(0, len(part), max_chars):
                segment = part[index : index + max_chars].strip()
                if segment:
                    output.append(segment)

    if buffer:
        output.append(buffer)

    return output


def chunk_transcription(  # noqa: C901
    *,
    text: str,
    max_chars: int,
    max_seconds: int = 0,
    segment_timestamps: list[float] | None = None,
) -> list[dict]:
    """按字符和时长约束对转录文本分块。"""
    clean = (text or "").strip()
    if not clean:
        return []
    max_chars = max(0, max_chars)

    lines = [line.strip() for line in clean.split("\n") if line.strip()]
    if not lines:
        return []

    timestamps = segment_timestamps or None
    if timestamps is not None and len(timestamps) != len(lines):
        timestamps = None

    chunks: list[dict] = []
    buffer_lines: list[str] = []
    start_index = 0

    def buffer_chars() -> int:
        if not buffer_lines:
            return 0
        return sum(len(line) for line in buffer_lines) + (len(buffer_lines) - 1)

    def buffer_time_ok(next_index: int) -> bool:
        if timestamps is None or max_seconds <= 0 or not buffer_lines:
            return True
        start_seconds = float(timestamps[start_index])
        end_seconds = float(timestamps[next_index])
        return (end_seconds - start_seconds) <= float(max_seconds)

    def flush(end_index: int) -> None:
        nonlocal start_index
        if not buffer_lines:
            return
        start_seconds = float(timestamps[start_index]) if timestamps is not None else None
        end_seconds = float(timestamps[end_index]) if timestamps is not None else None
        chunks.append(
            {
                "text": "\n".join(buffer_lines),
                "start_line": start_index + 1,
                "end_line": end_index + 1,
                "start_s": start_seconds,
                "end_s": end_seconds,
            }
        )
        buffer_lines.clear()
        start_index = end_index + 1

    index = 0
    while index < len(lines):
        line = lines[index]
        if max_chars > 0 and len(line) > max_chars:
            split_lines = _split_long_line_by_punct(line=line, max_chars=max_chars)
            lines = [*lines[:index], *split_lines, *lines[index + 1 :]]
            if timestamps is not None:
                t = timestamps[index]
                timestamps = [
                    *timestamps[:index],
                    *([t] * len(split_lines)),
                    *timestamps[index + 1 :],
                ]
            continue

        if max_chars > 0:
            added_chars = len(line) + (1 if buffer_lines else 0)
            if buffer_lines and (buffer_chars() + added_chars) > max_chars:
                flush(index - 1)
                continue

        if buffer_lines and not buffer_time_ok(index):
            flush(index - 1)
            continue

        if not buffer_lines:
            start_index = index
        buffer_lines.append(line)
        index += 1

    if buffer_lines:
        flush(len(lines) - 1)

    return chunks
