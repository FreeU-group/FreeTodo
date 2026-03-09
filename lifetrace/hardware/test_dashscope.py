"""测试 DashScope WebSocket 流式语音识别."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from typing import TYPE_CHECKING

from lifetrace.util.settings import settings

if TYPE_CHECKING:
    from collections.abc import Callable

    import websocket as ws_module

DASHSCOPE_API_KEY = settings.get("llm.api_key")


def _check_websocket_dependency() -> bool:
    """检查 websocket-client 依赖是否已安装."""
    try:
        import websocket  # noqa: PLC0415, F401

        print("✅ websocket-client 已安装")
        return True
    except ImportError:
        print("❌ 请安装 websocket-client:")
        print("   uv pip install websocket-client")
        return False


def _find_test_file() -> str | None:
    """查找测试用的 PCM 文件."""
    pcm_dir = "audio_recordings/pcm"

    if not os.path.exists(pcm_dir):
        return None

    pcm_files = [f for f in os.listdir(pcm_dir) if f.endswith(".pcm")]
    if not pcm_files:
        return None

    test_file = os.path.join(pcm_dir, pcm_files[-1])
    file_size = os.path.getsize(test_file)
    print(f"✅ 找到测试文件: {test_file}")
    print(f"   文件大小: {file_size / 1024:.1f} KB")
    print(f"   音频时长: {file_size / (16000 * 2):.1f} 秒")
    return test_file


def _create_message_handler(
    result_text: list[str],
) -> Callable[[ws_module.WebSocketApp, str], None]:
    """创建消息处理回调函数."""

    def on_message(_ws: ws_module.WebSocketApp, message: str) -> None:
        try:
            data = json.loads(message)
            print(f"[收到消息] {json.dumps(data, ensure_ascii=False, indent=2)[:500]}")

            if "output" in data:
                output = data["output"]
                if "sentence" in output:
                    sentence = output["sentence"]
                    if isinstance(sentence, dict) and "text" in sentence:
                        text = sentence["text"]
                        if text:
                            result_text.append(text)
                            print(f"📝 实时识别: {text}")
        except Exception as e:
            print(f"[解析错误] {e}")
            print(f"[原始消息] {message[:200]}")

    return on_message


def _create_open_handler(
    task_id: str,
    pcm_bytes: bytes,
) -> Callable[[ws_module.WebSocketApp], None]:
    """创建连接打开回调函数."""
    import websocket  # noqa: PLC0415

    def on_open(ws: ws_module.WebSocketApp) -> None:
        print("✅ WebSocket 连接成功!")

        # 发送开始指令
        start_message = {
            "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
            "payload": {
                "model": "paraformer-realtime-v2",
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "parameters": {"sample_rate": 16000, "format": "pcm"},
                "input": {},
            },
        }
        print(f"[发送开始指令] task_id: {task_id}")
        ws.send(json.dumps(start_message))

        # 分块发送音频
        chunk_size = 3200  # 100ms
        total_chunks = (len(pcm_bytes) + chunk_size - 1) // chunk_size

        print(f"[发送音频] 总大小: {len(pcm_bytes)} bytes, 分 {total_chunks} 块发送")

        for i in range(0, len(pcm_bytes), chunk_size):
            chunk = pcm_bytes[i : i + chunk_size]
            ws.send(chunk, opcode=websocket.ABNF.OPCODE_BINARY)
            time.sleep(0.05)

        print("[发送音频完成]")

        # 发送结束指令
        finish_message = {
            "header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"},
            "payload": {"input": {}},
        }
        print("[发送结束指令]")
        ws.send(json.dumps(finish_message))

    return on_open


def _run_websocket_test(pcm_bytes: bytes) -> list[str]:
    """运行 WebSocket 测试."""
    import websocket  # noqa: PLC0415

    print()
    print("正在连接 DashScope WebSocket...")
    print("-" * 60)

    ws_url = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"
    result_text: list[str] = []
    ws_closed = threading.Event()
    task_id = str(uuid.uuid4())

    def on_error(_ws: ws_module.WebSocketApp, error: Exception) -> None:
        print(f"❌ WebSocket错误: {error}")

    def on_close(
        _ws: ws_module.WebSocketApp, close_status_code: int | None, close_msg: str | None
    ) -> None:
        print(f"🔌 连接关闭: {close_status_code} - {close_msg}")
        ws_closed.set()

    # 创建 WebSocket
    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}

    ws = websocket.WebSocketApp(
        ws_url,
        header=headers,
        on_open=_create_open_handler(task_id, pcm_bytes),
        on_message=_create_message_handler(result_text),
        on_error=on_error,
        on_close=on_close,
    )

    # 启动
    ws_thread = threading.Thread(target=ws.run_forever)
    ws_thread.start()

    # 等待结果
    ws_closed.wait(timeout=60)
    ws.close()
    ws_thread.join(timeout=5)

    return result_text


def test_websocket_asr() -> None:
    """测试 DashScope WebSocket 流式语音识别."""
    print("=" * 60)
    print("测试 DashScope WebSocket 流式语音识别")
    print("=" * 60)

    # 检查依赖
    if not _check_websocket_dependency():
        return

    # 查找测试文件
    test_file = _find_test_file()
    if not test_file:
        print("❌ 没有找到 PCM 测试文件")
        print("   请先运行 server.py 接收一些音频")
        return

    # 读取 PCM 数据
    with open(test_file, "rb") as f:
        pcm_bytes = f.read()

    # 运行测试
    result_text = _run_websocket_test(pcm_bytes)

    # 输出结果
    print()
    print("=" * 60)
    if result_text:
        print(f"✅ 最终识别结果: {result_text[-1]}")
    else:
        print("❌ 没有识别到任何文本")
    print("=" * 60)


if __name__ == "__main__":
    test_websocket_asr()
    input("\n按回车键退出...")
