# LifeTrace 桌面版一键脚本使用说明

本说明基于两份脚本：`scirpts/mac_package_desktop.sh`（打包）和 `scirpts/mac_clear_package_desktop.sh`（清理）。两者都只针对 macOS。

## 前置条件
- 在仓库根目录执行。
- 依赖：`bash`、`uv`、`pnpm`、`npm` 已安装并可用。
- 若脚本不可执行，可用 `chmod +x scirpts/mac_package_desktop.sh scirpts/mac_clear_package_desktop.sh`，或直接 `bash <脚本路径>` 运行。

## 快速打包
```bash
bash scirpts/mac_package_desktop.sh
```
执行内容摘要：
- 清理旧产物：`desktop/resources/backend/lifetrace-api`、`desktop/resources/frontend/standalone`、`desktop/app/dist`。
- 前端：`pnpm build`，并复制 `.next/standalone`、`.next/static`、`public` 到 `desktop/resources/frontend/standalone`。
- 后端：PyInstaller onedir 打包到 `desktop/resources/backend/lifetrace-api`，并复制 `lifetrace/config/*.yaml`、`lifetrace/models/*.onnx`。
- Electron：`npm run dist -- --mac dmg`，生成 DMG。

预期结果：
- `desktop/resources/backend/lifetrace-api/` 下存在可执行文件及配置、模型。
- `desktop/resources/frontend/standalone/` 下有 `server.js`、`.next`、`node_modules`、`public`。
- `desktop/app/dist/` 出现 `LifeTrace-<version>-arm64.dmg`（以及展开的 `mac-arm64/LifeTrace.app`）。

## 快速清理
```bash
bash scirpts/mac_clear_package_desktop.sh
```
删除以下路径（若不存在则忽略）：
- `desktop/app/dist`
- `desktop/app/node_modules`
- `desktop/app/resources/backend/lifetrace-api`
- `desktop/app/resources/frontend/standalone`
- `frontend/.next`
- `lifetrace-api.spec`

## 注意事项
- 脚本仅适用于 macOS；其他平台请勿执行。
- 如需在 zsh 环境运行，请使用 `bash <脚本路径>` 以避免 shell 语法差异。
- 打包过程需网络以安装前端依赖/下载模型；网络不通或依赖缺失会导致失败。
- DMG 未签名/未公证，分发给他人时可能需要右键打开或移除隔离属性（`xattr -dr com.apple.quarantine <AppPath>`）。
