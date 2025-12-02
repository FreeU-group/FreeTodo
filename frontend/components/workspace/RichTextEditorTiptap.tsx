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
import TurndownService from 'turndown';
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

// --- Tiptap UI Primitives ---
import { Spacer } from '@/components/workspace/tiptap/tiptap-ui-primitive/spacer';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/workspace/tiptap/tiptap-ui-primitive/toolbar';

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/workspace/tiptap/tiptap-node/image-upload-node/image-upload-node-extension';
import { HorizontalRule } from '@/components/workspace/tiptap/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';

// --- Tiptap Node Styles ---
import '@/components/workspace/tiptap/tiptap-scss/blockquote-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/code-block-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/horizontal-rule-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/list-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/image-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/heading-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/paragraph-node.scss';
import '@/components/workspace/tiptap/tiptap-scss/simple-editor.scss';

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
import { marked } from 'marked';

// --- Markdown Converter (Turndown) ---
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// 保持行内代码与块代码的简单处理
turndownService.addRule('inlineCode', {
  filter: 'code',
  replacement: (content) => '`' + content + '`',
});

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
    selectionStart: number;
    selectionEnd: number;
  };
  onAIEditConfirm?: () => void;
  onAIEditCancel?: () => void;
  aiEditLabels?: {
    processing: string;
    confirm: string;
    cancel: string;
  };
}

