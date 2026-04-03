"""Location-based Tools

Nearby place search for location-aware recommendations.
"""

from __future__ import annotations

from llm.agno_tools.base import get_message
from util.logging_config import get_logger

logger = get_logger()


def _search_web(query: str, max_results: int = 5) -> list[dict]:
    """Search the web using DuckDuckGo (best-effort, graceful fallback)."""
    try:
        from ddgs import DDGS  # noqa: PLC0415

        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        return results
    except Exception as e:
        logger.warning(f"Web search failed (query={query!r}): {e}")
        return []


class LocationTools:
    """Location-based recommendation tools mixin"""

    lang: str

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def search_nearby_places(
        self,
        location: str,
        keyword: str = "餐厅",
        radius_km: int = 1,
    ) -> str:
        """Search for places near a given location

        Uses web search to find restaurants, cafes, or other venues
        near the specified location.

        Args:
            location: Reference location (e.g. "五棵松体育馆", "北京国贸")
            keyword: Type of place to search (default: "餐厅")
            radius_km: Search radius in km (used as hint, default: 1)

        Returns:
            Formatted list of nearby places or search suggestions
        """
        try:
            query = f"{location}附近{radius_km}公里内的{keyword} 推荐"
            results = _search_web(query, max_results=5)

            if not results:
                return self._msg(
                    "nearby_no_results",
                    location=location,
                    keyword=keyword,
                    query=query,
                )

            lines = []
            for idx, r in enumerate(results, 1):
                title = r.get("title", "")
                body = r.get("body", "")
                max_snippet_len = 120
                snippet = body[:max_snippet_len] + "..." if len(body) > max_snippet_len else body
                lines.append(f"  {idx}. **{title}**\n     {snippet}")

            return self._msg(
                "nearby_found",
                location=location,
                keyword=keyword,
                count=len(results),
                results="\n".join(lines),
            )

        except Exception as e:
            logger.error(f"Failed to search nearby places: {e}")
            return self._msg("nearby_failed", error=str(e))
