# 应用图标目录

此目录用于存放应用图标文件。系统会自动根据应用名称（去除.exe后缀）来查找对应的图标。

## 使用方法

1. 将应用图标文件（PNG格式）放置在此目录下
2. 文件命名规则：`应用名称（小写，无.exe后缀）.png`
   - 例如：`msedge.exe` → `msedge.png`
   - 例如：`QQ.exe` → `qq.png`
   - 例如：`explorer.exe` → `explorer.png`

## 图标要求

- **格式**：PNG（推荐）
- **尺寸**：建议 64x64 或 128x128 像素
- **背景**：透明背景（PNG支持透明）

## 示例

以下是一些常见应用的图标文件名：

- `msedge.png` - Microsoft Edge
- `chrome.png` - Google Chrome
- `firefox.png` - Mozilla Firefox
- `qq.png` - QQ
- `wechat.png` - 微信
- `explorer.png` - Windows 文件资源管理器
- `code.png` - Visual Studio Code
- `pycharm.png` - PyCharm

## 注意事项

- 如果应用图标不存在，系统会显示应用名称的首字母作为占位符
- 图标文件名必须与应用名称（去除.exe后缀后转小写）完全匹配
- 建议使用知名应用的官方图标，注意版权问题
