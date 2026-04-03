"""Minimal test to reproduce GBK error with real WeChat screenshot."""

import asyncio

import numpy as np
import winocr
from PIL import Image

IMAGE_NDIM_GRAY = 2
IMAGE_CHANNEL_RGB = 3


def main():
    img = np.array(Image.open("sensor_debug/proactive_wechat_roi_20260321_234212.png"))
    print(f"Image shape: {img.shape}")

    if len(img.shape) == IMAGE_NDIM_GRAY:
        rgba = np.zeros((*img.shape, 4), dtype=np.uint8)
        rgba[:, :, 0] = img
        rgba[:, :, 1] = img
        rgba[:, :, 2] = img
        rgba[:, :, 3] = 255
        img = rgba
    elif img.shape[2] == IMAGE_CHANNEL_RGB:
        rgba = np.zeros((img.shape[0], img.shape[1], 4), dtype=np.uint8)
        rgba[:, :, :3] = img
        rgba[:, :, 3] = 255
        img = rgba

    asyncio.run(test_direct(img))
    print("---")
    asyncio.run(test_via_to_thread(img))


async def test_direct(img):
    print("[1] Direct asyncio.run test:")
    try:
        result = await winocr.recognize_bytes(
            img.tobytes(), img.shape[1], img.shape[0], lang="zh-Hans-CN"
        )
        print("  recognize_bytes OK")
    except Exception as e:
        print(f"  recognize_bytes ERROR: {type(e).__name__}: {e}")
        return

    try:
        pickled = winocr.picklify(result)
        lines = pickled.get("lines", [])
        print(f"  picklify OK, lines={len(lines)}")
        if lines:
            print(f"  first line text: {lines[0].get('text', '???')}")
    except Exception as e:
        print(f"  picklify ERROR: {type(e).__name__}: {e}")


async def test_via_to_thread(img):
    print("[2] asyncio.to_thread + new_event_loop test:")
    try:
        result = await asyncio.to_thread(_sync_ocr, img)
        lines = result.get("lines", [])
        print(f"  to_thread OK, lines={len(lines)}")
        if lines:
            print(f"  first line text: {lines[0].get('text', '???')}")
    except Exception as e:
        print(f"  to_thread ERROR: {type(e).__name__}: {e}")


def _sync_ocr(img):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_async_ocr(img))
    finally:
        loop.close()


async def _async_ocr(img):
    result = await winocr.recognize_bytes(
        img.tobytes(), img.shape[1], img.shape[0], lang="zh-Hans-CN"
    )
    pickled = winocr.picklify(result)
    return pickled


if __name__ == "__main__":
    main()
