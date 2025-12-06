'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Editor, EditorContent, EditorContext, useEditor } from '@tiptap/react';
import {
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Save,
  Eye,
  Edit3,
  FileText,
  FileWarning,
  Sparkles,
  Expand,
  Shrink,
  MessageCircle,
  Languages,
  Undo2,
  Send,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import Button from '@/components/common/Button';
import MarkdownPreview from '@/components/common/MarkdownPreview';

// --- Tiptap Core Extensions ---
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Selection } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';

// --- Tiptap UI Primitives ---
import { Spacer } from '@/components/workspace/tiptap/tiptap-ui-primitive/spacer';
// 行号暂时不使用
// import { LineNumberGutter } from '@/components/workspace/tiptap/tiptap-ui-primitive/line-number-gutter/line-number-gutter';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/workspace/tiptap/tiptap-ui-primitive/toolbar';

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/workspace/tiptap/tiptap-node/image-upload-node/image-upload-node-extension';
import { HorizontalRule } from '@/components/workspace/tiptap/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';

// --- Tiptap Extension ---
import { AIDiffDelete, AIDiffInsert } from '@/components/workspace/tiptap/tiptap-extension/ai-diff-extension';
// import { LineNumbers } from '@/components/workspace/tiptap/tiptap-extension/line-numbers-extension';

// --- Tiptap Node Styles ---
import '@/components/workspace/tiptap/tiptap-scss/blockquote-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/code-block-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/horizontal-rule-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/list-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/image-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/heading-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/paragraph-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/simple-editor.scss';
import '@/components/workspace/tiptap/tiptap-scss/ai-diff-node.scss';

// --- Tiptap UI ---
import { HeadingDropdownMenu } from '@/components/workspace/tiptap/tiptap-ui/heading-dropdown-menu';
import { ImageUploadButton } from '@/components/workspace/tiptap/tiptap-ui/image-upload-button';
import { ListDropdownMenu } from '@/components/workspace/tiptap/tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from '@/components/workspace/tiptap/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/workspace/tiptap/tiptap-ui/code-block-button';
import { ColorHighlightPopover } from '@/components/workspace/tiptap/tiptap-ui/color-highlight-popover';
import { LinkPopover } from '@/components/workspace/tiptap/tiptap-ui/link-popover';
import { MarkButton } from '@/components/workspace/tiptap/tiptap-ui/mark-button';
import { TextAlignButton } from '@/components/workspace/tiptap/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/workspace/tiptap/tiptap-ui/undo-redo-button';

// --- Components ---

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

// --- Tiptap Toolbar Content ---
const MainToolbarContent = () => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} />
        <ListDropdownMenu types={['bulletList', 'orderedList', 'taskList']} />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        <ColorHighlightPopover />
        <LinkPopover />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />
    </>
  );
};

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  /** Unique file ID used as key for editor re-mounting */
  fileId?: string;
  fileName?: string;
  /** Project ID for image uploads and other project-specific operations */
  projectId?: string;
  /** Callback when image upload succeeds */
  onImageUploadSuccess?: () => void;
  saveLabel: string;
  editLabel: string;
  previewLabel: string;
  noFileLabel: string;
  selectFileHint: string;
  // 不支持的文件类型信息
  unsupportedFileInfo?: {
    fileName: string;
    message: string;
    supportedFormats: string;
  };
  // 文件树折叠控制
  isFileTreeCollapsed?: boolean;
  onToggleFileTree?: () => void;
  collapseSidebarLabel?: string;
  expandSidebarLabel?: string;
  // 对话面板折叠控制
  isChatCollapsed?: boolean;
  onToggleChat?: () => void;
  collapseChatLabel?: string;
  expandChatLabel?: string;
  // 状态栏
  wordCountLabel?: string;
  lineCountLabel?: string;
  lastUpdatedLabel?: string;
  lastUpdatedTime?: Date | null;
  maxLines?: number;
  // AI 编辑菜单
  onAIEdit?: (action: string, selectedText: string, customPrompt?: string) => void;
  aiMenuLabels?: {
    beautify: string;
    expand: string;
    condense: string;
    translate: string;
    chat: string;
    chatPlaceholder: string;
    send: string;
    back: string;
  };
  // AI 编辑状态
  aiEditState?: {
    isProcessing: boolean;
    previewText: string;
    originalText: string;
    selectionFrom: number;  // Tiptap position (was selectionStart)
    selectionTo: number;    // Tiptap position (was selectionEnd)
  };
  onAIEditConfirm?: () => void;
  onAIEditCancel?: () => void;
  aiEditLabels?: {
    processing: string;
    confirm: string;
    cancel: string;
  };
  /** Callback when editor instance is initialized */
  onEditorInitialized?: (editor: Editor) => void;
}

