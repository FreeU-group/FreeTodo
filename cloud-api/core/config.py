"""Cloud API 配置 — 基于 pydantic-settings 从环境变量加载"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---------- 环境 ----------
    ENV: str = "dev"

    # ---------- 认证 ----------
    AUTH_SECRET_KEY: str = "change-me-to-a-strong-random-string"
    AUTH_ALGORITHM: str = "HS256"
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AUTH_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    AUTH_IS_DEBUG: bool = False
    AUTH_DEBUG_CODE: str = "888888"

    # ---------- API 服务 ----------
    API_NAME: str = "freeu-cloud-api"
    API_VERSION: str = "0.1.0"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_RELOAD: bool = True

    # ---------- PostgreSQL ----------
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 15432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "123456"
    POSTGRES_DB: str = "freeu"
    POSTGRES_ECHO: bool = False
    POSTGRES_POOL_SIZE: int = 20
    POSTGRES_MAX_OVERFLOW: int = 30
    POSTGRES_POOL_TIMEOUT: int = 30
    POSTGRES_POOL_RECYCLE: int = 3600
    POSTGRES_POOL_PRE_PING: bool = True

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def database_url_sync(self) -> str:
        """Alembic 等同步工具使用的 URL"""
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ---------- Redis ----------
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 16379
    REDIS_USER: str = "default"
    REDIS_PASSWORD: str = "123456"
    REDIS_DB: int = 0

    @property
    def redis_url(self) -> str:
        return f"redis://{self.REDIS_USER}:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # ---------- MinIO ----------
    MINIO_ENDPOINT: str = "localhost:19000"
    MINIO_ACCESS_KEY: str = "root"
    MINIO_SECRET_KEY: str = "12345678"
    MINIO_BUCKET_NAME: str = "freeu"
    MINIO_SECURE: bool = False

    # ---------- 推送 ----------
    FIREBASE_CREDENTIALS_PATH: str = ""
    APNS_KEY_PATH: str = ""
    APNS_KEY_ID: str = ""
    APNS_TEAM_ID: str = ""

    # ---------- 短信 ----------
    SMS_PROVIDER: str = "aliyun"
    SMS_ACCESS_KEY_ID: str = ""
    SMS_ACCESS_KEY_SECRET: str = ""
    SMS_SIGN_NAME: str = ""
    SMS_TEMPLATE_LOGIN: str = ""
    SMS_TEMPLATE_REGISTER: str = ""
    SMS_TEMPLATE_RESET: str = ""


settings = Settings()
