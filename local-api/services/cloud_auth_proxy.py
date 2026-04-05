"""Cloud API 认证代理 — 将手机号认证请求转发到 cloud-api

所有手机号相关的认证操作（发送验证码、验证码登录、注册）都通过此模块
转发到 cloud-api，local-api 不再本地处理验证码。
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import HTTPException

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

REQUEST_TIMEOUT = 30.0


def _get_cloud_url() -> str:
    url = str(settings.get("auth.cloud_api_url", "http://127.0.0.1:8000"))
    return url.rstrip("/")


@dataclass
class CloudTokenResult:
    """cloud-api 返回的认证结果"""

    access_token: str
    refresh_token: str
    auth_mode: str


@dataclass
class CloudUserInfo:
    """cloud-api 返回的用户信息"""

    id: str
    username: str
    phone: str | None


def _raise_for_cloud_error(resp: httpx.Response) -> None:
    """将 cloud-api 的错误响应转换为 HTTPException 抛出"""
    if resp.is_success:
        return
    try:
        body = resp.json()
        detail = body.get("detail", resp.text)
    except Exception:
        detail = resp.text or f"cloud-api 返回 {resp.status_code}"
    raise HTTPException(status_code=resp.status_code, detail=detail)


async def proxy_send_code(phone: str, purpose: str = "login") -> dict:
    """转发发送验证码请求到 cloud-api"""
    url = f"{_get_cloud_url()}/api/v1/auth/send_code"
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(url, json={"phone": phone, "purpose": purpose})
        _raise_for_cloud_error(resp)
        return resp.json()
    except HTTPException:
        raise
    except httpx.ConnectError:
        logger.error("无法连接 cloud-api: %s", url)
        raise HTTPException(
            status_code=503, detail="无法连接云端服务，请检查网络或稍后重试"
        ) from None
    except Exception as exc:
        logger.error("转发 send_code 失败: %s", exc)
        raise HTTPException(status_code=503, detail="云端服务暂时不可用，请稍后重试") from exc


async def proxy_register(phone: str, code: str, username: str, password: str) -> CloudTokenResult:
    """转发注册请求到 cloud-api，返回云端 Token"""
    url = f"{_get_cloud_url()}/api/v1/auth/register"
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(
                url,
                json={
                    "phone": phone,
                    "code": code,
                    "username": username,
                    "password": password,
                },
            )
        _raise_for_cloud_error(resp)
        data = resp.json()
        return CloudTokenResult(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            auth_mode=data.get("auth_mode", "cloud"),
        )
    except HTTPException:
        raise
    except httpx.ConnectError:
        logger.error("无法连接 cloud-api: %s", url)
        raise HTTPException(
            status_code=503, detail="无法连接云端服务，请检查网络或稍后重试"
        ) from None
    except Exception as exc:
        logger.error("转发 register 失败: %s", exc)
        raise HTTPException(status_code=503, detail="云端服务暂时不可用，请稍后重试") from exc


async def proxy_verify(phone: str, code: str) -> CloudTokenResult:
    """转发验证码登录请求到 cloud-api，返回云端 Token"""
    url = f"{_get_cloud_url()}/api/v1/auth/verify"
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(url, json={"phone": phone, "code": code})
        _raise_for_cloud_error(resp)
        data = resp.json()
        return CloudTokenResult(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            auth_mode=data.get("auth_mode", "cloud"),
        )
    except HTTPException:
        raise
    except httpx.ConnectError:
        logger.error("无法连接 cloud-api: %s", url)
        raise HTTPException(
            status_code=503, detail="无法连接云端服务，请检查网络或稍后重试"
        ) from None
    except Exception as exc:
        logger.error("转发 verify 失败: %s", exc)
        raise HTTPException(status_code=503, detail="云端服务暂时不可用，请稍后重试") from exc


async def fetch_cloud_user(cloud_access_token: str) -> CloudUserInfo:
    """使用云端 access_token 调用 cloud-api /auth/me 获取用户信息"""
    url = f"{_get_cloud_url()}/api/v1/auth/me"
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {cloud_access_token}"})
        _raise_for_cloud_error(resp)
        data = resp.json()
        return CloudUserInfo(
            id=data["id"],
            username=data["username"],
            phone=data.get("phone"),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("获取云端用户信息失败: %s", exc)
        raise HTTPException(status_code=503, detail="无法获取云端用户信息") from exc
