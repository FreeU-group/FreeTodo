## Omi 移动端开发环境搭建说明（Android & iOS）

本文档介绍如何在本地搭建 **Omi Flutter App** 的移动端开发环境，并完成 **运行调试** 与 **打包发布**。
适用目录：`app/`

---

## 一、通用准备（所有平台）

- **1. 安装 Flutter SDK**
  - 建议版本：**3.35.3 或更高**（与项目脚本一致）。
  - 按 Flutter 官方文档安装后，配置好环境变量 `PATH`，保证终端可以执行：
  - 在开发环境中安装即可

```bash
flutter --version
flutter doctor
```

  - `flutter doctor` 中如果有 Android / iOS 相关的红色错误，按提示安装对应工具后再重试。

- **2. 安装 Opus 编解码库**
  - Omi 的实时音频依赖 Opus 编解码：
  - 参考官网安装说明：`https://opus-codec.org`

- **3. 克隆仓库并进入 app 目录**

```bash
git clone <your-omi-repo-url> E:\flutter\omi
cd E:\flutter\omi\app
```

后续命令除特别说明外，均假设当前目录为 `app/`。

![image-20260225163302523](docs/images/image-20260225163302523.png)

---

## 二、Android 开发环境（推荐 Windows + Android Studio）

### 2.1 安装 Android Studio

项目推荐配置（来自 `setup.sh`）：

- Android Studio：**Iguana | 2024.3** 或更高
- Android SDK Platform：**API 36**
- JDK：**21**
- Gradle：**8.10**
- NDK：**28.2.13676358**

安装 Android Studio 时勾选：

- Android SDK
- Android SDK Platform-Tools
- Android SDK Build-Tools

### 2.2 配置 Android SDK 与 NDK

1. 打开 Android Studio → `Settings` / `Preferences`。
2. 进入：`Appearance & Behavior > System Settings > Android SDK`。
3. 在 **SDK Platforms** 选项卡中：
   - 勾选 / 安装 **Android 15 (API 36)**（或包含 API 36 的对应项）。
4. 在 **SDK Tools** 选项卡中：
   - 勾选 **Android SDK Build-Tools**
   - 勾选 **Android SDK Platform-Tools**
   - 勾选 **NDK (Side by side)**，选择版本 **28.2.13676358** 或更高。

### 2.3 配置 JDK

- 安装 **JDK 21**。
- 在 Android Studio 中：
  - 打开 `Settings > Build, Execution, Deployment > Build Tools > Gradle`
  - 将 Gradle JDK 指向本地 JDK 21 安装路径。

### 2.4 创建 Android 模拟器

1. 打开 Android Studio 顶部工具栏 → **Device Manager**。
2. 点击 **Create Device**，选择常用机型（如 Pixel 7）。
3. 选择对应 API 的系统镜像（建议 API 34+）。
4. 创建完成后，在 Device Manager 中点击运行，确保模拟器可以正常启动。

### 2.5 运行 Android 开发环境脚本

> 目录需在 `app/`：`E:\flutter\omi\app`

- 在 Windows 上可以使用 **PowerShell + Git Bash** 或 **WSL 终端** 来执行 `bash`：

```powershell
cd E:\flutter\omi\app
bash setup.sh android
```

该脚本会自动完成：

- 复制 Android keystore 配置：`setup/prebuilt/key.properties -> android/`
- 配置 Firebase：
  - `firebase_options.dart`（dev / prod）
  - `google-services.json`（dev / prod）
  - `GoogleService-Info.plist`（iOS / macOS 对应目录）
- 生成应用开发环境变量文件：`.dev.env`（默认 `API_BASE_URL=https://api.omiapi.com/` 等）
- 拉取依赖 + 代码生成 + 运行 dev flavor：

```bash
flutter pub get
dart run build_runner build
flutter run --flavor dev
```

执行成功后，会在已连接的 Android 模拟器 / 真机上自动运行 Dev 环境的 Omi App。

![image-20260225163143633](docs/images/image-20260225163143633.png)

---

## 三、Android 打包（Release 构建）

### 3.1 使用项目提供脚本（推荐）

在 `app/` 目录中执行：

```bash
cd E:\flutter\omi\app
bash release.sh
```

脚本内部步骤（`app/release.sh`）：

```bash
flutter clean
dart run build_runner build
flutter pub get

flutter build appbundle --release --flavor prod -t lib/main_prod.dart
flutter build apk --release --flavor prod -t lib/main_prod.dart
```

产物位置示例：

- AAB：`build/app/outputs/bundle/prodRelease/*.aab`
- APK：`build/app/outputs/flutter-apk/app-prod-release.apk`

---

## 四、常用命令速查（Cheat Sheet）

- **开发环境：Android**

```bash
cd app
bash setup.sh android
```

- **开发环境：iOS（macOS）**

```bash
cd app
bash setup.sh ios
```

- **开发环境：macOS 桌面端（选用）**

```bash
cd app
bash setup.sh macos
```

- **Android Release 打包（AAB + APK，一键脚本）**

```bash
cd app
bash release.sh
```
