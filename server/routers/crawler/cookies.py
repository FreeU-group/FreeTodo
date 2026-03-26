"""Crawler cookie storage models, helpers, and routes."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .common import (
    get_cookies_config_path,
    logger,
    try_get_cookies_config_path,
)

SUPPORTED_PLATFORMS = ["xhs", "dy", "ks", "wb", "bili", "tieba", "zhihu"]

PLATFORM_DISPLAY_NAMES = {
    "xhs": "小红书",
    "dy": "抖音",
    "ks": "快手",
    "wb": "微博",
    "bili": "哔哩哔哩",
    "tieba": "百度贴吧",
    "zhihu": "知乎",
}


class CookieAccount(BaseModel):
    """Cookie record for a single account."""

    id: int | None = None
    account_name: str
    cookies: str


class PlatformCookies(BaseModel):
    """All cookie records for a platform."""

    platform: str
    platform_name: str
    accounts: list[CookieAccount]


class AllCookiesResponse(BaseModel):
    """Cookie listing across supported platforms."""

    platforms: list[PlatformCookies]


class UpdateCookieRequest(BaseModel):
    """Single-account cookie update payload."""

    platform: str
    account_name: str
    cookies: str


def read_cookies_from_xlsx(*, require: bool = True) -> dict[str, list[dict]]:
    """Read cookies from the platform workbook."""
    cookies_path = get_cookies_config_path() if require else try_get_cookies_config_path()
    if cookies_path is None:
        return {}
    if not cookies_path.exists():
        logger.warning("Cookies 配置文件不存在: %s", cookies_path)
        return {}

    all_cookies: dict[str, list[dict]] = {}
    try:
        xlsx = pd.ExcelFile(cookies_path, engine="openpyxl")
        for platform in SUPPORTED_PLATFORMS:
            if platform not in xlsx.sheet_names:
                all_cookies[platform] = []
                continue

            df = pd.read_excel(xlsx, sheet_name=platform, engine="openpyxl")
            accounts = []
            for idx, row in df.iterrows():
                accounts.append(
                    {
                        "id": int(row.get("id", idx + 1)) if pd.notna(row.get("id")) else idx + 1,
                        "account_name": str(row.get("account_name", ""))
                        if pd.notna(row.get("account_name"))
                        else "",
                        "cookies": str(row.get("cookies", ""))
                        if pd.notna(row.get("cookies"))
                        else "",
                    }
                )
            all_cookies[platform] = accounts

        xlsx.close()
        return all_cookies
    except Exception as exc:
        logger.warning("读取 Cookies 配置文件失败（将返回空数据）: %s", exc)
        try:
            cookies_path.unlink(missing_ok=True)
            logger.info("已删除损坏的 Cookies 配置文件，下次保存时将自动重建")
        except OSError as delete_error:
            logger.warning("无法删除损坏的 Cookies 配置文件: %s", delete_error)
        return {}


def write_cookies_to_xlsx(platform: str, accounts: list[dict]) -> None:
    """Persist platform cookies back to the workbook."""
    cookies_path = get_cookies_config_path()
    try:
        existing_data: dict[str, pd.DataFrame] = {}
        if cookies_path.exists():
            try:
                xlsx = pd.ExcelFile(cookies_path, engine="openpyxl")
                for current_platform in SUPPORTED_PLATFORMS:
                    if current_platform in xlsx.sheet_names:
                        existing_data[current_platform] = pd.read_excel(
                            xlsx,
                            sheet_name=current_platform,
                            engine="openpyxl",
                        )
                xlsx.close()
            except Exception as exc:
                logger.warning("读取现有 Cookies 文件失败，将重新创建: %s", exc)

        with pd.ExcelWriter(cookies_path, engine="openpyxl") as writer:
            for current_platform in SUPPORTED_PLATFORMS:
                if current_platform == platform:
                    df = pd.DataFrame(accounts)
                elif current_platform in existing_data:
                    df = existing_data[current_platform]
                else:
                    df = pd.DataFrame(columns=["id", "account_name", "cookies"])
                df.to_excel(writer, sheet_name=current_platform, index=False)

        logger.info("成功写入平台 %s 的 cookies 配置", platform)
    except Exception as exc:
        logger.error("写入 Cookies 配置文件失败: %s", exc)
        raise


def _ensure_supported_platform(platform: str) -> None:
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")


def register_routes(router: APIRouter) -> None:
    """Register cookie routes on the shared router."""

    @router.get("/cookies", response_model=AllCookiesResponse)
    async def get_all_cookies() -> AllCookiesResponse:
        """Return cookies for every supported platform."""
        try:
            all_cookies = read_cookies_from_xlsx(require=False)
            platforms = [
                PlatformCookies(
                    platform=platform,
                    platform_name=PLATFORM_DISPLAY_NAMES.get(platform, platform),
                    accounts=[
                        CookieAccount(**account) for account in all_cookies.get(platform, [])
                    ],
                )
                for platform in SUPPORTED_PLATFORMS
            ]
            return AllCookiesResponse(platforms=platforms)
        except Exception as exc:
            logger.error("获取 Cookies 配置失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取 Cookies 配置失败: {exc!s}") from exc

    @router.get("/cookies/{platform}")
    async def get_platform_cookies(platform: str) -> dict[str, object]:
        """Return cookies for a single platform."""
        _ensure_supported_platform(platform)
        try:
            all_cookies = read_cookies_from_xlsx(require=False)
            return {
                "success": True,
                "platform": platform,
                "platform_name": PLATFORM_DISPLAY_NAMES.get(platform, platform),
                "accounts": all_cookies.get(platform, []),
            }
        except Exception as exc:
            logger.error("获取平台 %s 的 Cookies 配置失败: %s", platform, exc)
            raise HTTPException(status_code=500, detail=f"获取 Cookies 配置失败: {exc!s}") from exc

    @router.post("/cookies/{platform}")
    async def update_platform_cookies(
        platform: str,
        request: UpdateCookieRequest,
    ) -> dict[str, object]:
        """Overwrite a platform with a single account cookie."""
        logger.info(
            "[Cookies API] 收到更新请求 - 平台: %s, 账号: %s, cookies长度: %s",
            platform,
            request.account_name,
            len(request.cookies) if request.cookies else 0,
        )
        _ensure_supported_platform(platform)

        try:
            write_cookies_to_xlsx(
                platform,
                [
                    {
                        "id": 1,
                        "account_name": request.account_name or f"{platform}_account",
                        "cookies": request.cookies,
                    }
                ],
            )
            logger.info("[Cookies API] 更新平台 %s 的 cookies 成功", platform)
            return {
                "success": True,
                "message": f"平台 {PLATFORM_DISPLAY_NAMES.get(platform, platform)} 的 Cookies 已更新",
                "platform": platform,
            }
        except Exception as exc:
            logger.error("[Cookies API] 更新平台 %s 的 Cookies 失败: %s", platform, exc)
            raise HTTPException(status_code=500, detail=f"更新 Cookies 失败: {exc!s}") from exc

    @router.put("/cookies/{platform}")
    async def save_platform_cookies(
        platform: str,
        accounts: list[CookieAccount],
    ) -> dict[str, object]:
        """Persist all cookies for a platform."""
        _ensure_supported_platform(platform)
        try:
            accounts_data = [
                {
                    "id": account.id or index + 1,
                    "account_name": account.account_name,
                    "cookies": account.cookies,
                }
                for index, account in enumerate(accounts)
            ]
            write_cookies_to_xlsx(platform, accounts_data)
            logger.info("保存平台 %s 的 %s 个账号 cookies 成功", platform, len(accounts_data))
            return {
                "success": True,
                "message": f"平台 {PLATFORM_DISPLAY_NAMES.get(platform, platform)} 的 Cookies 已保存",
                "platform": platform,
                "count": len(accounts_data),
            }
        except Exception as exc:
            logger.error("保存平台 %s 的 Cookies 失败: %s", platform, exc)
            raise HTTPException(status_code=500, detail=f"保存 Cookies 失败: {exc!s}") from exc
