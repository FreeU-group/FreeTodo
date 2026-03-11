"""Audio Webhook Server - 接收音频并进行实时语音识别."""

from __future__ import annotations

import glob
import io
import json
import os
import threading
import uuid
import wave
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, Request

from lifetrace.util.settings import settings

if TYPE_CHECKING:
    import websocket as ws_module

app = FastAPI()

# ==================== DashScope API 配置 ====================
DASHSCOPE_API_KEY = settings.get("llm.api_key")

# 创建保存目录
os.makedirs("audio_recordings/pcm", exist_ok=True)
os.makedirs("audio_recordings/wav", exist_ok=True)
os.makedirs("audio_recordings/transcripts", exist_ok=True)
os.makedirs("logs", exist_ok=True)

# 常量
PREVIEW_MAX_LENGTH = 100

# LLM 润色等待时间（秒）：最后一句话之后等多久触发润色
LLM_FLUSH_DELAY = 4.0


# ==================== LLM 文本润色器 ====================
class TextPolisher:
    """用 LLM 润色 ASR 转录文本，积累句子后批量处理."""

    SYSTEM_PROMPT = (
        "你是一个语音转文字的后处理助手。用户会给你语音识别的原始文本，请你：\n"
        "1. 修正明显的语音识别错误（同音字、谐音错误）\n"
        "2. 去掉口语赘词（嗯、啊、那个、就是说、然后等）\n"
        "3. 补全和修正标点符号\n"
        "4. 修复因音频分段导致的语义断裂，使上下文连贯通顺\n"
        "5. 保持原意不变，不要添加或删除实质内容\n"
        "6. 直接输出修正后的文本，不要任何解释或前缀\n"
    )

    def __init__(self) -> None:
        self._buffer: list[str] = []
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None
        self._client: Any = None

    def _get_client(self) -> Any:
        """懒加载 OpenAI 客户端（DashScope 兼容接口）."""
        if self._client is None:
            from openai import OpenAI  # noqa: PLC0415

            self._client = OpenAI(
                api_key=DASHSCOPE_API_KEY,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            )
        return self._client

    def add_sentence(self, text: str) -> None:
        """添加一句 ASR 识别结果，并重置倒计时."""
        with self._lock:
            self._buffer.append(text)
            # 重置倒计时
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(LLM_FLUSH_DELAY, self._flush)
            self._timer.daemon = True
            self._timer.start()

    def _flush(self) -> None:
        """将缓冲区中的句子发送给 LLM 润色."""
        with self._lock:
            if not self._buffer:
                return
            raw_text = "".join(self._buffer)
            self._buffer.clear()

        # 在后台线程调用 LLM
        threading.Thread(target=self._call_llm, args=(raw_text,), daemon=True).start()

    def _call_llm(self, raw_text: str) -> None:
        """调用 LLM 润色文本."""
        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model="qwen-turbo",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": raw_text},
                ],
                temperature=0.3,
                max_tokens=2000,
            )
            polished = response.choices[0].message.content or raw_text
            print(f"\n   📝 {polished}")
        except Exception as e:
            # LLM 失败时回退到原始文本
            print(f"\n   📝 {raw_text}")
            print(f"   ⚠️ LLM润色失败: {e}")


# 全局润色器
text_polisher = TextPolisher()


