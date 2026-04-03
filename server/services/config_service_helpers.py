"""Shared constants and conversion helpers for config service."""

from __future__ import annotations

from typing import Any

from util.settings import settings

API_KEY_MASK = "sk-**********************************"

SENSITIVE_CONFIG_KEYS = frozenset(
    {
        "llm.api_key",
        "llm.agent.api_key",
        "dify.api_key",
        "tavily.api_key",
        "audio.asr.api_key",
        "banna2.api_key",
    }
)

INVALID_API_KEY_VALUES = frozenset(
    {
        "",
        "xxx",
        "YOUR_API_KEY_HERE",
        "YOUR_BASE_URL_HERE",
        "YOUR_LLM_KEY_HERE",
        "YOUR_TAVILY_API_KEY_HERE",
        "YOUR_GOOGLE_GEMINI_API_KEY_HERE",
    }
)

LLM_RELATED_BACKEND_KEYS = [
    "llm.api_key",
    "llm.base_url",
    "llm.model",
    "llm.small_model",
    "llm_api_key",
    "llm_base_url",
    "llm_model",
    "llm_small_model",
]

ASR_RELATED_BACKEND_KEYS = [
    "audio.asr.api_key",
    "audio.asr.base_url",
    "audio.asr.model",
    "audio_asr_api_key",
    "audio_asr_base_url",
    "audio_asr_model",
]

JOB_ENABLED_CONFIG_TO_JOB_ID = {
    "jobs.recorder.enabled": "recorder_job",
    "jobs.ocr.enabled": "ocr_job",
    "jobs.clean_data.enabled": "clean_data_job",
    "jobs.activity_aggregator.enabled": "activity_aggregator_job",
    "jobs.audio_recording.enabled": "audio_recording_job",
    "jobs.diary_illustration.enabled": "diary_illustration_job",
    "jobs_recorder_enabled": "recorder_job",
    "jobs_ocr_enabled": "ocr_job",
    "jobs_clean_data_enabled": "clean_data_job",
    "jobs_activity_aggregator_enabled": "activity_aggregator_job",
    "jobs_audio_recording_enabled": "audio_recording_job",
    "jobs_diary_illustration_enabled": "diary_illustration_job",
}

JOB_LINKED_CONFIG: dict[str, list[str]] = {}

_SIMPLE_PREFIX_MAP: dict[str, tuple[int, str]] = {
    "llm_": (4, "llm"),
    "server_": (7, "server"),
    "chat_": (5, "chat"),
    "tavily_": (7, "tavily"),
    "sensor_": (7, "sensor"),
    "banna2_": (7, "banna2"),
    "volcengine_": (11, "volcengine"),
    "setup_": (6, "setup"),
    "agno_": (5, "agno"),
}

_AGENT_LLM_KEY_MAPPING: dict[str, str] = {
    "llm_agent_api_key": "llm.agent.api_key",
    "llm_agent_base_url": "llm.agent.base_url",
    "llm_agent_model": "llm.agent.model",
    "perception_intent_model": "perception.todo_intent.agent.model",
}

_INTENT_SOURCE_KEY_MAPPING: dict[str, str] = {
    "intent_source_mic_pc": "perception.todo_intent.sources.mic_pc",
    "intent_source_mic_hardware": "perception.todo_intent.sources.mic_hardware",
    "intent_source_speaker_pc": "perception.todo_intent.sources.speaker_pc",
    "intent_source_ocr_screen": "perception.todo_intent.sources.ocr_screen",
    "intent_source_ocr_proactive": "perception.todo_intent.sources.ocr_proactive",
}

_ASR_KEY_MAPPING: dict[str, str] = {
    "audio_asr_api_key": "audio.asr.api_key",
    "audio_asr_base_url": "audio.asr.base_url",
    "audio_asr_model": "audio.asr.model",
    "audio_asr_sample_rate": "audio.asr.sample_rate",
    "audio_asr_format": "audio.asr.format",
    "audio_asr_semantic_punctuation_enabled": "audio.asr.semantic_punctuation_enabled",
    "audio_asr_max_sentence_silence": "audio.asr.max_sentence_silence",
    "audio_asr_heartbeat": "audio.asr.heartbeat",
    "audio_is_24x7": "audio.is_24x7",
}