export default function RichTextEditorTiptap({
  content,
  onChange,
  onSave,
  placeholder = '',
  readOnly = false,
  fileId,
  fileName,
  projectId,
  onImageUploadSuccess,
  onEditorInitialized,
  saveLabel,
  editLabel,
  previewLabel,
  noFileLabel,
  selectFileHint,
  unsupportedFileInfo,
  isFileTreeCollapsed,
  onToggleFileTree,
  collapseSidebarLabel,
  expandSidebarLabel,
  isChatCollapsed,
  onToggleChat,
  collapseChatLabel,
  expandChatLabel,
  wordCountLabel,
  lineCountLabel = '{count}/{max} 行',
  lastUpdatedLabel,
  lastUpdatedTime,
  maxLines = 1000,
  onAIEdit,
  aiMenuLabels = {
    beautify: '美化',
    expand: '扩写',
    condense: '缩写',
    translate: '翻译',
    chat: '对话',
    chatPlaceholder: '输入指令...',
    send: '发送',
    back: '返回',
  },
  aiEditState,
  onAIEditConfirm,
  onAIEditCancel,
  aiEditLabels = {
    processing: 'AI 处理中...',
    confirm: '确认',
    cancel: '取消',
  },
}: RichTextEditorProps) {
  const [isPreview, setIsPreview] = useState(false);
  const contentRef = useRef<string>(content);

  // AI 编辑菜单状态
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiMenuPosition, setAIMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [isChatMode, setIsChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  // 处理键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave?.();
    }
  };

  // 处理 AI 菜单动作
  const handleAIAction = useCallback(
    (action: string) => {
      if (action === 'chat') {
        setIsChatMode(true);
        setChatInput('');
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 0);
        return;
      }

      if (selectedText && onAIEdit) {
        onAIEdit(action, selectedText);
      }
      setShowAIMenu(false);
      setIsChatMode(false);
      setChatInput('');
    },
    [onAIEdit, selectedText]
  );

  // 处理自定义指令发送
  const handleChatSend = useCallback(() => {
    if (!chatInput.trim() || !selectedText || !onAIEdit) return;
    onAIEdit('custom', selectedText, chatInput.trim());
    setShowAIMenu(false);
    setIsChatMode(false);
    setChatInput('');
  }, [chatInput, selectedText, onAIEdit]);

  const handleChatBack = useCallback(() => {
    setIsChatMode(false);
    setChatInput('');
  }, []);

  // 点击外部关闭 AI 菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!showAIMenu) return;
      const target = e.target as HTMLElement;
      if (!target.closest('.ai-edit-menu')) {
        setShowAIMenu(false);
        setIsChatMode(false);
        setChatInput('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAIMenu]);

  // AI 菜单选项
  const aiMenuItems = [
    { icon: Sparkles, action: 'beautify', label: aiMenuLabels?.beautify ?? '美化' },
    { icon: Expand, action: 'expand', label: aiMenuLabels?.expand ?? '扩写' },
    { icon: Shrink, action: 'condense', label: aiMenuLabels?.condense ?? '缩写' },
    { icon: Languages, action: 'translate', label: aiMenuLabels?.translate ?? '翻译' },
    { icon: MessageCircle, action: 'chat', label: aiMenuLabels?.chat ?? '对话' },
  ];

  // 格式化时间
  const formatTime = (date: Date | null | undefined) => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;

    return date.toLocaleString();
  };

  // 计算字数和行数
  const wordCount = content ? content.length : 0;
  const lineCount = content ? content.split('\n').length : 1;

  // 是否处于 AI 对比视图模式（当前未直接使用，保留给未来布局逻辑）

  // 如果选中的是不支持的文件类型
  if (unsupportedFileInfo) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* 工具栏 - 保持高度一致 */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-border bg-muted/30 shrink-0">
          {/* 左侧：折叠/展开按钮和文件名 */}
          <div className="flex items-center">
            {onToggleFileTree && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFileTree}
                className="h-7 w-7 p-0 mr-3"
                title={isFileTreeCollapsed ? expandSidebarLabel : collapseSidebarLabel}
              >
                {isFileTreeCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">{unsupportedFileInfo.fileName}</span>
          </div>
          {/* 右侧：折叠/展开对话面板按钮 */}
          {onToggleChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleChat}
              className="h-7 w-7 p-0"
              title={isChatCollapsed ? expandChatLabel : collapseChatLabel}
            >
              {isChatCollapsed ? (
                <PanelRight className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {/* 不支持的文件类型提示 */}
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <FileWarning className="h-16 w-16 mb-4 opacity-30 text-amber-500" />
          <h3 className="text-lg font-medium mb-2">{unsupportedFileInfo.message}</h3>
          <p className="text-sm">{unsupportedFileInfo.supportedFormats}</p>
        </div>
      </div>
    );
  }

  // 如果没有文件被选中
  if (!fileName) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* 空的工具栏 - 保持高度一致 */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-border bg-muted/30 shrink-0">
          {/* 左侧：折叠/展开按钮 */}
          <div className="flex items-center">
            {onToggleFileTree && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFileTree}
                className="h-7 w-7 p-0 mr-3"
                title={isFileTreeCollapsed ? expandSidebarLabel : collapseSidebarLabel}
              >
                {isFileTreeCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">{noFileLabel}</span>
          </div>
          {/* 右侧：折叠/展开对话面板按钮 */}
          {onToggleChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleChat}
              className="h-7 w-7 p-0"
              title={isChatCollapsed ? expandChatLabel : collapseChatLabel}
            >
              {isChatCollapsed ? (
                <PanelRight className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {/* 空状态提示 */}
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <FileText className="h-16 w-16 mb-4 opacity-30" />
          <h3 className="text-lg font-medium mb-2">{noFileLabel}</h3>
          <p className="text-sm">{selectFileHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 工具栏 - 统一高度 h-12 */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-1">
          {/* 左侧：折叠/展开按钮 */}
          {onToggleFileTree && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFileTree}
              className="h-7 w-7 p-0 mr-2"
              title={isFileTreeCollapsed ? expandSidebarLabel : collapseSidebarLabel}
            >
              {isFileTreeCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* 文件名 */}
          <span className="text-sm font-medium text-foreground mr-4 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 预览/编辑切换 */}
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPreview(!isPreview)}
              className="h-8 gap-1.5"
            >
              {isPreview ? (
                <>
                  <Edit3 className="h-4 w-4" />
                  <span>{editLabel}</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  <span>{previewLabel}</span>
                </>
              )}
            </Button>
          )}

          {/* 保存按钮 */}
          {onSave && !readOnly && (
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              className="h-8 gap-1.5"
            >
              <Save className="h-4 w-4" />
              <span>{saveLabel}</span>
            </Button>
          )}

          {/* 折叠/展开对话面板按钮 */}
          {onToggleChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleChat}
              className="h-7 w-7 p-0 ml-2"
              title={isChatCollapsed ? expandChatLabel : collapseChatLabel}
            >
              {isChatCollapsed ? (
                <PanelRight className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 编辑器/预览区域 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden">
          {isPreview || readOnly ? (
            <div className="h-full overflow-y-auto p-6 max-w-none scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              <MarkdownPreview content={content || ''} />
            </div>
          ) : (
            <EditorComponent
              key={fileId}
              initialContent={content}
              placeholder={placeholder}
              readOnly={readOnly}
              projectId={projectId}
              onImageUploadSuccess={onImageUploadSuccess}
              onUpdate={(markdown) => {
                contentRef.current = markdown;
                onChange(markdown);
              }}
              onEditorInitialized={(editorInstance) => {
                onEditorInitialized?.(editorInstance);
              }}
              onKeyDown={handleKeyDown}
              editorContainerRef={editorContainerRef}
              showAIMenu={showAIMenu}
              aiMenuPosition={aiMenuPosition}
              setAIMenuPosition={setAIMenuPosition}
              selectedText={selectedText}
              isChatMode={isChatMode}
              chatInput={chatInput}
              setChatInput={setChatInput}
              chatInputRef={chatInputRef}
              setShowAIMenu={setShowAIMenu}
              setSelectedText={setSelectedText}
              setIsChatMode={setIsChatMode}
              onAIEdit={onAIEdit}
              aiMenuLabels={aiMenuLabels}
              aiEditState={aiEditState}
              onAIEditConfirm={onAIEditConfirm}
              onAIEditCancel={onAIEditCancel}
              aiEditLabels={aiEditLabels}
              handleAIAction={handleAIAction}
              handleChatSend={handleChatSend}
              handleChatBack={handleChatBack}
              aiMenuItems={aiMenuItems}
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between h-6 px-4 border-t border-border bg-muted/30 shrink-0 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className={lineCount >= maxLines ? 'text-amber-500 font-medium' : ''}>
              {lineCountLabel.replace('{count}', String(lineCount)).replace('{max}', String(maxLines))}
            </span>
            <span>{wordCountLabel?.replace('{count}', String(wordCount))}</span>
          </div>
          <span>
            {lastUpdatedTime && lastUpdatedLabel?.replace('{time}', formatTime(lastUpdatedTime))}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 编辑器组件，封装了 TipTap 编辑器所需的所有功能
 * @param initialContent 初始的 markdown 内容
 * @param placeholder 空编辑器的占位符文本
 * @param readOnly 是否只读
 * @param onUpdate 当编辑器内容变化时回调
 * @param onEditorInitialized 当编辑器初始化完成时回调
 * @param onKeyDown 键盘事件处理
 * @param editorContainerRef 编辑器容器元素的引用
 * @param showAIMenu 是否显示 AI 编辑菜单
 * @param aiMenuPosition AI 菜单的位置
 * @param setAIMenuPosition 更新 AI 菜单位置的函数
 * @param selectedText 当前选中的文本
 * @param isChatMode 是否处于聊天模式
 * @param chatInput 当前聊天输入值
 * @param setChatInput 更新聊天输入的函数
 * @param chatInputRef 聊天输入元素的引用
 * @param setShowAIMenu 控制 AI 菜单可见性的函数
 * @param setSelectedText 更新选中文本的函数
 * @param setIsChatMode 切换聊天模式的函数
 * @param onAIEdit AI 编辑动作的回调
 * @param aiMenuLabels AI 菜单标签
 * @param aiEditState AI 编辑状态
 * @param onAIEditConfirm AI 编辑确认的回调
 * @param onAIEditCancel AI 编辑取消的回调
 * @param aiEditLabels AI 编辑动作的标签
 * @param handleAIAction AI 动作按钮的处理器
 * @param handleChatSend 发送聊天消息的处理器
 * @param handleChatBack 从聊天模式返回的处理器
 * @param aiMenuItems AI 菜单列表
 */
function EditorComponent({
  initialContent,
  placeholder,
  readOnly,
  projectId,
  onImageUploadSuccess,
  onUpdate,
  onEditorInitialized,
  onKeyDown,
  editorContainerRef,
  showAIMenu,
  aiMenuPosition,
  setAIMenuPosition,
  // selectedText 目前只在父组件中用于 AI 菜单逻辑，这里无需直接使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedText,
  isChatMode,
  chatInput,
  setChatInput,
  chatInputRef,
  setShowAIMenu,
  setSelectedText,
  setIsChatMode,
  onAIEdit,
  aiMenuLabels,
  aiEditState,
  onAIEditConfirm,
  onAIEditCancel,
  aiEditLabels,
  handleAIAction,
  handleChatSend,
  handleChatBack,
  aiMenuItems,
}: {
  initialContent: string;
  placeholder?: string;
  readOnly: boolean;
  projectId?: string;
  onImageUploadSuccess?: () => void;
  onUpdate: (markdown: string) => void;
  onEditorInitialized: (editor: Editor) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  showAIMenu: boolean;
  aiMenuPosition: { top: number; left: number };
  setAIMenuPosition: (value: { top: number; left: number }) => void;
  selectedText: string;
  isChatMode: boolean;
  chatInput: string;
  setChatInput: (value: string) => void;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  setShowAIMenu: (value: boolean) => void;
  setSelectedText: (value: string) => void;
  setIsChatMode: (value: boolean) => void;
  onAIEdit?: (action: string, selectedText: string, customPrompt?: string) => void;
  aiMenuLabels?: {
    beautify: string;
    expand: string;
    condense: string;
    translate: string;
    chat: string;
    chatPlaceholder: string;
    send: string;
    back: string;
  };
  aiEditState?: {
    isProcessing: boolean;
    previewText: string;
    originalText: string;
    selectionFrom: number;  // Tiptap position
    selectionTo: number;    // Tiptap position
  };
  onAIEditConfirm?: () => void;
  onAIEditCancel?: () => void;
  aiEditLabels?: {
    processing: string;
    confirm: string;
    cancel: string;
  };
  handleAIAction: (action: string) => void;
  handleChatSend: () => void;
  handleChatBack: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiMenuItems: Array<{ icon: any; action: string; label: string }>;
}) {
  // AI 菜单元素引用（用于计算尺寸和边界约束）
  const aiMenuRef = useRef<HTMLDivElement | null>(null);
  // AI Diff 按钮元素引用（用于计算尺寸和边界约束）
  const aiDiffButtonRef = useRef<HTMLDivElement | null>(null);
  // AI Diff 按钮位置状态
  const [aiDiffButtonPosition, setAiDiffButtonPosition] = useState<{ top: number; left: number } | null>(null);
  // 防抖计时器引用
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 存储 AI 编辑状态元数据，用于在 undo/redo 后恢复按钮显示
  const aiEditMetadataRef = useRef<{
    selectionFrom: number;
    selectionTo: number;
    originalText: string;
    previewText: string;
  } | null>(null);
  // 内部状态：当检测到 diff 标记但 aiEditState 为空时使用
  const [restoredAiEditState, setRestoredAiEditState] = useState<{
    selectionFrom: number;
    selectionTo: number;
    originalText: string;
    previewText: string;
  } | null>(null);

  const editor = useEditor({
    immediatelyRender: true,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Main content area, start typing to enter text.',
        class: 'simple-editor',
        placeholder: placeholder || '开始输入...',
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      AIDiffDelete,
      AIDiffInsert,
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: false,
        },
      }),
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        projectId: projectId,
        onSuccess: (url) => {
          console.log('Image uploaded successfully:', url);
          onImageUploadSuccess?.();
        },
        onError: (error) => console.error('Upload failed:', error),
      }),
    ],
    content: initialContent,
    contentType: 'markdown',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      onUpdate(markdown);
    },
  });

  // 计算 AI 菜单位置的核心函数（考虑滚动、边界约束和行高）
  const calculateMenuPosition = useCallback(() => {
    if (!editor || !editorContainerRef.current) return null;

    const { state, view } = editor;
    const { from, to } = state.selection;

    try {
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const container = editorContainerRef.current;
      const containerRect = container.getBoundingClientRect();

      // 获取滚动偏移量
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      // 计算选区第一行顶部位置（使用 Math.min 确保在最上面一行）
      const selectionTop = Math.min(start.top, end.top);
      
      // 计算行高（用于更精确的菜单定位）
      const lineHeight = Math.max(start.bottom - start.top, 24); // 最小24px
      
      // 菜单距离选区上方的偏移量（基于行高动态调整）
      const menuOffset = Math.max(lineHeight * 0.5, 8); // 至少8px间距

      // 转换为容器相对坐标（viewport坐标 - 容器viewport位置 + 滚动偏移）
      let top = selectionTop - containerRect.top + scrollTop - menuOffset;
      let left = (start.left + end.right) / 2 - containerRect.left + scrollLeft;

      // 边界约束：获取菜单尺寸
      const menuWidth = aiMenuRef.current?.offsetWidth || 300; // 默认估计300px

      // 水平边界约束：确保菜单不超出容器左右边界
      const horizontalPadding = 16; // 左右各留16px边距
      if (left - menuWidth / 2 < horizontalPadding) {
        // 左侧溢出，左对齐
        left = horizontalPadding + menuWidth / 2;
      } else if (left + menuWidth / 2 > containerRect.width - horizontalPadding) {
        // 右侧溢出，右对齐
        left = containerRect.width - horizontalPadding - menuWidth / 2;
      }

      // 垂直边界约束：如果上方空间不足，放到选区下方
      const verticalPadding = 8;
      if (top - scrollTop < verticalPadding) {
        // 上方空间不足，放到选区下方
        const selectionBottom = Math.max(start.bottom, end.bottom);
        top = selectionBottom - containerRect.top + scrollTop + verticalPadding;
      }

      return { top, left };
    } catch (error) {
      console.error('Failed to calculate AI menu position:', error);
      return null;
    }
  }, [editor, editorContainerRef]);

  // 计算 AI Diff 按钮位置的核心函数（跟随新插入文本的结束位置）
  const calculateDiffButtonPosition = useCallback(() => {
    if (!editor || !editorContainerRef.current) return null;

    // 使用 aiEditState 或 restoredAiEditState
    const currentState = aiEditState || restoredAiEditState;
    if (!currentState) return null;

    const { selectionTo, previewText } = currentState;
    const actualInsertedLength = lastPreviewLengthRef.current || previewText.length || 0;
    
    // 计算新插入文本的结束位置
    const insertEndPos = selectionTo + actualInsertedLength;

    try {
      const view = editor.view;
      const container = editorContainerRef.current;
      const containerRect = container.getBoundingClientRect();

      // 获取滚动偏移量
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      // 获取新插入文本结束位置的坐标
      const endCoords = view.coordsAtPos(insertEndPos);
      
      // 计算行高
      const lineHeight = Math.max(endCoords.bottom - endCoords.top, 24); // 最小24px
      
      // 按钮距离文本的偏移量（放在文本右侧，稍微下移一点）
      const buttonOffsetX = 12; // 水平间距
      const buttonOffsetY = lineHeight * 0.5; // 垂直偏移（行高的一半）

      // 转换为容器相对坐标
      let top = endCoords.top - containerRect.top + scrollTop + buttonOffsetY;
      let left = endCoords.right - containerRect.left + scrollLeft + buttonOffsetX;

      // 边界约束：获取按钮组尺寸
      const buttonWidth = aiDiffButtonRef.current?.offsetWidth || 200; // 默认估计200px
      const buttonHeight = aiDiffButtonRef.current?.offsetHeight || 40; // 默认估计40px

      // 水平边界约束：确保按钮不超出容器右边界
      const horizontalPadding = 16;
      if (left + buttonWidth > containerRect.width - horizontalPadding) {
        // 右侧溢出，放在文本左侧
        left = endCoords.left - containerRect.left + scrollLeft - buttonWidth - buttonOffsetX;
        // 如果左侧也溢出，则放在文本上方
        if (left < horizontalPadding) {
          left = Math.max(endCoords.left - containerRect.left + scrollLeft - buttonWidth / 2, horizontalPadding);
        }
      }

      // 垂直边界约束：确保按钮不超出容器底部
      const verticalPadding = 8;
      if (top + buttonHeight > containerRect.height - verticalPadding) {
        // 底部溢出，放在文本上方
        top = endCoords.top - containerRect.top + scrollTop - buttonHeight - buttonOffsetY;
        // 如果上方也溢出，则放在容器底部
        if (top < verticalPadding) {
          top = containerRect.height - buttonHeight - verticalPadding;
        }
      }

      return { top, left };
    } catch (error) {
      console.error('Failed to calculate AI diff button position:', error);
      return null;
    }
  }, [editor, editorContainerRef, aiEditState, restoredAiEditState]);

  // 监听选区变化，带防抖的 AI 菜单显示逻辑
  useEffect(() => {
    if (!editor || readOnly) return;

    const updateSelection = () => {
      const { state } = editor;
      const { from, to } = state.selection;

      // 清除之前的防抖计时器
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
        selectionTimeoutRef.current = null;
      }

      // 如果没有选中内容，立即隐藏菜单
      if (from === to) {
        setShowAIMenu(false);
        setSelectedText('');
        setIsChatMode(false);
        setChatInput('');
        return;
      }

      // Extract markdown to preserve formatting
      // Use markdown extension's serialize method if available, otherwise fallback to plain text
      let text = '';
      try {
        // Try to use markdown extension's API to get markdown for selection
        // Create a slice and serialize it
        const slice = state.doc.slice(from, to);
        if (editor.markdown?.serialize) {
          // Create a temporary doc node with the slice content
          const tempDocNode = state.schema.nodes.doc.create({}, slice.content);
          text = editor.markdown.serialize(tempDocNode.toJSON()) || '';
        }
        // Fallback to plain text if markdown serialization not available
        if (!text) {
          text = state.doc.textBetween(from, to, '\n');
        }
      } catch {
        // Fallback to plain text
        text = state.doc.textBetween(from, to, '\n');
      }
      if (!text.trim()) {
        setShowAIMenu(false);
        setSelectedText('');
        setIsChatMode(false);
        setChatInput('');
        return;
      }

      // 更新选中文本（markdown格式，保留格式）
      setSelectedText(text);

      // 延迟300ms后显示菜单（防止干扰正常选择操作）
      selectionTimeoutRef.current = setTimeout(() => {
        const position = calculateMenuPosition();
        if (position) {
          setAIMenuPosition(position);
          setShowAIMenu(true);
        } else {
          setShowAIMenu(false);
        }
      }, 300);
    };

    editor.on('selectionUpdate', updateSelection);
    
    return () => {
      editor.off('selectionUpdate', updateSelection);
      // 清理计时器
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [editor, readOnly, calculateMenuPosition, setShowAIMenu, setSelectedText, setIsChatMode, setChatInput, setAIMenuPosition]);

  // 检测文档中的 AI diff 标记并提取信息（需要在 effects 之前定义）
  const detectAIDiffMarks = useCallback(() => {
    if (!editor) return null;

    const { doc } = editor.state;
    const deleteRanges: Array<{ from: number; to: number }> = [];
    const insertRanges: Array<{ from: number; to: number }> = [];

    // 遍历文档查找所有带有 diff 标记的文本节点
    doc.descendants((node, pos) => {
      if (node.isText) {
        const marks = node.marks || [];
        const textLength = node.textContent.length;
        const nodeStart = pos;
        const nodeEnd = pos + textLength;
        
        marks.forEach((mark) => {
          if (mark.type.name === 'aiDiffDelete') {
            deleteRanges.push({ from: nodeStart, to: nodeEnd });
          }
          if (mark.type.name === 'aiDiffInsert') {
            insertRanges.push({ from: nodeStart, to: nodeEnd });
          }
        });
      }
    });

    // 合并连续的范围
    const mergeRanges = (ranges: Array<{ from: number; to: number }>) => {
      if (ranges.length === 0) return null;
      ranges.sort((a, b) => a.from - b.from);
      const merged = [ranges[0]];
      for (let i = 1; i < ranges.length; i++) {
        const last = merged[merged.length - 1];
        if (ranges[i].from <= last.to) {
          last.to = Math.max(last.to, ranges[i].to);
        } else {
          merged.push(ranges[i]);
        }
      }
      return merged.length === 1 ? merged[0] : null;
    };

    const deleteRange = mergeRanges(deleteRanges);
    const insertRange = mergeRanges(insertRanges);

    // 如果找到了删除和插入标记
    if (deleteRange && insertRange) {
      const originalText = doc.textBetween(deleteRange.from, deleteRange.to, '');
      const previewText = doc.textBetween(insertRange.from, insertRange.to, '');
      
      return {
        selectionFrom: deleteRange.from,
        selectionTo: deleteRange.to,
        originalText,
        previewText,
        insertStart: insertRange.from,
        insertEnd: insertRange.to,
      };
    }

    return null;
  }, [editor]);

  // 监听编辑器更新（包括 undo/redo）以检测 diff 标记
  useEffect(() => {
    if (!editor || readOnly) return;

    const handleUpdate = () => {
      // 如果 aiEditState 存在，不需要检测（使用真实状态）
      if (aiEditState) {
        // 但如果已经有恢复的状态，清除它（因为现在有真实状态了）
        if (restoredAiEditState) {
          setRestoredAiEditState(null);
        }
        return;
      }

      // 检测是否有 diff 标记
      const diffInfo = detectAIDiffMarks();
      
      if (diffInfo) {
        // 如果有元数据，验证是否匹配
        if (aiEditMetadataRef.current) {
          const metadata = aiEditMetadataRef.current;
          // 允许位置有小的偏差（由于文档编辑可能导致位置偏移）
          const positionTolerance = 10;
          const positionMatch = 
            Math.abs(diffInfo.selectionFrom - metadata.selectionFrom) <= positionTolerance &&
            Math.abs(diffInfo.selectionTo - metadata.selectionTo) <= positionTolerance;
          
          // 文本内容必须完全匹配
          const textMatch = 
            diffInfo.originalText === metadata.originalText &&
            diffInfo.previewText === metadata.previewText;
          
          if (positionMatch && textMatch) {
            // 恢复状态以显示按钮
            setRestoredAiEditState({
              selectionFrom: diffInfo.selectionFrom,
              selectionTo: diffInfo.selectionTo,
              originalText: diffInfo.originalText,
              previewText: diffInfo.previewText,
            });
            // 更新 lastPreviewLengthRef
            lastPreviewLengthRef.current = diffInfo.insertEnd - diffInfo.insertStart;
            // 更新按钮位置
            requestAnimationFrame(() => {
              const position = calculateDiffButtonPosition();
              setAiDiffButtonPosition(position);
            });
            return;
          }
        } else {
          // 如果没有元数据但有 diff 标记，可能是从其他地方来的，不处理
          // 但我们可以尝试使用检测到的信息（如果看起来合理）
          if (diffInfo.originalText && diffInfo.previewText) {
            // 存储检测到的信息作为元数据
            aiEditMetadataRef.current = {
              selectionFrom: diffInfo.selectionFrom,
              selectionTo: diffInfo.selectionTo,
              originalText: diffInfo.originalText,
              previewText: diffInfo.previewText,
            };
            // 恢复状态
            setRestoredAiEditState({
              selectionFrom: diffInfo.selectionFrom,
              selectionTo: diffInfo.selectionTo,
              originalText: diffInfo.originalText,
              previewText: diffInfo.previewText,
            });
            lastPreviewLengthRef.current = diffInfo.insertEnd - diffInfo.insertStart;
            requestAnimationFrame(() => {
              const position = calculateDiffButtonPosition();
              setAiDiffButtonPosition(position);
            });
          }
        }
      } else {
        // 如果没有 diff 标记，清除恢复的状态
        if (restoredAiEditState) {
          setRestoredAiEditState(null);
          setAiDiffButtonPosition(null);
          lastPreviewLengthRef.current = 0;
        }
        // 注意：不自动清除元数据，因为用户可能再次 undo
      }
    };

    editor.on('update', handleUpdate);
    
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, readOnly, aiEditState, detectAIDiffMarks, calculateDiffButtonPosition, restoredAiEditState]);

  // 监听滚动事件，实时更新菜单位置和按钮位置
  useEffect(() => {
    if (!editor || readOnly || !editorContainerRef.current) return;

    const container = editorContainerRef.current;

    const handleScroll = () => {
      // 只在菜单可见时重新计算位置
      if (showAIMenu) {
        const position = calculateMenuPosition();
        if (position) {
          setAIMenuPosition(position);
        } else {
          setShowAIMenu(false);
        }
      }
      // 只在按钮应该显示时重新计算位置
      const currentState = aiEditState || restoredAiEditState;
      if (currentState && (!aiEditState || !aiEditState.isProcessing) && currentState.previewText) {
        const position = calculateDiffButtonPosition();
        setAiDiffButtonPosition(position);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [editor, readOnly, showAIMenu, calculateMenuPosition, setAIMenuPosition, setShowAIMenu, editorContainerRef, aiEditState, restoredAiEditState, calculateDiffButtonPosition]);

  // 通知父组件 editor 已初始化
  useEffect(() => {
    if (editor) {
      onEditorInitialized(editor);
    }
  }, [editor, onEditorInitialized]);

  // AI diff 内联渲染：当 AI 编辑状态变化时，实时更新编辑器内容
  // 使用 ref 跟踪上次插入的预览文本长度，避免重复插入
  const lastPreviewLengthRef = useRef(0);

  useEffect(() => {
    if (!editor) {
      // 重置时清除 ref 和按钮位置
      lastPreviewLengthRef.current = 0;
      setAiDiffButtonPosition(null);
      setRestoredAiEditState(null);
      return;
    }

    // 如果没有 aiEditState，让 update listener 处理检测
    if (!aiEditState) {
      return;
    }

    const { selectionFrom, selectionTo, originalText, previewText } = aiEditState;
    
    // 存储元数据以便在 undo/redo 后恢复
    aiEditMetadataRef.current = {
      selectionFrom,
      selectionTo,
      originalText,
      previewText,
    };
    setRestoredAiEditState(null); // 清除恢复的状态，使用真实的 aiEditState

    // 如果没有预览文本，不需要渲染 diff（但允许 isProcessing 时显示流式更新）
    if (!previewText) {
      setAiDiffButtonPosition(null);
      return;
    }

    // 边界检查：确保位置有效
    const docSize = editor.state.doc.content.size;
    if (selectionFrom < 0 || selectionFrom >= docSize || selectionTo > docSize || selectionFrom > selectionTo) {
      console.warn('Invalid AI diff positions:', { selectionFrom, selectionTo, docSize });
      lastPreviewLengthRef.current = 0;
      setAiDiffButtonPosition(null);
      return;
    }

    // 使用 Tiptap 事务直接应用 diff 标记
    const tr = editor.state.tr;

    // 1. 清除之前的 diff 标记
    tr.removeMark(0, editor.state.doc.content.size, editor.schema.marks.aiDiffDelete);
    tr.removeMark(0, editor.state.doc.content.size, editor.schema.marks.aiDiffInsert);

    // 2. 如果之前插入过预览文本，先删除它
    if (lastPreviewLengthRef.current > 0) {
      const deleteEnd = selectionTo + lastPreviewLengthRef.current;
      // 边界检查
      if (deleteEnd <= tr.doc.content.size) {
        tr.delete(selectionTo, deleteEnd);
      } else {
        console.warn('Cannot delete preview text - range exceeds document size');
        lastPreviewLengthRef.current = 0;
        setAiDiffButtonPosition(null);
        return;
      }
    }

    // 3. 获取当前选区的markdown（从原始编辑器状态，在删除预览文本之前）
    // 我们需要在修改事务之前获取，因为tr.doc可能已经被修改
    let currentMarkdown = '';
    try {
      // Create a slice and serialize it to markdown
      const slice = editor.state.doc.slice(selectionFrom, selectionTo);
      if (editor.markdown?.serialize) {
        // Create a temporary doc node with the slice content
        const tempDocNode = editor.state.schema.nodes.doc.create({}, slice.content);
        currentMarkdown = editor.markdown.serialize(tempDocNode.toJSON()) || '';
      }
      // Fallback to plain text comparison
      if (!currentMarkdown) {
        currentMarkdown = editor.state.doc.textBetween(selectionFrom, selectionTo, '');
      }
    } catch {
      // Fallback to plain text comparison
      currentMarkdown = editor.state.doc.textBetween(selectionFrom, selectionTo, '');
    }

    // 4. 如果内容匹配（markdown），应用删除标记到原文
    // originalText现在包含markdown格式
    const contentMatches = currentMarkdown === originalText || 
                          currentMarkdown.trim() === originalText.trim();
    
    if (contentMatches) {
      const deleteMark = editor.schema.marks.aiDiffDelete.create();
      tr.addMark(selectionFrom, selectionTo, deleteMark);

      // 5. 如果有预览文本（markdown），解析并插入为结构化节点
      if (previewText) {
        try {
          // Parse markdown to ProseMirror nodes
          const parsedContent = editor.markdown?.parse(previewText);
          if (parsedContent) {
            const slice = editor.schema.nodeFromJSON(parsedContent).content;
            
            // Insert the slice at the selection position
            tr.replaceWith(selectionTo, selectionTo, slice);
            
            // Calculate the length of inserted content
            const insertedLength = slice.size;
            lastPreviewLengthRef.current = insertedLength;
            
            // Apply insert mark to the inserted content
            const insertEnd = selectionTo + insertedLength;
            const insertMark = editor.schema.marks.aiDiffInsert.create();
            tr.addMark(selectionTo, insertEnd, insertMark);

            // 确保插入文本不会继承删除样式（移除插入范围内的删除标记）
            tr.removeMark(selectionTo, insertEnd, editor.schema.marks.aiDiffDelete);
          } else {
            throw new Error('Failed to parse markdown');
          }
        } catch (error) {
          console.error('Error parsing markdown preview:', error);
          // Fallback to plain text insertion
          tr.insertText(previewText, selectionTo);
          const insertMark = editor.schema.marks.aiDiffInsert.create();
          tr.addMark(selectionTo, selectionTo + previewText.length, insertMark);
          tr.removeMark(selectionTo, selectionTo + previewText.length, editor.schema.marks.aiDiffDelete);
          lastPreviewLengthRef.current = previewText.length;
        }
      } else {
        lastPreviewLengthRef.current = 0;
      }

      // 6. 应用事务
      // 如果处理完成（isProcessing 为 false），添加到历史记录以便 undo
      // 否则不添加到历史记录（避免流式更新污染历史）
      if (!aiEditState.isProcessing) {
        // 处理完成，添加到历史记录
        editor.view.dispatch(tr);
      } else {
        // 流式更新中，不添加到历史记录
        tr.setMeta('addToHistory', false);
        editor.view.dispatch(tr);
      }

      // 7. 在下一帧更新按钮位置（等待 DOM 更新）
      requestAnimationFrame(() => {
        const position = calculateDiffButtonPosition();
        setAiDiffButtonPosition(position);
      });
    } else {
      // 内容不匹配，可能文档已被修改，跳过此次渲染
      console.warn('Content mismatch - expected:', originalText, 'got:', currentMarkdown);
      lastPreviewLengthRef.current = 0;
      setAiDiffButtonPosition(null);
    }
  }, [editor, aiEditState, calculateDiffButtonPosition]);

  // AI diff 接受/拒绝处理
  const handleDiffConfirm = useCallback(() => {
    if (!editor) {
      setAiDiffButtonPosition(null);
      onAIEditConfirm?.();
      return;
    }

    // 使用 aiEditState 或 restoredAiEditState
    const currentState = aiEditState || restoredAiEditState;
    if (!currentState) {
      setAiDiffButtonPosition(null);
      onAIEditConfirm?.();
      return;
    }

    const { selectionFrom, selectionTo, previewText } = currentState;
    
    // 使用 lastPreviewLengthRef 获取实际插入的长度
    const actualInsertedLength = lastPreviewLengthRef.current || 0;
    const diffEndPos = selectionTo + actualInsertedLength;
    
    const tr = editor.state.tr;

    // 清除整个文档中的 diff 标记
    tr.removeMark(0, editor.state.doc.content.size, editor.schema.marks.aiDiffDelete);
    tr.removeMark(0, editor.state.doc.content.size, editor.schema.marks.aiDiffInsert);

    // 删除整个 diff 范围（原文 + 已插入的预览文本）
    tr.delete(selectionFrom, diffEndPos);
    
    // 插入最终的预览文本（markdown）作为结构化节点（无标记）
    if (previewText) {
      try {
        // Parse markdown to ProseMirror nodes
        const parsedContent = editor.markdown?.parse(previewText);
        if (parsedContent) {
          const slice = editor.schema.nodeFromJSON(parsedContent).content;
          // Insert the slice at the original selection position
          tr.replaceWith(selectionFrom, selectionFrom, slice);
        } else {
          throw new Error('Failed to parse markdown');
        }
      } catch (error) {
        console.error('Error parsing markdown on confirm:', error);
        // Fallback to plain text insertion
        tr.insertText(previewText, selectionFrom);
      }
    }

    // 重置追踪的预览长度和按钮位置
    lastPreviewLengthRef.current = 0;
    setAiDiffButtonPosition(null);
    // 清除恢复状态（但保留元数据以便 undo 后恢复）
    setRestoredAiEditState(null);

    // 应用事务（添加到历史记录，以便 undo）
    editor.view.dispatch(tr);
    
    // 在下一帧检查是否还有 diff 标记，如果没有则清除元数据
    requestAnimationFrame(() => {
      const diffInfo = detectAIDiffMarks();
      if (!diffInfo) {
        aiEditMetadataRef.current = null;
      }
    });
    
    // 调用父组件回调（父组件会清除 aiEditState 并保存文件）
    onAIEditConfirm?.();
  }, [editor, aiEditState, restoredAiEditState, onAIEditConfirm, detectAIDiffMarks]);

  const handleDiffCancel = useCallback(() => {
    if (!editor) {
      setAiDiffButtonPosition(null);
      onAIEditCancel?.();
      return;
    }

    // 使用 aiEditState 或 restoredAiEditState
    const currentState = aiEditState || restoredAiEditState;
    if (!currentState) {
      setAiDiffButtonPosition(null);
      onAIEditCancel?.();
      return;
    }

    const { selectionFrom, selectionTo } = currentState;
    const tr = editor.state.tr;

    // 使用 lastPreviewLengthRef 获取实际插入的长度
    const actualInsertedLength = lastPreviewLengthRef.current || 0;

    // 删除预览插入的文本，只保留原始文本
    if (actualInsertedLength > 0) {
      tr.delete(selectionTo, selectionTo + actualInsertedLength);
    }

    // 移除原始文本上的删除/插入标记，让其恢复为普通文本
    tr.removeMark(selectionFrom, selectionTo, editor.schema.marks.aiDiffDelete);
    tr.removeMark(selectionFrom, selectionTo, editor.schema.marks.aiDiffInsert);

    // 重置追踪的预览长度和按钮位置
    lastPreviewLengthRef.current = 0;
    setAiDiffButtonPosition(null);
    // 清除恢复状态（但保留元数据以便 undo 后恢复）
    setRestoredAiEditState(null);

    // 应用事务（添加到历史记录，以便 undo）
    editor.view.dispatch(tr);
    
    // 在下一帧检查是否还有 diff 标记，如果没有则清除元数据
    requestAnimationFrame(() => {
      const diffInfo = detectAIDiffMarks();
      if (!diffInfo) {
        aiEditMetadataRef.current = null;
      }
    });
    
    // 调用父组件回调（父组件会清除 aiEditState）
    onAIEditCancel?.();
  }, [editor, aiEditState, restoredAiEditState, onAIEditCancel, detectAIDiffMarks]);

  return (
    <div className="h-full" onKeyDown={onKeyDown}>
              {editor && (
                <EditorContext.Provider value={{ editor }}>
                  <div
                    ref={editorContainerRef}
                    className="simple-editor-wrapper relative w-full"
                  >
                    <Toolbar>
                      <MainToolbarContent />
                    </Toolbar>
                    <div className="relative w-full">
                      {/* 右侧正文内容，留出行号栏空间 */}
                      <div className="ml-8 h-full">
                        <EditorContent
                          editor={editor}
                          role="presentation"
                          className="simple-editor-content w-full h-full"
                        />
                      </div>

                      {/* AI Diff 确认/取消按钮（跟随新插入文本位置） */}
                      {(() => {
                        const currentState = aiEditState || restoredAiEditState;
                        const shouldShow = currentState && 
                          (!aiEditState || !aiEditState.isProcessing) && 
                          currentState.previewText && 
                          aiDiffButtonPosition;
                        
                        return shouldShow ? (
                          <div
                            ref={aiDiffButtonRef}
                            className="absolute z-60 pointer-events-none"
                            style={{
                              top: `${aiDiffButtonPosition.top}px`,
                              left: `${aiDiffButtonPosition.left}px`,
                            }}
                          >
                            <div className="flex items-center gap-2 rounded-md bg-background/95 px-3 py-1.5 shadow-lg ring-1 ring-border backdrop-blur">
                              <button
                                onClick={handleDiffCancel}
                                className="inline-flex items-center gap-1 rounded border border-destructive/60 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/15 transition-colors pointer-events-auto"
                              >
                                <X />
                                <span>{aiEditLabels?.cancel ?? '取消'}</span>
                              </button>
                              <button
                                onClick={handleDiffConfirm}
                                className="inline-flex items-center gap-1 rounded border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/15 transition-colors pointer-events-auto"
                              >
                                <Check />
                                <span>{aiEditLabels?.confirm ?? '确认'}</span>
                              </button>
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* AI 处理中指示器（与按钮使用相同位置） */}
                      {aiEditState?.isProcessing && (
                        <div className="fixed inset-x-0 bottom-20 z-60 flex items-center justify-center pointer-events-none">
                          <div className="flex items-center gap-2 rounded-md bg-background/95 px-3 py-1.5 shadow-lg ring-1 ring-border backdrop-blur">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span className="text-xs font-medium text-primary">
                              {aiEditLabels?.processing ?? 'AI 处理中...'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* AI 编辑浮动菜单（仅在正常编辑模式下显示） */}
                      {onAIEdit &&
                        showAIMenu &&
                        !aiEditState?.isProcessing &&
                        !aiEditState?.previewText && (
                              <div
                                ref={aiMenuRef}
                                className="ai-edit-menu absolute z-50 bg-popover border border-border rounded-lg shadow-lg p-1"
                                style={{
                                  top: aiMenuPosition.top,
                                  left: aiMenuPosition.left,
                                  transform: 'translateX(-50%)', // 水平居中对齐
                                }}
                              >
                                {isChatMode ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={handleChatBack}
                                      className="flex items-center justify-center p-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                                      title={aiMenuLabels?.back ?? '返回'}
                                    >
                                      <Undo2 className="h-3.5 w-3.5" />
                                    </button>
                                    <div className="relative flex items-center">
                                      <input
                                        ref={chatInputRef}
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleChatSend();
                                          } else if (e.key === 'Escape') {
                                            handleChatBack();
                                          }
                                        }}
                                        placeholder={aiMenuLabels?.chatPlaceholder ?? '输入指令...'}
                                        className="w-48 pl-2.5 pr-8 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none"
                                      />
                                      <button
                                        onClick={handleChatSend}
                                        disabled={!chatInput.trim()}
                                        className="absolute right-1 flex items-center justify-center p-1 text-xs text-primary hover:text-primary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title={aiMenuLabels?.send ?? '发送'}
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-0.5">
                                    {aiMenuItems.map((item) => (
                                      <button
                                        key={item.action}
                                        onClick={() => handleAIAction(item.action)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md transition-colors whitespace-nowrap"
                                        title={item.label}
                                      >
                                        <item.icon className="h-3.5 w-3.5" />
                                        <span>{item.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                    </div>
                  </div>
                </EditorContext.Provider>
              )}
    </div>
  );
}