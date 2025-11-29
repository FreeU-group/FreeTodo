# 工作区（Workspace）功能详细设计文档

> 本文档详细描述工作区功能的完整设计和实现细节，用于功能迁移和维护参考。

---

## 目录

1. [功能概述](#1-功能概述)
2. [系统架构](#2-系统架构)
3. [数据模型](#3-数据模型)
4. [后端 API 设计](#4-后端-api-设计)
5. [前端组件设计](#5-前端组件设计)
6. [项目管理功能](#6-项目管理功能)
7. [文件管理功能](#7-文件管理功能)
8. [富文本编辑器](#8-富文本编辑器)
9. [AI 功能](#9-ai-功能)
10. [模板系统](#10-模板系统)
11. [国际化设计](#11-国际化设计)
12. [状态管理](#12-状态管理)

---

## 1. 功能概述

### 1.1 定位

工作区是一个**论文/文档写作助手**，提供：
- **项目管理**：以项目（一级文件夹）为单位组织文档
- **文件管理**：支持文件树、创建/上传/删除/重命名
- **富文本编辑**：Markdown 编辑器，支持实时预览
- **AI 辅助写作**：基于 LLM 的文档总结、改进、解释、编辑等功能
- **自动大纲生成**：根据项目类型自动生成论文大纲
- **章节批量生成**：根据大纲自动生成各章节内容

### 1.2 核心流程

```
创建项目 → 选择论文类型 → 自动生成大纲 → 编辑大纲 → 生成章节 → 编辑完善
```

### 1.3 技术栈

- **后端**：FastAPI + Python
- **前端**：Next.js + React + TypeScript
- **存储**：文件系统（workspace 目录）
- **AI**：OpenAI 兼容 API（流式输出）

---

## 2. 系统架构

### 2.1 目录结构

```
lifetrace/
├── routers/
│   └── workspace.py          # 后端路由（1619行）
├── schemas/
│   └── workspace.py          # 数据模型定义
├── templates/
│   └── paper/                # 论文项目模板
│       ├── data/             # 数据文件夹（空模板）
│       └── export/           # 导出文件夹（空模板）
├── config/
│   └── prompt.yaml           # AI 提示词配置
└── data/
    └── workspace/            # 工作区数据存储目录

frontend/
├── components/
│   └── workspace/
│       ├── WorkspaceContainer.tsx      # 主容器组件（1324行）
│       ├── WorkspaceProjectList.tsx    # 项目列表组件（437行）
│       ├── FileTree.tsx                # 文件树组件（402行）
│       ├── RichTextEditor.tsx          # 富文本编辑器（864行）
│       ├── WorkspaceChat.tsx           # AI 对话组件（448行）
│       └── ChapterGenerationModal.tsx  # 章节生成模态框（250行）
└── lib/
    └── api.ts                          # API 调用封装
```

### 2.2 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ WorkspaceProject │→ │ FileTree     │→ │ RichTextEditor   │  │
│  │ List             │  │              │  │                  │  │
│  └──────────────────┘  └──────────────┘  └──────────────────┘  │
│           ↓                   ↓                   ↓              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                        api.ts                               ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────────────│─────────────────────────────────┘
                                 ↓
┌────────────────────────────────│─────────────────────────────────┐
│                        Backend (FastAPI)                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 /api/workspace/*                            ││
│  └─────────────────────────────────────────────────────────────┘│
│           ↓                   ↓                   ↓              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 文件系统     │  │ LLM Client   │  │ Prompt Loader        │  │
│  │ (workspace/) │  │ (流式生成)   │  │ (prompt.yaml)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型

### 3.1 项目类型枚举

```python
# lifetrace/schemas/workspace.py

class ProjectType(str, Enum):
    """论文项目类型"""
    LIBERAL_ARTS = "liberal_arts"  # 文科
    SCIENCE = "science"            # 理科
    ENGINEERING = "engineering"    # 工科
    OTHER = "other"                # 其他
```

### 3.2 工作区项目模型

```python
class WorkspaceProject(BaseModel):
    """工作区项目（一级文件夹）"""
    id: str                            # 项目 ID（即文件夹名）
    name: str                          # 项目名称
    project_type: ProjectType | None   # 项目类型
    file_count: int = 0                # 文件数量
    last_modified: str | None          # 最后修改时间（ISO格式）
    created_at: str | None             # 创建时间（ISO格式）
```

### 3.3 文件节点模型

```python
class FileNode(BaseModel):
    """文件/文件夹节点"""
    id: str                            # 节点 ID（相对路径）
    name: str                          # 文件/文件夹名
    type: str                          # 类型：'file' | 'folder'
    children: list["FileNode"] | None  # 子节点（文件夹有）
    content: str | None                # 文件内容（可选）
    parent_id: str | None              # 父节点 ID
    is_protected: bool = False         # 受保护标记（不可删除）
```

### 3.4 文档 AI 操作类型

```python
class DocumentAction(str, Enum):
    """文档 AI 操作类型"""
    SUMMARIZE = "summarize"   # 总结
    IMPROVE = "improve"       # 改进
    EXPLAIN = "explain"       # 解释
    CUSTOM = "custom"         # 自定义对话
    # 文本编辑操作
    BEAUTIFY = "beautify"     # 美化
    EXPAND = "expand"         # 扩写
    CONDENSE = "condense"     # 缩写
    CORRECT = "correct"       # 修正
    TRANSLATE = "translate"   # 翻译
```

### 3.5 请求/响应模型

| 模型名 | 用途 | 关键字段 |
|--------|------|----------|
| `CreateWorkspaceProjectRequest` | 创建项目 | `name`, `project_type` |
| `CreateWorkspaceProjectResponse` | 创建响应 | `success`, `project_id`, `error` |
| `RenameWorkspaceProjectRequest` | 重命名项目 | `project_id`, `new_name` |
| `DeleteWorkspaceProjectRequest` | 删除项目 | `project_id` |
| `CreateFileRequest` | 创建文件 | `file_name`, `folder`, `content` |
| `CreateFolderRequest` | 创建文件夹 | `folder_name`, `parent_folder` |
| `RenameFileRequest` | 重命名文件 | `file_id`, `new_name` |
| `SaveFileRequest` | 保存文件 | `file_id`, `content` |
| `DeleteFileRequest` | 删除文件 | `file_id` |
| `DocumentAIRequest` | AI 操作 | `action`, `document_content`, `document_name`, `custom_prompt` |

---

## 4. 后端 API 设计

### 4.1 API 路由前缀

```python
router = APIRouter(prefix="/api/workspace", tags=["workspace"])
```

### 4.2 项目管理 API

#### 获取项目列表

```
GET /api/workspace/projects
```

**响应**：`WorkspaceProjectsResponse`
```json
{
  "projects": [
    {
      "id": "论文项目A",
      "name": "论文项目A",
      "file_count": 5,
      "last_modified": "2024-01-01T12:00:00",
      "created_at": "2024-01-01T10:00:00"
    }
  ],
  "total": 1
}
```

**实现逻辑**：
1. 获取 `workspace_dir` 配置路径
2. 遍历一级文件夹（跳过隐藏文件夹）
3. 统计每个项目的文件数和最后修改时间
4. 按名称排序返回

#### 创建项目

```
POST /api/workspace/projects
```

**请求体**：
```json
{
  "name": "我的论文",
  "project_type": "engineering"  // liberal_arts | science | engineering | other
}
```

**实现逻辑**：
1. 验证项目名称（非空、无非法字符）
2. 检查项目是否已存在
3. 创建项目文件夹
4. **复制模板文件夹**（`templates/paper/data/` 和 `templates/paper/export/`）
5. **生成大纲模板**（不调用 LLM，仅替换 `{project_name}` 占位符）
6. 保存 `outline.md` 文件

#### 流式生成大纲

```
POST /api/workspace/projects/{project_id}/outline/generate?project_type=engineering
```

**返回**：`StreamingResponse`（text/plain）

**实现逻辑**：
1. 根据项目类型获取大纲模板
2. 调用 LLM 智能填充大纲内容
3. 流式返回生成的内容
4. 完成后保存到 `outline.md`

#### 流式生成章节

```
POST /api/workspace/projects/{project_id}/chapters/generate
```

**返回**：`StreamingResponse`（application/x-ndjson）

**消息类型**：
```json
// 章节列表
{"type": "chapters", "data": [{"title": "一、绪论", "index": 0}]}

// 开始生成章节
{"type": "chapter_start", "index": 0, "title": "一、绪论"}

// 内容块
{"type": "content", "index": 0, "chunk": "..."}

// 章节完成
{"type": "chapter_done", "index": 0, "title": "一、绪论", "filename": "01_绪论.md", "file_id": "项目名/01_绪论.md"}

// 章节错误
{"type": "chapter_error", "index": 0, "title": "一、绪论", "error": "错误信息"}

// 全部完成
{"type": "done"}

// 错误
{"type": "error", "message": "错误信息"}
```

**实现逻辑**：
1. 读取 `outline.md` 内容
2. 解析大纲提取章节（`## ` 开头的二级标题）
3. 过滤掉「参考文献」章节
4. 逐个章节调用 LLM 生成内容
5. 保存为 `01_章节名.md`、`02_章节名.md` 等文件

#### 重命名项目

```
POST /api/workspace/projects/rename
```

**请求体**：
```json
{
  "project_id": "原项目名",
  "new_name": "新项目名"
}
```

#### 删除项目

```
POST /api/workspace/projects/delete
```

**请求体**：
```json
{
  "project_id": "项目名"
}
```

**安全检查**：确保路径在 workspace 目录内，防止目录穿越攻击。

### 4.3 文件管理 API

#### 获取项目文件列表

```
GET /api/workspace/projects/{project_id}/files
```

**响应**：`WorkspaceFilesResponse`
```json
{
  "files": [
    {
      "id": "项目名/outline.md",
      "name": "outline.md",
      "type": "file",
      "is_protected": true
    },
    {
      "id": "项目名/data",
      "name": "data",
      "type": "folder",
      "children": []
    }
  ],
  "total": 2
}
```

**排序规则**：
1. `outline.md` 在项目根目录时置顶
2. 文件夹优先
3. 按名称字母排序

#### 获取文件内容

```
GET /api/workspace/file?file_id=项目名/outline.md
```

**响应**：`FileContentResponse`
```json
{
  "id": "项目名/outline.md",
  "name": "outline.md",
  "content": "# 大纲内容...",
  "type": "file"
}
```

**编码处理**：
- 尝试 UTF-8 读取
- 如果失败，返回 Base64 编码的二进制内容

#### 创建文件

```
POST /api/workspace/create
```

**请求体**：
```json
{
  "file_name": "新文件.md",
  "folder": "项目名/子文件夹",  // 可选
  "content": ""                  // 初始内容
}
```

**重名处理**：自动添加数字后缀（`新文件_1.md`）

#### 创建文件夹

```
POST /api/workspace/create-folder
```

**请求体**：
```json
{
  "folder_name": "新文件夹",
  "parent_folder": "项目名"  // 可选
}
```

#### 上传文件

```
POST /api/workspace/upload
```

**参数**：
- `file`: 上传的文件（multipart/form-data）
- `folder`: 目标文件夹（query parameter）

**支持格式**：`.txt`, `.md`, `.doc`, `.docx`

**特殊处理**：
- `.doc`/`.docx` 文件会被转换为 `.md` 格式
- 使用 `python-docx` 库提取文本内容

#### 保存文件

```
POST /api/workspace/save
```

**请求体**：
```json
{
  "file_id": "项目名/outline.md",
  "content": "新内容..."
}
```

#### 重命名文件

```
POST /api/workspace/rename
```

**请求体**：
```json
{
  "file_id": "项目名/旧文件名.md",
  "new_name": "新文件名.md"
}
```

**返回**：包含新的 `file_id`

#### 删除文件/文件夹

```
POST /api/workspace/delete
```

**请求体**：
```json
{
  "file_id": "项目名/文件或文件夹"
}
```

**保护机制**：
- 项目根目录下的 `outline.md` 受保护，不可删除
- 通过 `is_protected` 字段标记

### 4.4 AI 操作 API

#### 文档 AI 处理（非流式）

```
POST /api/workspace/ai/process
```

**请求体**：
```json
{
  "action": "summarize",  // summarize | improve | explain | custom | beautify | expand | condense | correct | translate
  "document_content": "文档内容...",
  "document_name": "文件名.md",
  "custom_prompt": "自定义指令（仅 custom 模式）"
}
```

#### 文档 AI 处理（流式）

```
POST /api/workspace/ai/stream
```

**返回**：`StreamingResponse`（text/plain）

**用途**：
- 右侧对话面板的快捷操作（总结、改进、解释）
- 编辑器内的 AI 编辑功能

---

## 5. 前端组件设计

### 5.1 组件层级关系

```
WorkspaceContainer
├── WorkspaceProjectList  (项目列表视图)
│   └── CreateProjectModal
│
├── FileTree              (文件树侧边栏)
│   └── TreeNode         (递归节点)
│
├── RichTextEditor        (中间编辑区)
│   ├── Toolbar          (工具栏)
│   ├── TextArea         (编辑区)
│   ├── AIEditMenu       (AI编辑浮动菜单)
│   └── StatusBar        (状态栏)
│
├── WorkspaceChat         (右侧对话面板)
│
└── ChapterGenerationModal (章节生成进度模态框)
```

### 5.2 WorkspaceContainer

**文件**：`frontend/components/workspace/WorkspaceContainer.tsx`

**职责**：
- 管理工作区整体状态
- 切换项目列表/编辑器视图
- 协调子组件间的数据流

**主要状态**：

```typescript
// 项目状态
const [currentProject, setCurrentProject] = useState<string | null>(null);

// 文件树状态
const [files, setFiles] = useState<FileNode[]>([]);
const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
const [fileContent, setFileContent] = useState('');

// 面板状态
const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
const [isChatCollapsed, setIsChatCollapsed] = useState(false);
const [chatWidth, setChatWidth] = useState(380);

// 大纲生成状态
const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

// 章节生成状态
const [isGeneratingChapters, setIsGeneratingChapters] = useState(false);
const [showChapterModal, setShowChapterModal] = useState(false);
const [chaptersState, setChaptersState] = useState<ChapterState[]>([]);
```

**关键流程**：

1. **进入项目**：
   ```typescript
   const handleSelectProject = (projectId: string, options?: { isNew?: boolean; projectType?: string }) => {
     setCurrentProject(projectId);
     // 如果是新建项目，标记待生成大纲
     if (options?.isNew && options?.projectType) {
       pendingOutlineRef.current = { projectType: options.projectType };
     }
   };
   ```

2. **加载项目文件**：
   - 调用 `api.getProjectFiles(projectId)`
   - 转换后端 `parent_id` 为前端 `parentId`
   - 如果是新建项目，自动开始流式生成大纲

3. **自动保存**：
   - 每 10 秒检查内容是否变化
   - 变化则调用保存 API

4. **AI 编辑**：
   - 维护 `aiEditState` 状态（处理中、预览文本、原始文本、选区位置）
   - 确认后替换选中文本并保存

### 5.3 WorkspaceProjectList

**文件**：`frontend/components/workspace/WorkspaceProjectList.tsx`

**功能**：
- 显示项目卡片网格
- 创建项目弹窗（含类型选择）
- 删除项目确认

**项目类型配置**：

```typescript
const PROJECT_TYPE_CONFIG: { type: ProjectType; icon: typeof BookOpen }[] = [
  { type: 'liberal_arts', icon: BookOpen },     // 文科
  { type: 'science', icon: FlaskConical },      // 理科
  { type: 'engineering', icon: Wrench },        // 工科
  { type: 'other', icon: FileQuestion },        // 其他
];
```

### 5.4 FileTree

**文件**：`frontend/components/workspace/FileTree.tsx`

**功能**：
- 递归渲染文件树
- 展开/折叠文件夹
- 重命名（双击或编辑按钮）
- 删除确认
- 受保护文件显示锁图标

**特殊显示**：
- `outline.md` 使用 Sparkles 图标（蓝色星星）
- 其他文件使用普通文件图标

**节点类型**：

```typescript
export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  parentId?: string;
  is_protected?: boolean;
}
```

### 5.5 RichTextEditor

**文件**：`frontend/components/workspace/RichTextEditor.tsx`

**功能**：
- Markdown 编辑（带行号）
- 工具栏（粗体、斜体、标题、列表等）
- 编辑/预览模式切换
- 保存按钮（Ctrl+S 快捷键）
- 文本选择时显示 AI 编辑菜单
- AI 编辑预览（diff 样式显示）
- 底部状态栏（字数、行数、最后更新时间）

**工具栏配置**：

```typescript
const toolbarConfig = [
  { icon: Bold, before: '**', after: '**', placeholder: '粗体' },
  { icon: Italic, before: '*', after: '*', placeholder: '斜体' },
  { icon: Heading1, before: '# ', after: '' },
  { icon: Heading2, before: '## ', after: '' },
  { icon: Heading3, before: '### ', after: '' },
  { icon: List, before: '- ', after: '' },
  { icon: ListOrdered, before: '1. ', after: '' },
  { icon: Quote, before: '> ', after: '' },
  { icon: Code, before: '`', after: '`' },
  { icon: Link, before: '[', after: '](url)' },
  { icon: Image, before: '![', after: '](url)' },
];
```

**AI 编辑菜单**：

```typescript
const aiMenuItems = [
  { icon: Sparkles, action: 'beautify', label: '美化' },
  { icon: Expand, action: 'expand', label: '扩写' },
  { icon: Shrink, action: 'condense', label: '缩写' },
  { icon: Languages, action: 'translate', label: '翻译' },
  { icon: MessageCircle, action: 'chat', label: '对话' },
];
```

**AI 编辑预览显示**：
- 原文：红色背景 + 删除线
- 新文本：绿色背景
- 完成后显示确认/取消按钮

### 5.6 WorkspaceChat

**文件**：`frontend/components/workspace/WorkspaceChat.tsx`

**功能**：
- 快捷操作按钮（总结、改进、解释）
- 自由对话输入框
- 消息列表（用户/助手区分）
- LLM 健康状态检查
- 流式响应显示

**快捷操作**：

```typescript
const handleQuickAction = async (action: 'summarize' | 'improve' | 'explain') => {
  // 调用 api.processDocumentAIStream
};
```

**消息发送**：
- 有文档内容时：调用 `processDocumentAIStream`（custom 模式）
- 无文档内容时：调用 `sendChatMessageStream`（通用聊天）

### 5.7 ChapterGenerationModal

**文件**：`frontend/components/workspace/ChapterGenerationModal.tsx`

**功能**：
- 显示章节生成进度
- 每个章节可展开查看内容
- 状态图标（等待/生成中/完成/失败）
- 进度条显示

**章节状态**：

```typescript
interface Chapter {
  title: string;
  index: number;
  content: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  isExpanded: boolean;
}
```

---

## 6. 项目管理功能

### 6.1 项目结构

每个项目创建后的初始结构：

```
项目名/
├── outline.md     # 大纲文件（受保护）
├── data/          # 数据文件夹（从模板复制）
│   └── README.md
└── export/        # 导出文件夹（从模板复制）
    └── README.md
```

### 6.2 项目类型与大纲模板

| 类型 | 类型值 | 大纲结构 |
|------|--------|----------|
| 文科 | `liberal_arts` | 绪论 → 理论框架 → 主体论述 → 结论 → 参考文献 |
| 理科 | `science` | 引言 → 研究方法 → 结果与分析 → 讨论 → 结论 → 参考文献 |
| 工科 | `engineering` | 绪论 → 技术基础 → 系统设计 → 实现与测试 → 总结 → 参考文献 |
| 其他 | `other` | 引言 → 文献综述 → 主体内容 → 结论 → 参考文献 |

### 6.3 大纲生成流程

1. **创建项目时**：
   - 仅生成模板版本（替换 `{project_name}` 占位符）
   - 不调用 LLM

2. **进入项目后**：
   - 如果是新建项目，自动调用流式生成 API
   - 编辑器实时显示生成内容
   - 完成后自动保存

3. **手动重新生成**：
   - 可再次调用生成 API 覆盖当前大纲

### 6.4 章节生成流程

1. **触发条件**：
   - 选中 `outline.md` 文件
   - 编辑器底部显示「生成章节」按钮

2. **重新生成确认**：
   - 检测是否存在 `01_xxx.md` 格式的章节文件
   - 如果存在，显示确认对话框

3. **生成过程**：
   - 解析大纲提取二级标题
   - 过滤「参考文献」章节
   - 逐个调用 LLM 生成内容
   - 保存为 `01_章节名.md` 格式

4. **进度展示**：
   - 模态框显示所有章节列表
   - 当前生成的章节展开显示实时内容
   - 完成后可关闭模态框

---

## 7. 文件管理功能

### 7.1 支持的文件格式

| 格式 | 读取 | 编辑 | 上传 |
|------|------|------|------|
| `.md` | ✅ | ✅ | ✅ |
| `.txt` | ✅ | ✅ | ✅ |
| `.doc` | ✅（转换） | ❌ | ✅ |
| `.docx` | ✅（转换） | ❌ | ✅ |
| 图片 | ❌ | ❌ | ❌ |

### 7.2 文件 ID 规则

文件 ID = 相对于 workspace 目录的路径，使用 `/` 分隔

```
项目名/outline.md
项目名/data/文件.md
项目名/子文件夹/文件.md
```

### 7.3 受保护文件

- **规则**：项目根目录下的 `outline.md`
- **判断逻辑**：`file_id.split("/")` 长度为 2 且文件名为 `outline.md`
- **前端显示**：锁图标，不显示删除按钮
- **后端限制**：删除 API 拒绝删除

### 7.4 重名处理

创建文件/文件夹时，如果目标已存在：
- 自动添加数字后缀：`文件.md` → `文件_1.md` → `文件_2.md`

### 7.5 安全检查

所有文件操作都进行路径安全检查：

```python
try:
    file_path.resolve().relative_to(Path(workspace_dir).resolve())
except ValueError:
    raise HTTPException(status_code=403, detail="禁止访问工作区外的文件")
```

---

## 8. 富文本编辑器

### 8.1 编辑模式

| 模式 | 说明 |
|------|------|
| 编辑模式 | 显示 Markdown 源码，支持工具栏操作 |
| 预览模式 | 渲染 Markdown 为 HTML 显示 |

### 8.2 行号显示

- 左侧固定宽度（2.5rem）行号区域
- 同步滚动
- 自动计算每行高度（处理换行）

### 8.3 工具栏功能

| 按钮 | 插入内容 | 快捷键 |
|------|----------|--------|
| 粗体 | `**文本**` | - |
| 斜体 | `*文本*` | - |
| 标题1 | `# 文本` | - |
| 标题2 | `## 文本` | - |
| 标题3 | `### 文本` | - |
| 无序列表 | `- 文本` | - |
| 有序列表 | `1. 文本` | - |
| 引用 | `> 文本` | - |
| 代码 | `` `代码` `` | - |
| 链接 | `[文本](url)` | - |
| 图片 | `![alt](url)` | - |
| 保存 | - | Ctrl+S |

### 8.4 状态栏

显示内容：
- 行数/最大行数（超限显示警告色）
- 字数
- 最后更新时间

### 8.5 AI 编辑菜单

**触发方式**：选中文本后自动显示

**位置计算**：
1. 使用隐藏 div 测量选中文本位置
2. 优先显示在选中文本上方
3. 空间不足时显示在下方

**操作模式**：
1. **功能按钮模式**：美化、扩写、缩写、翻译、对话
2. **对话输入模式**：输入自定义指令

**预览显示**：
- 原文：红色背景 + 删除线
- 新文本：绿色背景
- 确认/取消按钮浮动在新文本后

---

## 9. AI 功能

### 9.1 提示词配置

所有提示词在 `lifetrace/config/prompt.yaml` 中统一管理。

**工作区相关提示词**：

```yaml
workspace_assistant:
  summarize: 文档总结提示词
  improve: 文档改进提示词
  explain: 文档解释提示词
  custom_chat: 自定义对话提示词
  beautify: 文本美化提示词
  expand: 文本扩写提示词
  condense: 文本缩写提示词
  correct: 文本修正提示词
  translate: 文本翻译提示词

project_outline:
  liberal_arts: 文科大纲模板
  science: 理科大纲模板
  engineering: 工科大纲模板
  other: 其他大纲模板
  smart_fill_system: 智能填充系统提示词
  smart_fill_user: 智能填充用户消息模板
  chapter_generate_system: 章节生成系统提示词
  chapter_generate_user: 章节生成用户消息模板
```

### 9.2 操作类型分类

**对话面板操作**（需要完整文档内容）：
- `summarize`：总结文档
- `improve`：提供改进建议
- `explain`：解释文档内容
- `custom`：自定义对话

**文本编辑操作**（仅需选中文本）：
- `beautify`：美化润色
- `expand`：扩写（2-3倍）
- `condense`：缩写（1/2-1/3）
- `correct`：修正错误
- `translate`：中英互译

### 9.3 流式响应处理

**后端**：
```python
def token_generator():
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
    )
    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
```

**前端**：
```typescript
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(params),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  onChunk(chunk);
}
```

### 9.4 Token 使用量记录

每次 AI 调用都记录使用量：

```python
log_token_usage(
    model=model,
    input_tokens=usage_info.prompt_tokens,
    output_tokens=usage_info.completion_tokens,
    endpoint="workspace_ai_stream",
    user_query=request.action.value,
    response_type="stream",
    feature_type="workspace_assistant",
    additional_info={
        "action": request.action.value,
        "document_name": request.document_name,
        "document_length": len(request.document_content),
    },
)
```

---

## 10. 模板系统

### 10.1 模板目录结构

```
lifetrace/templates/paper/
├── data/
│   └── README.md    # 数据文件夹说明
└── export/
    └── README.md    # 导出文件夹说明
```

### 10.2 模板复制逻辑

```python
template_dir = Path(__file__).parent.parent / "templates" / "paper"
if template_dir.exists():
    for item in template_dir.iterdir():
        if item.is_dir():
            dest = project_path / item.name
            shutil.copytree(item, dest)
```

### 10.3 大纲模板格式

```markdown
# {project_name}

## 一、章节标题
- 要点一
- 要点二

## 二、章节标题
- 要点一
- 要点二

## 参考文献
```

### 10.4 章节解析规则

```python
def _parse_outline_chapters(outline_content: str) -> list[dict]:
    chapters = []
    current_chapter = None
    current_points = []

    for line in outline_content.split("\n"):
        if line.startswith("## "):
            # 保存之前的章节
            if current_chapter:
                chapters.append({
                    "title": current_chapter,
                    "points": current_points,
                })
            current_chapter = line[3:].strip()
            current_points = []
        elif line.startswith("- ") and current_chapter:
            current_points.append(line[2:].strip())

    # 过滤参考文献
    chapters = [ch for ch in chapters if "参考文献" not in ch["title"]]
    return chapters
```

### 10.5 章节文件命名

```python
def _sanitize_filename(title: str) -> str:
    # 移除中文数字前缀（如 "一、"）
    title = re.sub(r'^[一二三四五六七八九十]+、\s*', '', title)
    # 移除数字前缀（如 "1."）
    title = re.sub(r'^\d+\.\s*', '', title)
    # 替换非法字符
    invalid_chars = ["/", "\\", ":", "*", "?", '"', "<", ">", "|", " "]
    for char in invalid_chars:
        title = title.replace(char, "_")
    return title[:50]  # 限制长度

# 最终文件名格式：01_章节名.md
filename = f"{i + 1:02d}_{_sanitize_filename(chapter_title)}.md"
```

---

## 11. 国际化设计

### 11.1 标签传递结构

所有显示文本通过 props 传递：

```typescript
interface WorkspaceContainerProps {
  projectLabels: {
    title: string;
    subtitle: string;
    createProject: string;
    projectName: string;
    projectTypes: {
      liberal_arts: string;
      science: string;
      engineering: string;
      other: string;
    };
    // ...
  };
  editorLabels: {
    fileTreeTitle: string;
    uploadLabel: string;
    saveLabel: string;
    editLabel: string;
    previewLabel: string;
    aiEditLabels?: {
      processing: string;
      confirm: string;
      cancel: string;
    };
    aiMenuLabels?: {
      beautify: string;
      expand: string;
      condense: string;
      translate: string;
      chat: string;
    };
    chapterModalLabels?: {
      title: string;
      generating: string;
      complete: string;
      failed: string;
      close: string;
    };
    // ...
  };
  locale: string;
}
```

### 11.2 日期格式化

使用 dayjs 库：

```typescript
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale(locale === 'zh' ? 'zh-cn' : 'en');

// 相对时间：3 分钟前
dayjs(timeStr).fromNow();
```

---

## 12. 状态管理

### 12.1 本地存储

面板状态持久化到 localStorage：

```typescript
// 保存
localStorage.setItem('workspace_fileTreeCollapsed', String(isFileTreeCollapsed));
localStorage.setItem('workspace_chatCollapsed', String(isChatCollapsed));
localStorage.setItem('workspace_chatWidth', String(chatWidth));

// 读取（初始化时）
const [isFileTreeCollapsed] = useState(() =>
  localStorage.getItem('workspace_fileTreeCollapsed') === 'true'
);
```

### 12.2 自动保存

```typescript
useEffect(() => {
  const autoSaveInterval = setInterval(() => {
    if (selectedFile && fileContent !== lastSavedContentRef.current && !isSaving) {
      handleSaveFile();
    }
  }, 10000);  // 每10秒

  return () => clearInterval(autoSaveInterval);
}, [selectedFile, fileContent, isSaving, handleSaveFile]);
```

### 12.3 Ref 使用

| Ref | 用途 |
|-----|------|
| `lastSavedContentRef` | 记录上次保存的内容（比较变化） |
| `pendingOutlineRef` | 记录待生成大纲的项目信息 |
| `fileInputRef` | 文件上传 input 元素引用 |
| `textareaRef` | 编辑器 textarea 引用 |
| `containerRef` | 容器 div 引用（拖动调整宽度） |

---

## 附录 A：API 汇总表

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/workspace/projects` | 获取项目列表 |
| POST | `/api/workspace/projects` | 创建项目 |
| POST | `/api/workspace/projects/{id}/outline/generate` | 流式生成大纲 |
| POST | `/api/workspace/projects/{id}/chapters/generate` | 流式生成章节 |
| POST | `/api/workspace/projects/rename` | 重命名项目 |
| POST | `/api/workspace/projects/delete` | 删除项目 |
| GET | `/api/workspace/projects/{id}/files` | 获取项目文件列表 |
| GET | `/api/workspace/files` | 获取所有文件列表（旧接口） |
| GET | `/api/workspace/file` | 获取文件内容 |
| POST | `/api/workspace/create` | 创建文件 |
| POST | `/api/workspace/create-folder` | 创建文件夹 |
| POST | `/api/workspace/upload` | 上传文件 |
| POST | `/api/workspace/save` | 保存文件 |
| POST | `/api/workspace/rename` | 重命名文件 |
| POST | `/api/workspace/delete` | 删除文件/文件夹 |
| POST | `/api/workspace/ai/process` | AI 操作（非流式） |
| POST | `/api/workspace/ai/stream` | AI 操作（流式） |

---

## 附录 B：前端 API 调用封装

```typescript
// frontend/lib/api.ts

// 项目管理
getWorkspaceProjects: () => apiClient.get('/api/workspace/projects'),
createWorkspaceProject: (name: string, projectType: string = 'other') =>
  apiClient.post('/api/workspace/projects', { name, project_type: projectType }),
renameWorkspaceProject: (projectId: string, newName: string) =>
  apiClient.post('/api/workspace/projects/rename', { project_id: projectId, new_name: newName }),
deleteWorkspaceProject: (projectId: string) =>
  apiClient.post('/api/workspace/projects/delete', { project_id: projectId }),
getProjectFiles: (projectId: string) =>
  apiClient.get(`/api/workspace/projects/${encodeURIComponent(projectId)}/files`),

// 流式 URL
getGenerateOutlineStreamUrl: (projectId: string, projectType: string) =>
  `${API_BASE_URL}/api/workspace/projects/${encodeURIComponent(projectId)}/outline/generate?project_type=${projectType}`,

// 流式生成章节
generateChaptersStream: async (projectId: string, onMessage: (msg) => void) => { ... },

// 文件管理
getWorkspaceFiles: () => apiClient.get('/api/workspace/files'),
getWorkspaceFile: (fileId: string) => apiClient.get('/api/workspace/file', { params: { file_id: fileId } }),
uploadWorkspaceFile: (file: File, folder?: string) => { ... },
createWorkspaceFile: (fileName: string, folder?: string, content?: string) => { ... },
createWorkspaceFolder: (folderName: string, parentFolder?: string) => { ... },
renameWorkspaceFile: (fileId: string, newName: string) => { ... },
saveWorkspaceFile: (fileId: string, content: string) => { ... },
deleteWorkspaceFile: (fileId: string) => { ... },

// AI 操作
processDocumentAI: (params) => apiClient.post('/api/workspace/ai/process', params),
processDocumentAIStream: async (params, onChunk) => { ... },
```

---

## 附录 C：依赖库

### 后端依赖

| 库 | 用途 |
|----|------|
| `fastapi` | Web 框架 |
| `python-docx` | 解析 .docx 文件 |
| `pyyaml` | 解析 prompt.yaml |
| `openai` | LLM API 调用 |

### 前端依赖

| 库 | 用途 |
|----|------|
| `axios` | HTTP 请求 |
| `dayjs` | 日期格式化 |
| `lucide-react` | 图标 |
| `react-markdown` | Markdown 渲染（预览模式） |

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2024-11-29 | 初始版本，完整功能文档 |