export default function RichTextEditorTiptap({
  content,
  onChange,
  onSave,
  placeholder = '',
  readOnly = false,
  fileId,
  fileName,
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

  // 是否处于 AI 对比视图模式
  const isAIDiffMode =
    !!aiEditState && (aiEditState.isProcessing || !!aiEditState.previewText);

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
              onUpdate={(markdown) => {
                contentRef.current = markdown;
                onChange(markdown);
              }}
              onEditorInitialized={(editorInstance) => {
                // 编辑器初始化完成
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
  onUpdate,
  onEditorInitialized,
  onKeyDown,
  editorContainerRef,
  showAIMenu,
  aiMenuPosition,
  setAIMenuPosition,
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
  onUpdate: (markdown: string) => void;
  onEditorInitialized: (editor: Editor) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  editorContainerRef: React.RefObject<HTMLDivElement>;
  showAIMenu: boolean;
  aiMenuPosition: { top: number; left: number };
  setAIMenuPosition: (value: { top: number; left: number }) => void;
  selectedText: string;
  isChatMode: boolean;
  chatInput: string;
  setChatInput: (value: string) => void;
  chatInputRef: React.RefObject<HTMLInputElement>;
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
    selectionStart: number;
    selectionEnd: number;
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
  aiMenuItems: Array<{ icon: any; action: string; label: string }>;
}) {
  // 将 markdown 转换为 HTML（用于 Tiptap）
  const markdownToHtml = useCallback((md: string): string => {
    if (!md) return '';
    try {
      return marked.parse(md) as string;
    } catch (error) {
      console.error('Error converting markdown to HTML:', error);
      return md;
    }
  }, []);

  // 将 HTML 转换为 markdown：使用 Turndown 提升兼容性
  const htmlToMarkdown = useCallback((html: string): string => {
    if (!html || html === '<p></p>') return '';

    try {
      const markdown = turndownService.turndown(html);
      return markdown;
    } catch (error) {
      console.error('Error converting HTML to Markdown:', error);
      return '';
    }
  }, []);

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
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error('Upload failed:', error),
      }),
    ],
    content: markdownToHtml(initialContent),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      onUpdate(markdown);
    },
  });

  // 监听选区变化，更新 AI 菜单位置与选中文本
  useEffect(() => {
    if (!editor || readOnly) return;

    const updateSelection = () => {
      const { state, view } = editor;
      const { from, to } = state.selection;

      if (from === to) {
        setShowAIMenu(false);
        setSelectedText('');
        setIsChatMode(false);
        setChatInput('');
        return;
      }

      const text = state.doc.textBetween(from, to, '\n');
      if (!text.trim()) {
        setShowAIMenu(false);
        setSelectedText('');
        setIsChatMode(false);
        setChatInput('');
        return;
      }

      setSelectedText(text);

      try {
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        const containerRect = editorContainerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        const top = Math.max(start.top, end.top) - containerRect.top - 40;
        const left =
          (start.left + end.right) / 2 - containerRect.left;

        setAIMenuPosition({ top, left });
        setShowAIMenu(true);
      } catch (error) {
        console.error('Failed to calculate AI menu position:', error);
        setShowAIMenu(false);
      }
    };

    editor.on('selectionUpdate', updateSelection);
    return () => {
      editor.off('selectionUpdate', updateSelection);
    };
  }, [editor, readOnly, editorContainerRef, setShowAIMenu, setSelectedText, setIsChatMode, setChatInput, setAIMenuPosition]);

  // 通知父组件 editor 已初始化
  useEffect(() => {
    if (editor) {
      onEditorInitialized(editor);
    }
  }, [editor, onEditorInitialized]);

  // 是否处于 AI 对比视图模式
  const isAIDiffMode =
    !!aiEditState && (aiEditState.isProcessing || !!aiEditState.previewText);

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
                    <div className="relative w-full h-full">
                      {isAIDiffMode && aiEditState ? (
                        // AI 内联对比视图：在内容中直接红/绿对比
                        <div
                          className="flex-1 overflow-y-auto p-4 font-mono text-sm text-foreground whitespace-pre-wrap"
                          style={{ lineHeight: '1.625rem' }}
                        >
                          {/* 选中位置之前的内容 */}
                          <span>
                    {initialContent.substring(
                              0,
                      Math.max(0, Math.min(initialContent.length, aiEditState.selectionStart))
                            )}
                          </span>

                          {/* 对比区域 */}
                          {aiEditState.isProcessing ? (
                            <>
                              {/* 原文（红色删除线） */}
                              <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 line-through px-0.5">
                                {aiEditState.originalText}
                              </span>
                              {/* 已生成的新文本（绿色） */}
                              {aiEditState.previewText && (
                                <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-0.5">
                                  {aiEditState.previewText}
                                </span>
                              )}
                              {/* 加载提示 */}
                              {aiEditState.previewText ? (
                                <Loader2 className="inline-block h-3.5 w-3.5 animate-spin text-primary ml-1 align-middle" />
                              ) : (
                                <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs align-middle">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>{aiEditLabels?.processing ?? 'AI 处理中...'}</span>
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {/* 删除的原文（红色删除线） */}
                              <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 line-through px-0.5">
                                {aiEditState.originalText}
                              </span>
                              {/* 新增的文本（绿色） */}
                              <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-0.5">
                                {aiEditState.previewText}
                              </span>

                              {/* 悬浮确认/取消按钮，紧随对比区域 */}
                              <span className="relative inline-block w-0 h-0 align-baseline">
                                <span className="absolute left-2 top-1 flex items-center gap-1 z-50 whitespace-nowrap">
                                  <button
                                    onClick={onAIEditCancel}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 rounded shadow-md hover:shadow-lg transition-all"
                                  >
                                    <X className="h-3 w-3" />
                                    <span>{aiEditLabels?.cancel ?? '取消'}</span>
                                  </button>
                                  <button
                                    onClick={onAIEditConfirm}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 rounded shadow-md hover:shadow-lg transition-all"
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>{aiEditLabels?.confirm ?? '确认'}</span>
                                  </button>
                                </span>
                              </span>
                            </>
                          )}

                          {/* 选中位置之后的内容 */}
                          <span>
                    {initialContent.substring(
                      Math.max(0, Math.min(initialContent.length, aiEditState.selectionEnd))
                            )}
                          </span>
                        </div>
                      ) : (
                        <>
                          <EditorContent
                            editor={editor}
                            role="presentation"
                            className="simple-editor-content w-full h-full"
                          />

                          {/* AI 编辑浮动菜单（仅在正常编辑模式下显示） */}
                          {onAIEdit &&
                            showAIMenu &&
                            !aiEditState?.isProcessing &&
                            !aiEditState?.previewText && (
                              <div
                                className="ai-edit-menu absolute z-50 bg-popover border border-border rounded-lg shadow-lg p-1"
                                style={{
                                  top: aiMenuPosition.top,
                                  left: aiMenuPosition.left,
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
                        </>
                      )}
                    </div>
                  </div>
                </EditorContext.Provider>
              )}
    </div>
  );
}