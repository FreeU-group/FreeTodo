from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from typing import Any

AUDIO_SAMPLE_RATE = 16000
AUDIO_CHANNELS = 1
AUDIO_BLOCK_SIZE = 1024
AUDIO_RECONNECT_DELAY = 5.0
AUDIO_DISABLE_CHECK_INTERVAL = 3.0


async def audio_loop(daemon) -> None:
    """Continuously stream PC audio to the Center ASR service."""
    await asyncio.sleep(3)
    while True:
        if not daemon._audio_enabled:
            daemon._audio_running = False
            await asyncio.sleep(AUDIO_DISABLE_CHECK_INTERVAL)
            continue
        try:
            await run_audio_stream(daemon)
        except Exception as exc:
            daemon.logger.error(f"Audio stream error: {exc}", exc_info=True)
            daemon._audio_running = False
        await asyncio.sleep(AUDIO_RECONNECT_DELAY)


async def run_audio_stream(daemon) -> None:
    import sounddevice as sd  # noqa: PLC0415
    import websockets  # noqa: PLC0415

    ws_url = daemon.center_url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/audio/transcribe?source=mic_pc&node_id={daemon.node_id}"
    connect_kwargs: dict[str, Any] = {"close_timeout": 5, "proxy": None}

    daemon.logger.info(f"[audio] Connecting to {ws_url}")
    async with websockets.connect(ws_url, **connect_kwargs) as ws:
        await ws.send(json.dumps({"is_24x7": True}))
        daemon.logger.info("[audio] WebSocket connected, starting sounddevice capture")

        audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=200)
        loop = asyncio.get_running_loop()

        def _audio_callback(indata, _frames, _time_info, status) -> None:
            if status:
                daemon.logger.warning(f"[audio] sounddevice status: {status}")
            loop.call_soon_threadsafe(audio_queue.put_nowait, bytes(indata))

        stream = sd.InputStream(
            samplerate=AUDIO_SAMPLE_RATE,
            channels=AUDIO_CHANNELS,
            dtype="int16",
            blocksize=AUDIO_BLOCK_SIZE,
            callback=_audio_callback,
        )
        stream.start()
        daemon._audio_running = True
        daemon.logger.info("[audio] Capture started (sounddevice -> Center ASR)")

        try:
            send_task = asyncio.create_task(audio_send_loop(ws, audio_queue))
            recv_task = asyncio.create_task(audio_recv_loop(daemon, ws))
            stop_task = asyncio.create_task(audio_config_watch(daemon, ws))

            done, pending = await asyncio.wait(
                [send_task, recv_task, stop_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            for task in done:
                if task.exception() is not None:
                    raise task.exception()  # type: ignore[misc]
        finally:
            stream.stop()
            stream.close()
            daemon._audio_running = False
            daemon.logger.info("[audio] Capture stopped")


async def audio_send_loop(ws, audio_queue: asyncio.Queue) -> None:
    """Drain PCM chunks from the queue and send them to the WebSocket."""
    while True:
        chunk = await audio_queue.get()
        if chunk is None:
            break
        try:
            await ws.send(chunk)
        except Exception:
            break


async def audio_recv_loop(daemon, ws) -> None:
    """Log streaming transcription results returned by the Center."""
    try:
        async for raw in ws:
            if isinstance(raw, str):
                try:
                    msg = json.loads(raw)
                    name = msg.get("header", {}).get("name", "")
                    if name == "TranscriptionResultChanged":
                        payload = msg.get("payload", {})
                        text = payload.get("result", "")
                        is_final = payload.get("is_final", False)
                        if is_final and text.strip():
                            daemon.logger.info(f"[audio] ✓ {text}")
                    elif name == "TaskFailed":
                        err = msg.get("payload", {}).get("error", "unknown")
                        daemon.logger.error(f"[audio] ASR error: {err}")
                except json.JSONDecodeError:
                    pass
    except Exception:
        daemon.logger.debug("[audio] Receive loop closed", exc_info=True)


async def audio_config_watch(daemon, ws) -> None:
    """Close the socket as soon as audio is disabled remotely."""
    while daemon._audio_enabled:
        await asyncio.sleep(2)
    daemon.logger.info("[audio] Audio perception disabled by remote config, closing stream")
    with suppress(Exception):
        await ws.close()
