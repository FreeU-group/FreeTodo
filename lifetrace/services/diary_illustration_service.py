"""日记插画生成服务

工作流：
1. 读取当天 L2 事件流（memory/events_L2/{date}.md）
2. 调用 LLM 将事件流拆分为多个场景，每个场景生成一段漫画分镜 prompt
3. 对每个分镜调用 Gemini API 生成一张漫画图
4. 保存到 data/diary_illustrations/{date}_1.png, {date}_2.png ...
"""

from __future__ import annotations

import asyncio
import base64
from pathlib import Path
from typing import TYPE_CHECKING

from lifetrace.memory.reader import MemoryReader
from lifetrace.util.base_paths import get_user_data_dir
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.time_utils import local_today_str

if TYPE_CHECKING:
    from lifetrace.llm.llm_client import LLMClient

logger = get_logger()

ILLUSTRATIONS_DIR_NAME = "diary_illustrations"

PROMPT_SYSTEM = (
    "你是一位漫画分镜师。根据用户今天的事件摘要，将一天拆分为多个关键场景，"
    "为每个场景各写一段独立的英文图像 prompt。\n\n"
    "要求：\n"
    "- 根据事件数量拆分为 2-5 个场景（每个场景对应一天中的一个重要时刻）\n"
    "- 每个场景的 prompt 100-150 词，描述漫画分镜风格的单格画面\n"
    "- 包含：人物动作/表情、环境细节、光线/时间氛围、画面构图、对话气泡文字\n"
    "- 同一个主角贯穿所有场景，保持外貌一致\n"
    "- 每个 prompt 结尾加上风格词：manga panel, warm anime style, detailed background, "
    "speech bubbles with text, soft lighting, consistent character\n"
    "- 按时间顺序排列\n\n"
    "输出格式（严格 JSON 数组，不要输出其他内容）：\n"
    '[{{"scene": "场景标题", "prompt": "英文prompt"}}, ...]'
)

PROMPT_USER_TEMPLATE = """\
今天的事件摘要：
{events}

请拆分为多个场景，为每个场景生成独立的漫画 prompt。只输出 JSON 数组。
"""


