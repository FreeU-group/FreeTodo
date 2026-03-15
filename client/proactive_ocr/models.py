"""数据模型定义"""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AppType(Enum):
    WECHAT = "wechat"
    FEISHU = "feishu"
    UNKNOWN = "unknown"


class ChatType(Enum):
    PRIVATE = "private"
    GROUP = "group"
    UNKNOWN = "unknown"


@dataclass
class BBox:
    x: int
    y: int
    width: int
    height: int

    def to_tuple(self) -> tuple:
        return (self.x, self.y, self.x + self.width, self.y + self.height)

    @classmethod
    def from_tuple(cls, t: tuple) -> "BBox":
        return cls(x=t[0], y=t[1], width=t[2] - t[0], height=t[3] - t[1])


@dataclass
class WindowMeta:
    hwnd: int
    title: str
    process_name: str
    pid: int
    rect: BBox
    is_visible: bool = True
    is_minimized: bool = False


@dataclass
class ImageFrame:
    data: Any
    width: int
    height: int
    timestamp_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    capture_id: str = ""


@dataclass
class FrameEvent:
    frame: ImageFrame
    window_meta: WindowMeta
    capture_id: str


@dataclass
class RoutedFrame:
    app_id: AppType
    frame: ImageFrame
    window_meta: WindowMeta
    route_reason: str = ""


@dataclass
class OcrLine:
    text: str
    score: float
    bbox_px: BBox


@dataclass
class OcrRawResult:
    lines: list[OcrLine]
    engine: str = "rapidocr"
    latency_ms: float = 0
    det_time_ms: float = 0
    rec_time_ms: float = 0
    cls_time_ms: float = 0
    model_version: str = "1.0"
    device: str = "cpu"


@dataclass
class ChatMessage:
    speaker: str
    text: str
    bbox_px: BBox
    is_self: bool = False


@dataclass
class ChatContext:
    chat_type: ChatType
    chat_name: str
    contact_name: str | None
    messages: list[ChatMessage]
    divider_y: int | None = None

    def to_structured_text(self) -> str:
        tag = "私聊" if self.chat_type == ChatType.PRIVATE else "群聊"
        header = f"[{tag}][{self.chat_name}]"
        lines = [header]
        for msg in self.messages:
            lines.append(f"[{msg.speaker}] {msg.text}")
        return "\n".join(lines)

    def to_metadata_dict(self) -> dict:
        return {
            "chat_type": self.chat_type.value,
            "chat_name": self.chat_name,
            "contact_name": self.contact_name,
            "messages": [
                {
                    "speaker": m.speaker,
                    "text": m.text,
                    "is_self": m.is_self,
                    "bbox": m.bbox_px.to_tuple(),
                }
                for m in self.messages
            ],
        }
