"""Crawler router entrypoint with split helper modules."""

from __future__ import annotations

from fastapi import APIRouter

from routers.crawler_config_routes import register_routes as register_config_routes
from routers.crawler_keywords import register_routes as register_keyword_routes
from routers.crawler_media import register_routes as register_media_routes
from routers.crawler_results import register_routes as register_result_routes
from routers.crawler_runtime import register_routes as register_runtime_routes
from routers.crawler_summary import register_routes as register_summary_routes

router = APIRouter(prefix="/api/crawler", tags=["crawler"])

for register in (
    register_config_routes,
    register_keyword_routes,
    register_runtime_routes,
    register_result_routes,
    register_media_routes,
    register_summary_routes,
):
    register(router)
