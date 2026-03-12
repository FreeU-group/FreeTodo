"""应用路由模块 — 识别窗口是否为微信/飞书"""

from functools import lru_cache

from proactive_ocr.models import AppType, FrameEvent, RoutedFrame, WindowMeta

WECHAT_PROCESS_NAMES = [
    "weixin.exe", "wechat.exe", "wechatappex.exe", "wechatbrowser.exe",
    "wechat", "微信", "electronic-wechat",
]

WECHAT_TITLE_KEYWORDS = ["微信", "wechat"]

FEISHU_PROCESS_NAMES = [
    "feishu.exe", "lark.exe", "bytedance feishu",
    "feishu", "lark", "飞书", "electron",
]

FEISHU_TITLE_KEYWORDS = ["飞书", "feishu", "lark"]


class AppRouter:
    def __init__(self):
        self.wechat_processes = [p.lower() for p in WECHAT_PROCESS_NAMES]
        self.wechat_titles = [t.lower() for t in WECHAT_TITLE_KEYWORDS]
        self.feishu_processes = [p.lower() for p in FEISHU_PROCESS_NAMES]
        self.feishu_titles = [t.lower() for t in FEISHU_TITLE_KEYWORDS]

    def identify_app(self, window: WindowMeta) -> tuple[AppType, str]:  # noqa: C901
        process_name = window.process_name.lower()
        title = window.title.lower()

        for proc in self.wechat_processes:
            if proc in process_name:
                return AppType.WECHAT, f"process_match:{proc}"

        for proc in self.feishu_processes:
            if proc in process_name:
                if proc == "electron":
                    for keyword in self.feishu_titles:
                        if keyword in title:
                            return AppType.FEISHU, f"process_electron+title:{keyword}"
                else:
                    return AppType.FEISHU, f"process_match:{proc}"

        for keyword in self.wechat_titles:
            if title == keyword or (
                title.startswith(keyword)
                and len(title) > len(keyword)
                and not title[len(keyword)].isalnum()
                and title[len(keyword)] != "_"
            ):
                return AppType.WECHAT, f"title_match:{keyword}"

        for keyword in self.feishu_titles:
            if title == keyword or (
                title.startswith(keyword)
                and len(title) > len(keyword)
                and not title[len(keyword)].isalnum()
                and title[len(keyword)] != "_"
            ):
                return AppType.FEISHU, f"title_match:{keyword}"

        return AppType.UNKNOWN, "no_match"

    def route(self, frame_event: FrameEvent) -> RoutedFrame | None:
        app_type, reason = self.identify_app(frame_event.window_meta)
        if app_type == AppType.UNKNOWN:
            return None
        return RoutedFrame(
            app_id=app_type,
            frame=frame_event.frame,
            window_meta=frame_event.window_meta,
            route_reason=reason,
        )

    def is_target_window(self, window: WindowMeta) -> bool:
        app_type, _ = self.identify_app(window)
        return app_type != AppType.UNKNOWN

    def filter_target_windows(self, windows: list[WindowMeta]) -> list[tuple[WindowMeta, AppType]]:
        results = []
        for window in windows:
            app_type, _ = self.identify_app(window)
            if app_type != AppType.UNKNOWN:
                results.append((window, app_type))
        return results


@lru_cache(maxsize=1)
def get_router() -> AppRouter:
    return AppRouter()