_COMPOUND_JOB_NAMES: dict[str, str] = {
    "clean": "clean_data",
    "activity": "activity_aggregator",
    "auto": "auto_todo_detection",
    "diary": "diary_illustration",
}

_MIN_JOBS_PARTS = 3

DIARY_ILLUSTRATION_RUNTIME_KEYS = {
    "jobs.diary_illustration.enabled",
    "jobs.diary_illustration.cron",
    "jobs.diary_illustration.provider",
    "jobs_diary_illustration_enabled",
    "jobs_diary_illustration_cron",
    "jobs_diary_illustration_provider",
    "banna2.api_key",
    "banna2.ref_image_path",
    "banna2_api_key",
    "banna2_ref_image_path",
    "volcengine.api_key",
    "volcengine.base_url",
    "volcengine.image_model",
    "volcengine.image_size",
    "volcengine_api_key",
    "volcengine_base_url",
    "volcengine_image_model",
    "volcengine_image_size",
    *LLM_RELATED_BACKEND_KEYS,
}


def mask_api_key(value: Any) -> str:
    if not value or not isinstance(value, str) or value in INVALID_API_KEY_VALUES:
        return ""
    return API_KEY_MASK


def is_masked_api_key(value: Any) -> bool:
    return isinstance(value, str) and value == API_KEY_MASK


def _convert_jobs_key(parts: list[str]) -> str:
    job_name = parts[1]
    if job_name in _COMPOUND_JOB_NAMES:
        full_job_name = _COMPOUND_JOB_NAMES[job_name]
        name_parts = full_job_name.split("_")
        name_length = len(name_parts)
        if len(parts) > name_length and parts[1 : name_length + 1] == name_parts:
            remaining = parts[name_length + 1 :]
            if remaining:
                return f"jobs.{full_job_name}.{'.'.join(remaining)}"
            return f"jobs.{full_job_name}"

    remaining = parts[2:]
    if not remaining:
        return f"jobs.{job_name}"
    if remaining[0] == "params" and len(remaining) > 1:
        return f"jobs.{job_name}.params.{'.'.join(remaining[1:])}"
    return f"jobs.{job_name}.{'.'.join(remaining)}"


def snake_to_dot_notation(key: str) -> str:
    if "." in key or "_" not in key:
        return key
    if key in _AGENT_LLM_KEY_MAPPING:
        return _AGENT_LLM_KEY_MAPPING[key]
    if key in _ASR_KEY_MAPPING:
        return _ASR_KEY_MAPPING[key]
    if key in _INTENT_SOURCE_KEY_MAPPING:
        return _INTENT_SOURCE_KEY_MAPPING[key]
    if key.startswith("jobs_"):
        parts = key.split("_")
        if parts[0] == "jobs" and len(parts) >= _MIN_JOBS_PARTS:
            return _convert_jobs_key(parts)
    for prefix, (prefix_len, dot_prefix) in _SIMPLE_PREFIX_MAP.items():
        if key.startswith(prefix):
            return f"{dot_prefix}.{key[prefix_len:]}"
    return key.replace("_", ".")


_DOT_TO_SNAKE_OVERRIDES: dict[str, str] = {
    "llm.agent.api_key": "llm_agent_api_key",
    "llm.agent.base_url": "llm_agent_base_url",
    "llm.agent.model": "llm_agent_model",
    "perception.todo_intent.agent.model": "perception_intent_model",
    "perception.todo_intent.sources.mic_pc": "intent_source_mic_pc",
    "perception.todo_intent.sources.mic_hardware": "intent_source_mic_hardware",
    "perception.todo_intent.sources.speaker_pc": "intent_source_speaker_pc",
    "perception.todo_intent.sources.ocr_screen": "intent_source_ocr_screen",
    "perception.todo_intent.sources.ocr_proactive": "intent_source_ocr_proactive",
}


def dot_to_snake_notation(key: str) -> str:
    if key in _DOT_TO_SNAKE_OVERRIDES:
        return _DOT_TO_SNAKE_OVERRIDES[key]
    if "." not in key:
        return key
    return key.replace(".", "_")


def is_llm_configured() -> bool:
    api_key = settings.get("llm.api_key")
    base_url = settings.get("llm.base_url")
    return (
        api_key is not None
        and base_url is not None
        and api_key not in INVALID_API_KEY_VALUES
        and base_url not in INVALID_API_KEY_VALUES
    )