# ==================== 全局 WebSocket 管理器 ====================
class ASRWebSocketManager:
    """管理持久的 WebSocket 连接."""

    def __init__(self) -> None:
        self.ws: ws_module.WebSocketApp | None = None
        self.ws_thread: threading.Thread | None = None
        self.ws_ready = threading.Event()
        self.ws_lock = threading.Lock()
        self.task_id: str | None = None
        self.result_callback: Any = None
        self.is_running = False
        self.sample_rate = 16000

    def start(self, sample_rate: int = 16000) -> bool:
        """启动 WebSocket 连接."""
        if self.is_running:
            return True

        try:
            import websocket  # noqa: PLC0415
        except ImportError:
            print("❌ 请安装 websocket-client")
            return False

        self.sample_rate = sample_rate
        self.task_id = str(uuid.uuid4())
        self.ws_ready.clear()

        ws_url = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"
        headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}

        self.ws = websocket.WebSocketApp(
            ws_url,
            header=headers,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )

        self.ws_thread = threading.Thread(
            target=lambda: self.ws.run_forever(ping_interval=30, ping_timeout=10)
            if self.ws
            else None,
            daemon=True,
        )
        self.ws_thread.start()

        # 等待连接建立
        if not self.ws_ready.wait(timeout=10):
            print("   ❌ WebSocket 连接超时")
            return False

        return True

    def _on_message(self, _ws: ws_module.WebSocketApp, message: str) -> None:
        """处理收到的消息."""
        try:
            data = json.loads(message)
            self._handle_message_data(data)
        except Exception as e:
            print(f"   解析消息错误: {e}")

    def _handle_message_data(self, data: dict[str, Any]) -> None:
        """处理解析后的消息数据."""
        # 检查错误
        if "header" in data:
            header = data["header"]
            event = header.get("event", "")
            code = header.get("code")
            if code and code not in {"Success", 0}:
                print(f"   ❌ API错误: {header.get('message', code)}")
                return

            # 任务完成，需要重新开始新任务
            if event == "task-finished":
                self._start_new_task()
                return

        # 提取识别结果
        self._extract_recognition_result(data)

    def _extract_recognition_result(self, data: dict[str, Any]) -> None:
        """提取识别结果."""
        if "payload" not in data or "output" not in data["payload"]:
            return

        output = data["payload"]["output"]
        if "sentence" not in output:
            return

        sentence = output["sentence"]
        if not isinstance(sentence, dict) or "text" not in sentence:
            return

        text = sentence["text"]
        is_final = sentence.get("sentence_end", False)
        if not text:
            return

        # 显示中间结果和最终结果
        if is_final:
            print(f"   ✓ {text}")
            # 送入 LLM 润色器
            text_polisher.add_sentence(text)
            if self.result_callback:
                self.result_callback(text)
        else:
            print(f"   ... {text}", end="\r")

    def _on_error(self, _ws: ws_module.WebSocketApp, error: Exception) -> None:
        """处理错误."""
        print(f"   ❌ WebSocket错误: {error}")
        self.is_running = False

    def _on_close(self, _ws: ws_module.WebSocketApp, _code: int | None, _msg: str | None) -> None:
        """处理连接关闭."""
        print("   🔌 WebSocket 连接关闭")
        self.is_running = False
        self.ws_ready.clear()

    def _on_open(self, _ws: ws_module.WebSocketApp) -> None:
        """处理连接打开."""
        print("   ✅ ASR WebSocket 连接成功!")
        self.is_running = True
        self.ws_ready.set()
        self._start_new_task()

    def _start_new_task(self) -> None:
        """开始新的识别任务."""
        if not self.ws:
            return
        self.task_id = str(uuid.uuid4())
        start_message = {
            "header": {"action": "run-task", "task_id": self.task_id, "streaming": "duplex"},
            "payload": {
                "model": "paraformer-realtime-v2",
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "parameters": {"sample_rate": self.sample_rate, "format": "pcm"},
                "input": {},
            },
        }
        try:
            self.ws.send(json.dumps(start_message))
        except Exception as e:
            print(f"   ❌ 启动任务失败: {e}")

    def send_audio(self, pcm_bytes: bytes) -> bool:
        """发送音频数据."""
        if (not self.is_running or not self.ws) and not self.start():
            return False

        try:
            import websocket  # noqa: PLC0415

            with self.ws_lock:
                if self.ws:
                    # 直接发送整个音频块
                    self.ws.send(pcm_bytes, opcode=websocket.ABNF.OPCODE_BINARY)
            return True
        except Exception as e:
            print(f"   ❌ 发送音频失败: {e}")
            self.is_running = False
            return False

    def stop(self) -> None:
        """停止连接."""
        if self.ws:
            try:
                # 发送结束指令
                finish_message = {
                    "header": {
                        "action": "finish-task",
                        "task_id": self.task_id,
                        "streaming": "duplex",
                    },
                    "payload": {"input": {}},
                }
                self.ws.send(json.dumps(finish_message))
                self.ws.close()
            except Exception:  # nosec B110
                pass
        self.is_running = False