class DiaryIllustrationService:
    """日记插画生成服务"""

    def __init__(self, llm_client: LLMClient):
        self._llm = llm_client
        self._memory_reader = MemoryReader(get_user_data_dir() / "memory")
        self._illustrations_dir = get_user_data_dir() / ILLUSTRATIONS_DIR_NAME
        self._illustrations_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_for_date(self, date_str: str | None = None) -> dict:
        """为指定日期生成多张插画。

        Returns:
            {"ok": bool, "date": str, "count": int, "paths": list[str], "error": str | None}
        """
        date_str = date_str or local_today_str()

        # 清理旧图片
        self._clean_date_images(date_str)

        events_content = self._memory_reader.read_by_date(date_str)
        if not events_content or not events_content.strip():
            return {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": f"No events for {date_str}",
            }

        # LLM 拆分场景 → 多个 prompt
        try:
            scenes = await self._build_scene_prompts(events_content)
        except Exception as e:
            logger.exception("DiaryIllustration: scene prompt generation failed")
            return {"ok": False, "date": date_str, "count": 0, "paths": [], "error": str(e)}

        if not scenes:
            return {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": "LLM returned no scenes",
            }

        # 逐个场景生成图片
        saved_paths: list[str] = []
        for idx, scene in enumerate(scenes):
            prompt = scene.get("prompt", "")
            if not prompt:
                continue
            try:
                image_bytes = await self._call_gemini(prompt)
                out_path = self._illustrations_dir / f"{date_str}_{idx + 1}.png"
                out_path.write_bytes(image_bytes)
                saved_paths.append(str(out_path))
                logger.info(
                    "DiaryIllustration: saved panel %d/%d to %s", idx + 1, len(scenes), out_path
                )
            except Exception:
                logger.exception("DiaryIllustration: panel %d generation failed", idx + 1)

        return {
            "ok": len(saved_paths) > 0,
            "date": date_str,
            "count": len(saved_paths),
            "paths": saved_paths,
            "error": None,
        }

    def get_illustration_paths(self, date_str: str | None = None) -> list[Path]:
        """返回指定日期的所有插画路径，按序号排序"""
        date_str = date_str or local_today_str()
        paths = sorted(self._illustrations_dir.glob(f"{date_str}_*.png"))
        return paths

    def get_illustration_path(self, date_str: str | None = None) -> Path | None:
        """兼容旧接口：返回第一张插画"""
        paths = self.get_illustration_paths(date_str)
        return paths[0] if paths else None

    def _clean_date_images(self, date_str: str) -> None:
        """删除指定日期的旧插画"""
        for p in self._illustrations_dir.glob(f"{date_str}_*.png"):
            p.unlink(missing_ok=True)

    # ------------------------------------------------------------------
    # Scene prompt builder
    # ------------------------------------------------------------------

    async def _build_scene_prompts(self, events_content: str) -> list[dict]:
        """用 LLM 将事件摘要拆分为多个场景 prompt"""
        import json  # noqa: PLC0415

        messages = [
            {"role": "system", "content": PROMPT_SYSTEM},
            {"role": "user", "content": PROMPT_USER_TEMPLATE.format(events=events_content[:4000])},
        ]
        resp = await asyncio.to_thread(
            self._llm.chat,
            messages,
            0.7,
            None,
            1200,
            log_usage=True,
            log_meta={
                "endpoint": "diary_illustration_prompt",
                "feature_type": "diary_illustration",
            },
        )
        if not resp or not resp.strip():
            raise ValueError("LLM returned empty response")

        text = resp.strip()
        # 提取 JSON 数组
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            raise ValueError(f"LLM response is not a JSON array: {text[:200]}")
        scenes = json.loads(text[start : end + 1])
        if not isinstance(scenes, list):
            raise ValueError("LLM returned non-list JSON")
        return scenes[:6]

    # ------------------------------------------------------------------
    # Gemini image generation
    # ------------------------------------------------------------------

    async def _call_gemini(self, prompt: str) -> bytes:
        """调用 Gemini gemini-3.1-flash-image-preview 生成单张图像"""
        cfg = _get_banna2_config()
        api_key: str = cfg.get("api_key", "")
        ref_image_path: str = cfg.get("ref_image_path", "")

        if not api_key:
            raise ValueError("banna2.api_key (Google Gemini API key) is not configured")

        model = "gemini-3.1-flash-image-preview"
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        )

        parts: list[dict] = []
        ref_path = Path(ref_image_path) if ref_image_path else None
        if ref_path and ref_path.exists():
            suffix = ref_path.suffix.lstrip(".").lower() or "jpeg"
            mime = f"image/{suffix}" if suffix != "jpg" else "image/jpeg"
            img_b64 = base64.b64encode(ref_path.read_bytes()).decode()
            parts.append({"inline_data": {"mime_type": mime, "data": img_b64}})
            parts.append(
                {"text": f"Using the person in the reference image as the main character, {prompt}"}
            )
        else:
            parts.append({"text": prompt})

        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
        }

        image_bytes = await asyncio.to_thread(self._gemini_request, url, payload)
        return image_bytes

    @staticmethod
    def _gemini_request(url: str, payload: dict) -> bytes:
        """同步执行 Gemini API 请求"""
        import json as _json  # noqa: PLC0415

        import httpx  # noqa: PLC0415

        with httpx.Client(timeout=120) as client:
            resp = client.post(url, json=payload, headers={"Content-Type": "application/json"})
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"Gemini returned no candidates: {_json.dumps(data)[:300]}")

        for part in candidates[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline:
                return base64.b64decode(inline.get("data", ""))

        raise ValueError(f"Gemini response contained no image data: {_json.dumps(data)[:300]}")


# ------------------------------------------------------------------
# Config helpers
# ------------------------------------------------------------------


def _get_banna2_config() -> dict:
    raw = settings.get("banna2", {}) or {}
    return dict(raw) if isinstance(raw, dict) else {}


# ------------------------------------------------------------------
# Singleton
# ------------------------------------------------------------------

_service: DiaryIllustrationService | None = None


def get_diary_illustration_service() -> DiaryIllustrationService | None:
    return _service


def init_diary_illustration_service(llm_client: LLMClient) -> DiaryIllustrationService:
    global _service  # noqa: PLW0603
    _service = DiaryIllustrationService(llm_client)
    return _service
