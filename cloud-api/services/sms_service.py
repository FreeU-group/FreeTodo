"""短信服务 — 阿里云短信发送 + Redis 验证码存储"""

from __future__ import annotations

import random
import string

from fastapi import HTTPException
from loguru import logger
from redis.asyncio import Redis

from core.config import settings

CODE_TTL_SECONDS = 300
SEND_COOLDOWN_SECONDS = 60
DAILY_SEND_LIMIT = 10

_KEY_CODE = "sms:code:{phone}"
_KEY_COOLDOWN = "sms:cooldown:{phone}"
_KEY_DAILY = "sms:daily:{phone}"


def _generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))


async def _send_via_aliyun(phone: str, code: str, purpose: str) -> None:
    """通过阿里云 SDK 发送短信验证码"""
    from alibabacloud_dysmsapi20170525.client import Client  # noqa: PLC0415
    from alibabacloud_tea_openapi.models import Config  # noqa: PLC0415
    from alibabacloud_dysmsapi20170525.models import SendSmsRequest  # noqa: PLC0415

    template_map = {
        "login": settings.SMS_TEMPLATE_LOGIN,
        "register": settings.SMS_TEMPLATE_REGISTER,
        "reset": settings.SMS_TEMPLATE_RESET,
    }
    template_code = template_map.get(purpose, settings.SMS_TEMPLATE_LOGIN)

    config = Config(
        access_key_id=settings.SMS_ACCESS_KEY_ID,
        access_key_secret=settings.SMS_ACCESS_KEY_SECRET,
        endpoint="dysmsapi.aliyuncs.com",
    )
    client = Client(config)
    request = SendSmsRequest(
        phone_numbers=phone,
        sign_name=settings.SMS_SIGN_NAME,
        template_code=template_code,
        template_param=f'{{"code":"{code}"}}',
    )
    response = client.send_sms(request)
    body = response.body
    if body.code != "OK":
        logger.error("短信发送失败: phone=%s, code=%s, message=%s", phone, body.code, body.message)
        raise HTTPException(status_code=500, detail=f"短信发送失败: {body.message}")
    logger.info("短信已发送: phone=%s, purpose=%s", phone, purpose)


async def send_code(redis: Redis, phone: str, purpose: str = "login") -> None:
    """发送验证码 — 包含频率限制和存储"""
    cooldown_key = _KEY_COOLDOWN.format(phone=phone)
    if await redis.exists(cooldown_key):
        ttl = await redis.ttl(cooldown_key)
        raise HTTPException(
            status_code=429,
            detail=f"发送过于频繁，请 {ttl} 秒后重试",
        )

    daily_key = _KEY_DAILY.format(phone=phone)
    daily_count = await redis.get(daily_key)
    if daily_count and int(daily_count) >= DAILY_SEND_LIMIT:
        raise HTTPException(status_code=429, detail="今日发送次数已达上限，请明天再试")

    if settings.AUTH_IS_DEBUG:
        code = settings.AUTH_DEBUG_CODE
        logger.info("Debug mode: verification code for %s is %s (purpose=%s)", phone, code, purpose)
    else:
        code = _generate_code()
        await _send_via_aliyun(phone, code, purpose)

    code_key = _KEY_CODE.format(phone=phone)
    await redis.set(code_key, code, ex=CODE_TTL_SECONDS)
    await redis.set(cooldown_key, "1", ex=SEND_COOLDOWN_SECONDS)

    pipe = redis.pipeline()
    pipe.incr(daily_key)
    pipe.expire(daily_key, 86400)
    await pipe.execute()


async def verify_code(redis: Redis, phone: str, code: str) -> None:
    """校验验证码 — 通过后自动清除"""
    code_key = _KEY_CODE.format(phone=phone)
    stored = await redis.get(code_key)
    if not stored:
        raise HTTPException(status_code=400, detail="请先获取验证码")
    if code != stored:
        raise HTTPException(status_code=400, detail="验证码错误")
    await redis.delete(code_key)
