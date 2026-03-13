"""日记插画生成服务

工作流：
1. 读取当天 L2 事件流（memory/events_L2/{date}.md）
2. 调用 LLM 将事件总结转化为图像描述（漫画风格，主角为用户）
3. 调用 Gemini API（gemini-3.1-flash-image-preview）生成图像
   - 若配置了个人形象参考图，则连同图片一起发送（image+text → image）
   - 否则纯文字生成（text → image）
4. 将生成的图片保存到 data/diary_illustrations/{date}.png
"""

from __future__ import annotations

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
    "你是一位漫画分镜师。请根据用户今天的事件摘要，创作一段图像生成提示词（英文）。\n"
    "风格：日系漫画分镜页（manga page layout），包含多个分格，纵向排列。\n\n"
    "要求：\n"
    "- 输出纯英文 prompt，250 词以内\n"
    "- 根据事件数量分成 3-6 个漫画分格（comic panels），按时间顺序排列\n"
    "- 描述整体布局：a vertical manga page with N panels arranged in rows\n"
    "- 每个 panel 描述一个场景：人物动作、表情、环境、简短的画外音或对话气泡内容\n"
    "- 同一个主角贯穿所有分格，保持外貌一致性\n"
    "- 包含时间线感（如：morning panel → afternoon panel → evening panel）\n"
    "- 结尾加上风格词：manga page layout, multiple comic panels, warm anime style, "
    "soft lighting, consistent character design, speech bubbles, panel borders\n"
    "- 只输出 prompt，不要解释"
)

PROMPT_USER_TEMPLATE = """\
今天的事件摘要（请为每个重要事件分配一个漫画分格）：
{events}

请生成一个多分格漫画页的图像 prompt，每个分格对应一个事件场景。
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
        """为指定日期生成插画。date_str 为空则使用今天。

        Returns:
            {"ok": bool, "path": str | None, "date": str, "prompt": str | None, "error": str | None}
        """
        date_str = date_str or local_today_str()
        out_path = self._illustrations_dir / f"{date_str}.png"

        # 读取当天事件流
        events_content = self._memory_reader.read_by_date(date_str)
        if not events_content or not events_content.strip():
            return {
                "ok": False,
                "path": None,
                "date": date_str,
                "prompt": None,
                "error": f"No events found for {date_str}",
            }

        # 生成图像 prompt
        try:
            image_prompt = await self._build_image_prompt(events_content)
        except Exception as e:
            logger.exception("DiaryIllustration: LLM prompt generation failed")
            return {"ok": False, "path": None, "date": date_str, "prompt": None, "error": str(e)}

        # 调用 Banna2 生成图像
        try:
            image_bytes = await self._call_banna2(image_prompt)
        except Exception as e:
            logger.exception("DiaryIllustration: Banna2 API call failed")
            return {
                "ok": False,
                "path": None,
                "date": date_str,
                "prompt": image_prompt,
                "error": str(e),
            }

        # 保存图片
        out_path.write_bytes(image_bytes)
        logger.info("DiaryIllustration: saved illustration to %s", out_path)

        return {
            "ok": True,
            "path": str(out_path),
            "date": date_str,
            "prompt": image_prompt,
            "error": None,
        }

    def get_illustration_path(self, date_str: str | None = None) -> Path | None:
        """返回指定日期的插画路径（不存在则返回 None）"""
        date_str = date_str or local_today_str()
        p = self._illustrations_dir / f"{date_str}.png"
        return p if p.exists() else None

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    async def _build_image_prompt(self, events_content: str) -> str:
        """用 LLM 将事件摘要转化为图像 prompt"""
        import asyncio  # noqa: PLC0415

        messages = [
            {"role": "system", "content": PROMPT_SYSTEM},
            {"role": "user", "content": PROMPT_USER_TEMPLATE.format(events=events_content[:3000])},
        ]
        resp = await asyncio.to_thread(
            self._llm.chat,
            messages,
            0.7,
            None,
            500,
            log_usage=True,
            log_meta={
                "endpoint": "diary_illustration_prompt",
                "feature_type": "diary_illustration",
            },
        )
        if not resp or not resp.strip():
            raise ValueError("LLM returned empty prompt")
        return resp.strip()

    # ------------------------------------------------------------------
    # Gemini image generation caller
    # ------------------------------------------------------------------

    async def _call_banna2(self, prompt: str) -> bytes:
        """调用 Gemini gemini-3.1-flash-image-preview 生成图像

        支持两种模式：
        - text-to-image：纯文字描述
        - 携带参考图：将个人形象图作为输入，配合文字描述生成（image+text → image）
        """
        import asyncio  # noqa: PLC0415

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

        # Build parts list
        parts: list[dict] = []

        ref_path = Path(ref_image_path) if ref_image_path else None
        if ref_path and ref_path.exists():
            suffix = ref_path.suffix.lstrip(".").lower() or "jpeg"
            mime = f"image/{suffix}" if suffix != "jpg" else "image/jpeg"
            img_b64 = base64.b64encode(ref_path.read_bytes()).decode()
            parts.append({"inline_data": {"mime_type": mime, "data": img_b64}})
            logger.info("DiaryIllustration: using reference image %s", ref_path)
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
        """同步执行 Gemini API 请求，在线程中调用"""
        import json as _json  # noqa: PLC0415

        import httpx  # noqa: PLC0415

        with httpx.Client(timeout=120) as client:
            resp = client.post(url, json=payload, headers={"Content-Type": "application/json"})
            resp.raise_for_status()
            data = resp.json()

        # Extract image from response
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"Gemini returned no candidates: {_json.dumps(data)[:300]}")

        for part in candidates[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline:
                raw_b64 = inline.get("data", "")
                return base64.b64decode(raw_b64)

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
