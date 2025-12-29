# Next.js + Electron 透明窗口测试

这个项目用于测试 Next.js + Electron 是否能实现透明窗口。

## 安装依赖

```bash
pnpm install
```

## 运行测试

```bash
pnpm dev
```

## 预期结果

- 窗口应该是透明的
- 只显示一个半透明的黑色方块（"Test" 文字）
- 窗口默认是点击穿透的

## 如果窗口仍然显示背景

说明 Next.js SSR 确实会导致窗口显示问题，需要：
1. 使用 `webContents.insertCSS`（已实现）
2. 延迟窗口显示（已实现）
3. 在 CSS 中设置透明背景（已实现）










