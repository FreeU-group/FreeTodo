"""Test if loguru triggers GBK error on Chinese Windows console."""

from loguru import logger

# Test characters that could cause GBK issues
test_strings = [
    "plain ASCII text",
    "中文测试",
    "→ arrow",
    "WinRT OCR engine initialized (lang=zh-Hans-CN)",
    "OCR backend: WinRT (Windows.Media.Ocr)",
    "[TS] 星期四 00:52 → 2026-03-13 00:52",
    "Debug image saved: sensor_debug\\proactive_wechat_roi_20260321.png",
]

for i, s in enumerate(test_strings):
    try:
        logger.info(f"Test {i}: {s}")
    except Exception as e:
        print(f"FAILED on test {i}: {type(e).__name__}: {e}")
        print(f"  String was: {s!r}")

print("All logger tests done.")
