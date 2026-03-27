# iOS 打包测试流程指南

本文档描述 LifeTrace iOS 客户端从代码拉取到 TestFlight 分发的完整流程。

---

## 一、拉取最新代码

```bash
# 1. 切到主开发分支并拉取最新
git checkout dev
git pull origin dev

# 2. 安装/更新前端依赖
pnpm --dir frontend install

# 3.（可选）如果有后端依赖变更
uv sync --directory server
```

> **提示**：如果你用的是 worktree 开发模式，确保在对应 worktree 目录操作，不要在主仓库直接改代码。

---

## 二、Xcode 编译项目

### 2.1 安装依赖 & 打开项目

```bash
# 1. 安装 CocoaPods 依赖（首次或 Podfile 变更后需要执行）
cd phone/ios
pod install
cd ../..

# 2. 打开项目（必须打开 .xcworkspace）
open phone/ios/Runner.xcworkspace
```

> **注意**：必须打开 `.xcworkspace` 而非 `.xcodeproj`，否则 CocoaPods 依赖不会加载。如果 `Runner.xcworkspace` 不存在，说明还没执行过 `pod install`。

### 2.2 配置签名

1. 在 Xcode 左侧选择项目根节点 **Runner** → 顶部标签栏点 **Signing & Capabilities**
2. **Team**：选择 `Xinwen Cao`
3. **Bundle Identifier**：确认为 `com.freeu.freetodo.dev`
4. 确保 **Automatically manage signing** 已勾选

### 2.3 编译检查

1. 顶部选择目标设备为 **Any iOS Device (arm64)**
2. `Cmd + B` 编译，确认没有编译错误
3. 如有 CocoaPods 依赖问题，尝试：

```bash
cd phone/ios
pod install --repo-update
```

---

## 三、预测试：USB 连接真机调试

这一步用于在正式分发前，快速验证核心功能。

### 3.1 准备工作

1. 用 **Type-C 数据线** 连接 iPhone 到 Mac
2. iPhone 上弹出「信任此电脑？」→ 点信任
3. 首次调试需要在 iPhone 上：**设置 → 隐私与安全 → 开发者模式 → 开启**

### 3.2 编译到真机

1. Xcode 顶部设备栏选择你的 iPhone
2. `Cmd + R` 运行
3. 首次可能提示「不受信任的开发者」→ iPhone 上操作：**设置 → 通用 → VPN与设备管理 → 信任开发者证书**

### 3.3 预测试检查清单

| 测试项 | 检查点 |
|---|---|
| 应用启动 | App 能正常启动，无白屏/闪退 |
| 网络连接 | 能连通 Center 后端（检查 API 请求） |
| 核心功能 | 主要交互流程可走通 |
| 权限请求 | 通知、相机等权限弹窗正常 |
| UI 适配 | 不同机型下布局无明显错位 |

> **注意**：预测试通过后再进入 TestFlight 分发流程，避免浪费审核时间。

---

## 四、正式测试：TestFlight 分发

### 4.1 添加测试人员

1. 登录 [App Store Connect](https://appstoreconnect.apple.com)
2. 进入 App → **TestFlight** → **内部测试** 或 **外部测试**
3. 点击 **+** 添加测试人员（输入 Apple ID 邮箱）

| 类型 | 人数上限 | 审核 | 适用场景 |
|---|---|---|---|
| 内部测试 | 100 人 | 无需审核 | 团队成员快速验证 |
| 外部测试 | 10000 人 | 需 Beta 审核 | 更大范围公测 |

### 4.2 打包 Archive

1. Xcode 顶部设备选择 **Any iOS Device (arm64)**
2. 菜单：**Product → Archive**
3. 等待 Archive 完成（会自动打开 Organizer 窗口）

> **常见问题**：
> - Archive 菜单灰色 → 确认选择的是真机而非模拟器
> - 签名错误 → 检查 Signing & Capabilities 中的 Team 和 Provisioning Profile

### 4.3 上传到 App Store Connect

1. 在 Organizer 窗口中选择刚才的 Archive
2. 点击 **Distribute App**
3. 选择 **App Store Connect** → **Upload**
4. 按提示确认签名选项，点 **Upload**
5. 等待上传完成（取决于包大小和网络，通常 5-15 分钟）

### 4.4 在 TestFlight 中分发

1. 上传成功后，等待 Apple 处理（通常 10-30 分钟，会收到邮件通知）
2. 回到 App Store Connect → **TestFlight**
3. 找到新版本 Build → 添加到测试组
4. 如果是**外部测试**，需要填写测试说明并提交审核（通常 24-48 小时）

### 4.5 测试人员安装

1. 测试人员会收到 TestFlight 邀请邮件
2. 在 iPhone 上安装 [TestFlight App](https://apps.apple.com/app/testflight/id899247664)
3. 打开邮件中的链接 → 接受邀请 → 安装测试版本

---

## 五、测试反馈与迭代

### 5.1 收集反馈

- TestFlight 内置截图反馈功能（测试人员截图后自动弹出反馈入口）
- App Store Connect 中可查看崩溃日志和反馈

### 5.2 迭代发版

```
修复 Bug → 递增 Build Number → 重新 Archive → 上传 → 分发
```

> **注意**：同一个 Version 可以上传多个 Build，无需改版本号，只需递增 Build Number。
>
> 修改位置：Xcode → 项目 → General → **Build**（如从 1 改为 2）

---

## 快速命令速查

```bash
# 拉取最新代码
git pull origin dev

# 安装前端依赖
pnpm --dir frontend install

# 安装 CocoaPods 依赖（首次或 Podfile 变更后）
cd phone/ios && pod install && cd ../..

# 打开 Xcode 项目
open phone/ios/Runner.xcworkspace
```
