"""认证相关请求/响应 Schema — 与 local-api 保持兼容"""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, field_validator

PHONE_PATTERN = re.compile(r"^1[3-9]\d{9}$")
USERNAME_MIN_LEN = 2
USERNAME_MAX_LEN = 20
CODE_LEN = 6


# ========== 请求 ==========


class SmsCodeRequest(BaseModel):
    phone: str
    purpose: str = "login"

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("请输入有效的手机号码")
        return v


class VerifyCodeRequest(BaseModel):
    phone: str
    code: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("请输入有效的手机号码")
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if len(v) != CODE_LEN or not v.isdigit():
            raise ValueError("验证码必须为6位数字")
        return v


class RegisterRequest(BaseModel):
    phone: str
    code: str
    username: str
    password: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("请输入有效的手机号码")
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if len(v) != CODE_LEN or not v.isdigit():
            raise ValueError("验证码必须为6位数字")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        if len(v) < USERNAME_MIN_LEN or len(v) > USERNAME_MAX_LEN:
            raise ValueError("用户名长度必须在2-20字符之间")
        if not re.match(r"^[a-zA-Z0-9_\u4e00-\u9fa5]+$", v):
            raise ValueError("用户名只能包含字母、数字、下划线和中文字符")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError("密码不能为空")
        if len(v) < 6:
            raise ValueError("密码长度至少6位")
        return v


class LoginRequest(BaseModel):
    phone: str
    password: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("请输入有效的手机号码")
        return v


class ResetPasswordRequest(BaseModel):
    phone: str
    code: str
    new_password: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("请输入有效的手机号码")
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if len(v) != CODE_LEN or not v.isdigit():
            raise ValueError("验证码必须为6位数字")
        return v

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError("密码不能为空")
        if len(v) < 6:
            raise ValueError("密码长度至少6位")
        return v


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UpdateUsernameRequest(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        if len(v) < USERNAME_MIN_LEN or len(v) > USERNAME_MAX_LEN:
            raise ValueError("用户名长度必须在2-20字符之间")
        if not re.match(r"^[a-zA-Z0-9_\u4e00-\u9fa5]+$", v):
            raise ValueError("用户名只能包含字母、数字、下划线和中文字符")
        return v


class UpgradePlanRequest(BaseModel):
    plan_id: int


# ========== 响应 ==========


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    auth_mode: str = "cloud"


class SmsCodeResponse(BaseModel):
    success: bool
    message: str


class UserProfileResponse(BaseModel):
    id: str
    username: str
    phone: str | None = None
    user_type: str
    auth_mode: str
    membership_type: str = "free"
    is_dev: bool = False
    avatar_url: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class UsageStatsResponse(BaseModel):
    total_chat_count: int = 0
    daily_credits: int = 0
    permanent_credits: int = 0
    daily_credits_consumed: int = 0
    total_credits_consumed: int = 0
    total_credits_purchased: int = 0
    membership_type: str = "free"
    membership_active: bool = False


class AuthModeResponse(BaseModel):
    auth_mode: str
    user_id: str


class MessageResponse(BaseModel):
    success: bool
    message: str