# 全局 ASR 管理器
asr_manager = ASRWebSocketManager()


def pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
    """将PCM16转换为WAV格式."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)  # 单声道
        wav_file.setsampwidth(2)  # 16位 = 2字节
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    buffer.seek(0)
    return buffer.read()


@app.post("/audio")
async def receive_audio(request: Request, uid: str, sample_rate: int) -> dict[str, Any]:
    """接收音频数据.

    参数:
    - uid: 用户/设备ID
    - sample_rate: 采样率（通常是16000 Hz）
    """
    _ = uid  # 保留参数用于 API 兼容性
    # 获取原始音频字节 (PCM格式)
    audio_bytes = await request.body()

    # 计算音频时长
    duration = len(audio_bytes) / (sample_rate * 2)  # 2字节per sample

    # 确保 ASR 连接已建立，然后直接发送音频
    if not asr_manager.is_running:
        asr_manager.start(sample_rate)

    # 直接发送音频到持久连接（不阻塞）
    asr_manager.send_audio(audio_bytes)

    return {
        "status": "success",
        "bytes_received": len(audio_bytes),
        "duration_seconds": round(duration, 2),
    }


@app.get("/")
async def root() -> dict[str, Any]:
    """健康检查接口."""
    return {
        "status": "running",
        "service": "Audio Webhook",
        "version": "2.0",
        "asr": "DashScope Paraformer (WebSocket)",
        "endpoints": {
            "/": "服务状态",
            "/audio": "接收音频（POST）",
            "/recordings": "查看录音列表",
            "/transcripts": "查看转录列表",
        },
    }


@app.get("/recordings")
async def list_recordings() -> dict[str, Any]:
    """查看所有录音."""
    wav_files = sorted(glob.glob("audio_recordings/wav/*.wav"))

    recordings = []
    for wav_file in wav_files[-10:]:  # 最近10个
        stat = os.stat(wav_file)
        recordings.append(
            {
                "file": os.path.basename(wav_file),
                "size_kb": round(stat.st_size / 1024, 2),
                "created": datetime.fromtimestamp(stat.st_ctime, tz=UTC).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            }
        )

    return {"total": len(wav_files), "recent": recordings}


@app.get("/transcripts")
async def list_transcripts() -> dict[str, Any]:
    """查看所有转录文本."""
    txt_files = sorted(glob.glob("audio_recordings/transcripts/*.txt"))

    transcripts = []
    for txt_file in txt_files[-10:]:
        with open(txt_file, encoding="utf-8") as f:
            content = f.read()
            # 提取转录文本
            if "转录文本:" in content:
                text = content.split("转录文本:")[1].strip()
            else:
                text = content[:200]

        preview = text[:PREVIEW_MAX_LENGTH] + "..." if len(text) > PREVIEW_MAX_LENGTH else text
        transcripts.append(
            {
                "file": os.path.basename(txt_file),
                "preview": preview,
            }
        )

    return {"total": len(txt_files), "recent": transcripts}


def main() -> None:
    """启动服务器."""
    import uvicorn  # noqa: PLC0415

    print("=" * 70)
    print("🎙️  Audio Webhook Server v2.0")
    print("=" * 70)
    print("📡 本地地址: http://localhost:8000")
    print("🌐 公网地址: 请使用 ngrok http 8000 获取")
    print("")
    print("🤖 语音识别: DashScope Paraformer (WebSocket 流式)")
    print("")
    print("📝 功能:")
    print("   - 接收音频: POST /audio")
    print("   - 查看状态: GET /")
    print("   - 查看录音: GET /recordings")
    print("   - 查看转录: GET /transcripts")
    print("")
    print("💾 文件保存位置:")
    print("   - PCM原始格式: audio_recordings/pcm/")
    print("   - WAV播放格式: audio_recordings/wav/")
    print("   - 转录文本: audio_recordings/transcripts/")
    print("   - 日志文件: logs/")
    print("=" * 70)

    # 启动服务器 - 绑定 127.0.0.1 以避免安全警告
    # 如需外部访问，请使用 ngrok 或反向代理
    uvicorn.run(app, host="127.0.0.1", port=8000, access_log=False)


if __name__ == "__main__":
    main()
