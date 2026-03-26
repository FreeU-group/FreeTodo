"""Event builders for the omi-compatible listen websocket."""

from __future__ import annotations


def build_transcript_event(session_id: str, segments: list[dict]) -> dict:
    return {
        "type": "transcript",
        "session_id": session_id,
        "segments": segments,
    }


def build_segment_dict(
    idx: int,
    text: str,
    start: float,
    end: float,
    *,
    is_user: bool = True,
    speaker_id: str = "SPEAKER_00",
) -> dict:
    return {
        "id": idx,
        "text": text,
        "speaker_id": speaker_id,
        "is_user": is_user,
        "person_id": None,
        "start": round(start, 2),
        "end": round(end, 2),
    }


def build_refined_transcript_event(session_id: str, segments: list[dict]) -> dict:
    return {
        "type": "transcript_refined",
        "session_id": session_id,
        "segments": segments,
    }


def build_last_conversation_event(session_id: str) -> dict:
    return {
        "type": "last_conversation",
        "conversation_id": session_id,
    }
