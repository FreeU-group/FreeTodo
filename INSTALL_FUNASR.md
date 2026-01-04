# FunASR 安装指南

## 问题说明

FunASR 依赖 `editdistance` 包，该包需要编译 C++ 扩展，因此需要 Microsoft Visual C++ 构建工具。

**当前状态（2025-12-21）：**
- ❌ 使用 `uv pip install funasr` 安装失败（缺少 Visual C++ 构建工具）
- ❌ 使用 `uv pip install funasr --only-binary=:all:` 失败（editdistance 没有预编译 wheel 包）
- ⚠️ **必须安装 Visual C++ 构建工具才能安装 FunASR**

## 安装步骤

### ⭐ 方法 1：安装 Visual C++ 构建工具（必需）

**这是唯一可行的方法！**

1. **下载并安装 Visual C++ 构建工具**
   - 访问：https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - 下载 "Build Tools for Visual Studio"（约 3-6 GB）
   - 运行安装程序
   - **重要**：在安装界面中，选择 "C++ 生成工具" 工作负载（Workload）
   - 点击"安装"并等待完成（可能需要 10-30 分钟）

2. **重启计算机**（安装完成后建议重启）

3. **安装 FunASR**
   ```bash
   # 使用 uv 环境
   uv pip install funasr
   
   # 或者使用 pip（如果在 conda 环境中）
   pip install funasr
   ```

4. **验证安装**
   ```python
   from funasr import AutoModel
   model = AutoModel(model="paraformer-zh")
   print("FunASR 安装成功！")
   ```

### 方法 2：使用 conda（如果使用 conda 环境）

```bash
conda install -c conda-forge funasr
```

**注意**：conda 可能已经包含了编译好的包，但需要确认 conda 环境配置正确。

## 已尝试的方法（记录）

### ❌ 尝试 1：直接安装
```bash
uv pip install funasr
```
**结果**：失败，错误信息：
```
error: Microsoft Visual C++ 14.0 or greater is required.
Get it with "Microsoft C++ Build Tools":
https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

### ❌ 尝试 2：使用预编译包
```bash
uv pip install funasr --only-binary=:all:
```
**结果**：失败，`editdistance` 没有预编译的 wheel 包可用。

### ✅ 解决方案：必须安装 Visual C++ 构建工具

**没有其他替代方案**，必须安装 Visual C++ 构建工具。

## 注意事项

- ⚠️ **如果 FunASR 未安装，系统音频实时识别功能将不可用**
- ✅ **麦克风模式仍然可以使用 Web Speech API（无需 FunASR）**
- 💾 **安装 Visual C++ 构建工具需要约 3-6 GB 磁盘空间**
- ⏱️ **安装 Visual C++ 构建工具需要 10-30 分钟**

## 临时解决方案

如果暂时无法安装 FunASR，可以：
1. ✅ **使用麦克风模式**（Web Speech API）- 完全可用
2. ⚠️ **系统音频模式**：只能录音，无法实时识别
3. 📁 **录音文件**：可以后续通过其他方式处理

## 安装后的配置

安装 FunASR 后，系统会自动使用配置文件中的设置：
- 模型目录：`paraformer-zh`（在 `config.yaml` 中配置）
- 设备：`cpu`（在 `config.yaml` 中配置）

首次运行时，FunASR 会自动下载模型文件（可能需要一些时间）。

