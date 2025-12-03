'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical, Upload, Plus, Folder, ArrowLeft, Sparkles } from 'lucide-react';
import FileTree, { FileNode } from './FileTree';
// import RichTextEditor from './RichTextEditor';
import RichTextEditorTiptap from './RichTextEditorTiptap';
import ImageViewer from './ImageViewer';
import WorkspaceChat from './WorkspaceChat';
import WorkspaceProjectList from './WorkspaceProjectList';
import ChapterGenerationModal from './ChapterGenerationModal';
import Button from '@/components/common/Button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

// 章节类型定义
interface ChapterState {
  title: string;
  index: number;
  content: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  isExpanded: boolean;
}

interface WorkspaceContainerProps {
  // 项目管理 i18n
  projectLabels: {
    title: string;
    subtitle: string;
    createProject: string;
    createFirstProject: string;
    noProjects: string;
    noProjectsHint: string;
    projectName: string;
    projectNamePlaceholder: string;
    projectNameRequired: string;
    projectCreateSuccess: string;
    projectCreateFailed: string;
    projectDeleteSuccess: string;
    projectDeleteFailed: string;
    projectDeleteConfirm: string;
    projectFileCount: string;
    projectLastModified: string;
    enterProject: string;
    backToProjects: string;
    // 项目类型
    projectType: string;
    projectTypeHint: string;
    projectTypes: {
      liberal_arts: string;
      science: string;
      engineering: string;
      other: string;
    };
    projectTypeDesc: {
      liberal_arts: string;
      science: string;
      engineering: string;
      other: string;
    };
  };
  // 文件编辑器 i18n
  editorLabels: {
    fileTreeTitle: string;
    uploadLabel: string;
    newFileLabel: string;
    newFolderLabel: string;
    emptyFilesLabel: string;
    deleteConfirmLabel: string;
    protectedFileLabel: string;
    generatingOutlineLabel: string;
    saveLabel: string;
    editLabel: string;
    previewLabel: string;
    noFileLabel: string;
    selectFileHint: string;
    unsupportedFileLabel: string;
    supportedFormatsLabel: string;
    editorPlaceholder: string;
    chatTitle: string;
    chatInputPlaceholder: string;
    sendLabel: string;
    newChatLabel: string;
    welcomeLabel: string;
    thinkingLabel: string;
    sendFailedLabel: string;
    llmNotConfiguredLabel: string;
    llmConfigHintLabel: string;
    collapseSidebarLabel: string;
    expandSidebarLabel: string;
    collapseChatLabel: string;
    expandChatLabel: string;
    wordCountLabel: string;
    lastUpdatedLabel: string;
    quickActions: {
      summarize: string;
      summarizeDesc: string;
      improve: string;
      improveDesc: string;
      explain: string;
      explainDesc: string;
    };
    aiEditLabels?: {
      processing: string;
      confirm: string;
      cancel: string;
    };
    aiMenuLabels?: {
      beautify: string;
      expand: string;
      condense: string;
      correct: string;
      translate: string;
      chat: string;
      chatPlaceholder: string;
      send: string;
      back: string;
    };
    // 章节生成
    generateChaptersLabel?: string;
    generatingChaptersLabel?: string;
    generateChaptersDescLabel?: string;
    chaptersGeneratedLabel?: string;
    chapterGeneratingLabel?: string;
    chapterDoneLabel?: string;
    chapterErrorLabel?: string;
    totalChaptersLabel?: string;
    // 章节生成模态框
    chapterModalLabels?: {
      title: string;
      generating: string;
      complete: string;
      failed: string;
      close: string;
      pending: string;
      generatingStatus: string;
      doneStatus: string;
      errorStatus: string;
      progress: string;
    };
    // 重新生成确认
    regenerateConfirmTitle?: string;
    regenerateConfirmMessage?: string;
    regenerateConfirm?: string;
    regenerateCancel?: string;
  };
  locale: string;
}

export default function WorkspaceContainer({
  projectLabels,
  editorLabels,
  locale,
}: WorkspaceContainerProps) {
  // 当前选中的项目
  const [currentProject, setCurrentProject] = useState<string | null>(null);

  // 文件树状态
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);

  // 自动保存相关
  const lastSavedContentRef = useRef<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // 面板状态
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(380);
  const [isDragging, setIsDragging] = useState(false);

  // 新建文件编辑状态
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // 流式生成大纲状态
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const pendingOutlineRef = useRef<{ projectType: string } | null>(null);

  // 章节生成状态
  const [isGeneratingChapters, setIsGeneratingChapters] = useState(false);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showChapterConfirmModal, setShowChapterConfirmModal] = useState(false);
  const [chaptersState, setChaptersState] = useState<ChapterState[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number | null>(null);
  const [isChapterGenerationComplete, setIsChapterGenerationComplete] = useState(false);
  const [hasChapterError, setHasChapterError] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // 进入项目
  const handleSelectProject = (projectId: string, options?: { isNew?: boolean; projectType?: string }) => {
    setCurrentProject(projectId);
    setSelectedFile(null);
    setFileContent('');
    lastSavedContentRef.current = '';

    // 如果是新建项目，记录待生成大纲的信息
    if (options?.isNew && options?.projectType) {
      pendingOutlineRef.current = { projectType: options.projectType };
    } else {
      pendingOutlineRef.current = null;
    }
  };

  // 流式生成大纲
  const startOutlineGeneration = async (projectId: string, projectType: string) => {
    setIsGeneratingOutline(true);

    try {
      const url = api.getGenerateOutlineStreamUrl(projectId, projectType);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder('utf-8');
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        // 实时更新编辑器内容
        setFileContent(fullContent);
      }

      // 生成完成后更新保存状态
      lastSavedContentRef.current = fullContent;
      setLastUpdatedTime(new Date());

    } catch (error) {
      console.error('流式生成大纲失败:', error);
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  // 检查是否存在已生成的章节文件
  const hasExistingChapters = useCallback(() => {
    // 检查文件列表中是否存在 01_xxx.md, 02_xxx.md 等章节文件
    const chapterPattern = /^\d{2}_.*\.md$/i;
    return files.some((file) => file.type === 'file' && chapterPattern.test(file.name));
  }, [files]);

  // 处理点击生成章节按钮
  const handleGenerateChaptersClick = () => {
    if (hasExistingChapters()) {
      // 已存在章节文件，显示确认对话框
      setShowChapterConfirmModal(true);
    } else {
      // 不存在章节文件，直接开始生成
      startChaptersGeneration();
    }
  };

  // 确认重新生成
  const handleConfirmRegenerate = () => {
    setShowChapterConfirmModal(false);
    startChaptersGeneration();
  };

  // 取消重新生成
  const handleCancelRegenerate = () => {
    setShowChapterConfirmModal(false);
  };

  // 流式生成章节
  const startChaptersGeneration = async () => {
    if (!currentProject || isGeneratingChapters) return;

    // 初始化状态并打开模态框
    setIsGeneratingChapters(true);
    setShowChapterModal(true);
    setChaptersState([]);
    setCurrentChapterIndex(null);
    setIsChapterGenerationComplete(false);
    setHasChapterError(false);

    try {
      await api.generateChaptersStream(currentProject, (message) => {
        switch (message.type) {
          case 'chapters':
            // 收到章节列表，初始化章节状态
            if (message.data) {
              const initialChapters: ChapterState[] = message.data.map((ch) => ({
                title: ch.title,
                index: ch.index,
                content: '',
                status: 'pending' as const,
                isExpanded: false,
              }));
              setChaptersState(initialChapters);
            }
            break;
          case 'chapter_start':
            // 开始生成某章节
            if (message.index !== undefined) {
              setCurrentChapterIndex(message.index);
              setChaptersState((prev) =>
                prev.map((ch, i) =>
                  i === message.index
                    ? { ...ch, status: 'generating' as const, isExpanded: true }
                    : ch
                )
              );
            }
            break;
          case 'content':
            // 收到内容块，追加到当前章节
            if (message.index !== undefined && message.chunk) {
              setChaptersState((prev) =>
                prev.map((ch, i) =>
                  i === message.index
                    ? { ...ch, content: ch.content + message.chunk }
                    : ch
                )
              );
            }
            break;
          case 'chapter_done':
            // 章节生成完成
            if (message.index !== undefined) {
              setChaptersState((prev) =>
                prev.map((ch, i) =>
                  i === message.index
                    ? { ...ch, status: 'done' as const, isExpanded: false }
                    : ch
                )
              );
            }
            break;
          case 'chapter_error':
            // 章节生成失败
            if (message.index !== undefined) {
              setHasChapterError(true);
              setChaptersState((prev) =>
                prev.map((ch, i) =>
                  i === message.index
                    ? { ...ch, status: 'error' as const, error: message.error, isExpanded: true }
                    : ch
                )
              );
            }
            break;
          case 'done':
            // 全部完成
            setIsChapterGenerationComplete(true);
            setCurrentChapterIndex(null);
            toast.success(editorLabels.chaptersGeneratedLabel || '章节生成完成');
            // 刷新文件列表
            refreshProjectFiles();
            break;
          case 'error':
            // 出错
            setHasChapterError(true);
            setIsChapterGenerationComplete(true);
            toast.error(message.message || '生成章节失败');
            break;
        }
      });
    } catch (error) {
      console.error('流式生成章节失败:', error);
      setHasChapterError(true);
      setIsChapterGenerationComplete(true);
      toast.error('生成章节失败，请重试');
    } finally {
      setIsGeneratingChapters(false);
      setCurrentChapterIndex(null);
    }
  };

  // 切换章节展开状态
  const handleToggleChapter = (index: number) => {
    setChaptersState((prev) =>
      prev.map((ch, i) =>
        i === index ? { ...ch, isExpanded: !ch.isExpanded } : ch
      )
    );
  };

  // 关闭章节生成模态框
  const handleCloseChapterModal = () => {
    if (!isGeneratingChapters) {
      setShowChapterModal(false);
      setChaptersState([]);
      setCurrentChapterIndex(null);
      setIsChapterGenerationComplete(false);
      setHasChapterError(false);
    }
  };

  // 刷新项目文件列表
  const refreshProjectFiles = async () => {
    if (!currentProject) return;

    try {
      const response = await api.getProjectFiles(currentProject);
      if (response.data?.files) {
        interface BackendNode {
          id: string;
          name: string;
          type: 'file' | 'folder';
          content?: string;
          parent_id?: string;
          is_protected?: boolean;
          children?: BackendNode[];
        }
        const convertNodes = (nodes: BackendNode[]): FileNode[] => {
          return nodes.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            content: node.content,
            parentId: node.parent_id,
            is_protected: node.is_protected,
            children: node.children ? convertNodes(node.children) : undefined,
          }));
        };
        setFiles(convertNodes(response.data.files));
      }
    } catch (error) {
      console.error('刷新项目文件列表失败:', error);
    }
  };

  // 返回项目列表
  const handleBackToProjects = () => {
    setCurrentProject(null);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    lastSavedContentRef.current = '';
  };

  // 判断文件是否为图片
  const isImageFile = (fileName: string): boolean => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.tif'];
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  };

  // 获取图片URL
  const getImageUrl = (file: FileNode): string => {
    if (!currentProject) return '';
    // Extract filename from file.id which is in format: project_id/path/to/file
    const parts = file.id.split('/');
    if (parts.length >= 2 && parts[1] === 'images') {
      // This is an image file in the images folder
      const filename = parts[parts.length - 1];
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      return `${baseUrl}/api/workspace/images/${currentProject}/${filename}`;
    }
    return '';
  };

  // 加载项目文件列表
  useEffect(() => {
    if (!currentProject) return;

    // 图片文件扩展名
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.tif'];

    // 判断是否为文本文件（非图片）
    const isTextFile = (fileName: string): boolean => {
      const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
      return !imageExtensions.includes(ext);
    };

    // 递归查找第一个文本文件节点（跳过图片）
    const findFirstTextFile = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.type === 'file' && isTextFile(node.name)) {
          return node;
        }
        if (node.children && node.children.length > 0) {
          const found = findFirstTextFile(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    const loadProjectFiles = async () => {
      try {
        const response = await api.getProjectFiles(currentProject);
        if (response.data?.files) {
          // 后端文件节点类型
          interface BackendNode {
            id: string;
            name: string;
            type: 'file' | 'folder';
            content?: string;
            parent_id?: string;
            is_protected?: boolean;
            children?: BackendNode[];
          }
          // 转换后端返回的 parent_id 为前端的 parentId
          const convertNodes = (nodes: BackendNode[]): FileNode[] => {
            return nodes.map((node) => ({
              id: node.id,
              name: node.name,
              type: node.type,
              content: node.content,
              parentId: node.parent_id,
              is_protected: node.is_protected,
              children: node.children ? convertNodes(node.children) : undefined,
            }));
          };
          const convertedFiles = convertNodes(response.data.files);
          setFiles(convertedFiles);

          // 检查是否需要流式生成大纲
          const pending = pendingOutlineRef.current;
          if (pending) {
            // 找到 outline.md 文件
            const outlineFile = convertedFiles.find(
              (f) => f.type === 'file' && f.name.toLowerCase() === 'outline.md'
            );
            if (outlineFile) {
              // 加载初始模板内容
              try {
                const fileResponse = await api.getWorkspaceFile(outlineFile.id);
                if (fileResponse.data?.content) {
                  setSelectedFile(outlineFile);
                  setFileContent(fileResponse.data.content);
                  lastSavedContentRef.current = fileResponse.data.content;

                  // 开始流式生成大纲
                  startOutlineGeneration(currentProject, pending.projectType);
                }
              } catch (error) {
                console.error('加载大纲文件失败:', error);
              }
            }
            pendingOutlineRef.current = null;
          } else {
            // 默认选中第一个文本文件（跳过图片）
            const firstFile = findFirstTextFile(convertedFiles);
            if (firstFile) {
              // 加载文件内容
              try {
                const fileResponse = await api.getWorkspaceFile(firstFile.id);
                if (fileResponse.data?.content) {
                  setSelectedFile(firstFile);
                  setFileContent(fileResponse.data.content);
                  lastSavedContentRef.current = fileResponse.data.content;
                }
              } catch (error) {
                console.error('加载默认文件内容失败:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('加载项目文件失败:', error);
      }
    };

    loadProjectFiles();
  }, [currentProject]);

  // 保存面板状态到 localStorage
  useEffect(() => {
    localStorage.setItem('workspace_fileTreeCollapsed', String(isFileTreeCollapsed));
  }, [isFileTreeCollapsed]);

  useEffect(() => {
    localStorage.setItem('workspace_chatCollapsed', String(isChatCollapsed));
  }, [isChatCollapsed]);

  useEffect(() => {
    localStorage.setItem('workspace_chatWidth', String(chatWidth));
  }, [chatWidth]);

  // 处理文件/文件夹选择
  // 确保切换文件时先加载内容，再更新选中状态
  // 这样可以保证编辑器重新挂载时使用的是新文件的内容，而不是旧内容
  const handleSelectFile = async (node: FileNode) => {
    // 如果是文件夹，只选中不加载内容
    if (node.type === 'folder') {
      setSelectedFile(node);
      return;
    }

    // 如果是文件，先从 API 加载最新内容，再一起更新状态
    // 这样确保 selectedFile 和 fileContent 同步更新，避免编辑器使用旧内容重新挂载
    try {
      const response = await api.getWorkspaceFile(node.id);
      const content = response.data?.content ?? '';
      
      // 原子性地更新选中文件和内容，确保编辑器重新挂载时使用正确的内容
      setSelectedFile(node);
      setFileContent(content);
      lastSavedContentRef.current = content;
      
      // 更新文件树中的内容缓存
      updateFileContent(node.id, content);
    } catch (error) {
      console.error('加载文件内容失败:', error);
      // 出错时也要更新选中状态，但内容为空
      setSelectedFile(node);
      setFileContent('');
      lastSavedContentRef.current = '';
    }
  };

  // 处理文件内容变化
  const handleContentChange = (content: string) => {
    setFileContent(content);
    if (selectedFile) {
      updateFileContent(selectedFile.id, content);
    }
  };

  // 更新文件内容（递归查找并更新）
  const updateFileContent = useCallback((fileId: string, content: string) => {
    const updateNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((node) => {
        if (node.id === fileId) {
          return { ...node, content };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setFiles((prev) => updateNode(prev));
  }, []);

  // 处理文件上传点击
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件上传
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject) {
      return;
    }

    try {
      // 调用后端 API 上传文件（上传到当前项目文件夹）
      const targetFolder = selectedFile?.type === 'folder'
        ? selectedFile.id
        : currentProject;
      const response = await api.uploadWorkspaceFile(file, targetFolder);

      if (response.data?.success) {
        const { file_id, file_name, content } = response.data;

        // 创建新的文件节点
        const newFile: FileNode = {
          id: file_id,
          name: file_name,
          type: 'file',
          content: content || '',
        };

        // 添加到文件树
        setFiles((prev) => [...prev, newFile]);

        // 自动选中新上传的文件
        setSelectedFile(newFile);
        setFileContent(content || '');
        lastSavedContentRef.current = content || '';

        toast.success(`文件上传成功: ${file_name}`);
      } else {
        toast.error(response.data?.error || '文件上传失败');
      }
    } catch (error) {
      console.error('上传文件失败:', error);
      toast.error('上传文件失败，请重试');
    }

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 将新节点添加到文件树中
  const addNodeToTree = useCallback((nodes: FileNode[], newNode: FileNode, targetFolderId?: string): FileNode[] => {
    if (!targetFolderId) {
      return [...nodes, newNode];
    }

    return nodes.map((node) => {
      if (node.id === targetFolderId && node.type === 'folder') {
        return {
          ...node,
          children: [...(node.children || []), newNode],
        };
      }
      if (node.children) {
        return { ...node, children: addNodeToTree(node.children, newNode, targetFolderId) };
      }
      return node;
    });
  }, []);

  // 创建新文件
  const handleCreateFile = async () => {
    if (!currentProject) return;

    try {
      // 获取当前选中的文件夹路径
      const targetFolder = selectedFile?.type === 'folder'
        ? selectedFile.id
        : currentProject;

      // 调用后端 API 创建文件
      const response = await api.createWorkspaceFile('untitled.md', targetFolder);

      if (response.data?.success) {
        const { file_id, file_name } = response.data;

        const newFile: FileNode = {
          id: file_id,
          name: file_name,
          type: 'file',
          content: '',
          parentId: targetFolder || undefined,
        };

        // 添加到文件树对应位置
        if (targetFolder === currentProject) {
          setFiles((prev) => [...prev, newFile]);
        } else {
          setFiles((prev) => addNodeToTree(prev, newFile, targetFolder));
        }
        setSelectedFile(newFile);
        setFileContent('');
        lastSavedContentRef.current = '';
        setEditingNodeId(file_id);
      } else {
        toast.error(response.data?.error || '创建文件失败');
      }
    } catch (error) {
      console.error('创建文件失败:', error);
      toast.error('创建文件失败，请重试');
    }
  };

  // 编辑完成回调
  const handleEditingComplete = () => {
    setEditingNodeId(null);
  };

  // 创建新文件夹
  const handleCreateFolder = async () => {
    if (!currentProject) return;

    try {
      // 获取当前选中的文件夹路径
      const targetFolder = selectedFile?.type === 'folder'
        ? selectedFile.id
        : currentProject;

      // 调用后端 API 创建文件夹
      const response = await api.createWorkspaceFolder('untitled', targetFolder);

      if (response.data?.success) {
        const { folder_id, folder_name } = response.data;

        const newFolder: FileNode = {
          id: folder_id,
          name: folder_name,
          type: 'folder',
          children: [],
          parentId: targetFolder || undefined,
        };

        // 添加到文件树对应位置
        if (targetFolder === currentProject) {
          setFiles((prev) => [...prev, newFolder]);
        } else {
          setFiles((prev) => addNodeToTree(prev, newFolder, targetFolder));
        }
        setSelectedFile(newFolder);
        setEditingNodeId(folder_id);
      } else {
        toast.error(response.data?.error || '创建文件夹失败');
      }
    } catch (error) {
      console.error('创建文件夹失败:', error);
      toast.error('创建文件夹失败，请重试');
    }
  };

  // 在文件树中查找节点
  const findNodeInTree = (nodes: FileNode[], nodeId: string): FileNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children) {
        const found = findNodeInTree(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  };

  // 删除节点
  const handleDeleteNode = async (nodeId: string) => {
    // 检查是否为受保护的文件
    const node = findNodeInTree(files, nodeId);
    if (node?.is_protected) {
      toast.error(editorLabels.protectedFileLabel);
      return;
    }

    try {
      const response = await api.deleteWorkspaceFile(nodeId);

      if (response.data?.success) {
        const deleteFromTree = (nodes: FileNode[]): FileNode[] => {
          return nodes.filter((n) => {
            if (n.id === nodeId) {
              return false;
            }
            if (n.children) {
              n.children = deleteFromTree(n.children);
            }
            return true;
          });
        };
        setFiles((prev) => deleteFromTree(prev));

        if (selectedFile?.id === nodeId) {
          setSelectedFile(null);
          setFileContent('');
          lastSavedContentRef.current = '';
        }

        toast.success('删除成功');
      } else {
        toast.error(response.data?.error || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  // 重命名节点
  const handleRenameNode = async (nodeId: string, newName: string) => {
    try {
      const response = await api.renameWorkspaceFile(nodeId, newName);

      if (response.data?.success) {
        const newId = response.data.new_id;

        const renameInTree = (nodes: FileNode[]): FileNode[] => {
          return nodes.map((node) => {
            if (node.id === nodeId) {
              return { ...node, id: newId, name: newName };
            }
            if (node.children) {
              return { ...node, children: renameInTree(node.children) };
            }
            return node;
          });
        };
        setFiles((prev) => renameInTree(prev));

        if (selectedFile?.id === nodeId) {
          setSelectedFile((prev) => prev ? { ...prev, id: newId, name: newName } : null);
        }
      } else {
        console.error('重命名失败:', response.data?.error);
        alert(response.data?.error || '重命名失败');
      }
    } catch (error) {
      console.error('重命名文件失败:', error);
      alert('重命名文件失败，请重试');
    }
  };

  // 保存文件
  const handleSaveFile = useCallback(async (showNotification = false) => {
    if (!selectedFile || isSaving) return;

    if (fileContent === lastSavedContentRef.current) {
      if (showNotification) {
        toast.success('文件已是最新');
      }
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.saveWorkspaceFile(selectedFile.id, fileContent);
      if (response.data?.success) {
        lastSavedContentRef.current = fileContent;
        setLastUpdatedTime(new Date());
        updateFileContent(selectedFile.id, fileContent);
        if (showNotification) {
          toast.success('保存成功');
        }
      } else {
        if (showNotification) {
          toast.error('保存失败');
        }
      }
    } catch (error) {
      console.error('保存文件失败:', error);
      if (showNotification) {
        toast.error('保存失败');
      }
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, fileContent, isSaving, updateFileContent]);

  // 自动保存（每10秒检查一次）
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (selectedFile && fileContent !== lastSavedContentRef.current && !isSaving) {
        handleSaveFile();
      }
    }, 10000);

    return () => clearInterval(autoSaveInterval);
  }, [selectedFile, fileContent, isSaving, handleSaveFile]);

  // AI 编辑状态
  const [aiEditState, setAiEditState] = useState<{
    isProcessing: boolean;
    previewText: string;
    originalText: string;
    selectionStart: number;
    selectionEnd: number;
  } | undefined>(undefined);

  // 处理 AI 编辑操作
  const handleAIEdit = async (action: string, selectedText: string, customPrompt?: string) => {
    if (!selectedText || aiEditState?.isProcessing) return;

    const actionMap: Record<string, 'beautify' | 'expand' | 'condense' | 'correct' | 'translate' | 'custom'> = {
      beautify: 'beautify',
      expand: 'expand',
      condense: 'condense',
      correct: 'correct',
      translate: 'translate',
      custom: 'custom',
    };

    const apiAction = actionMap[action];
    if (!apiAction) {
      return;
    }

    const startIndex = fileContent.indexOf(selectedText);
    if (startIndex === -1) return;

    setAiEditState({
      isProcessing: true,
      previewText: '',
      originalText: selectedText,
      selectionStart: startIndex,
      selectionEnd: startIndex + selectedText.length,
    });

    try {
      let result = '';

      await api.processDocumentAIStream(
        {
          action: apiAction,
          document_content: selectedText,
          document_name: selectedFile?.name,
          custom_prompt: customPrompt,
        },
        (chunk: string) => {
          result += chunk;
          setAiEditState(prev => prev ? {
            ...prev,
            previewText: result,
          } : undefined);
        }
      );

      setAiEditState(prev => prev ? {
        ...prev,
        isProcessing: false,
        previewText: result,
      } : undefined);

    } catch (error) {
      console.error('AI 编辑失败:', error);
      alert('AI 编辑失败，请重试');
      setAiEditState(undefined);
    }
  };

  // 确认 AI 编辑
  const handleAIEditConfirm = async () => {
    if (!aiEditState?.previewText || !selectedFile) return;

    const { originalText, previewText, selectionStart } = aiEditState;

    const newContent =
      fileContent.substring(0, selectionStart) +
      previewText +
      fileContent.substring(selectionStart + originalText.length);

    setFileContent(newContent);
    updateFileContent(selectedFile.id, newContent);
    setAiEditState(undefined);

    try {
      const response = await api.saveWorkspaceFile(selectedFile.id, newContent);
      if (response.data?.success) {
        lastSavedContentRef.current = newContent;
        setLastUpdatedTime(new Date());
      }
    } catch (error) {
      console.error('AI 编辑后保存失败:', error);
    }
  };

  // 取消 AI 编辑
  const handleAIEditCancel = () => {
    setAiEditState(undefined);
  };

  // 处理拖动调整宽度
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = dragStartX.current - e.clientX;
      const newWidth = Math.min(Math.max(dragStartWidth.current + deltaX, 280), 600);
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 如果没有选中项目，显示项目列表
  if (!currentProject) {
    return (
      <WorkspaceProjectList
        onSelectProject={handleSelectProject}
        title={projectLabels.title}
        subtitle={projectLabels.subtitle}
        createProjectLabel={projectLabels.createProject}
        createFirstProjectLabel={projectLabels.createFirstProject}
        noProjectsLabel={projectLabels.noProjects}
        noProjectsHint={projectLabels.noProjectsHint}
        projectNameLabel={projectLabels.projectName}
        projectNamePlaceholder={projectLabels.projectNamePlaceholder}
        projectNameRequired={projectLabels.projectNameRequired}
        projectCreateSuccess={projectLabels.projectCreateSuccess}
        projectCreateFailed={projectLabels.projectCreateFailed}
        projectDeleteSuccess={projectLabels.projectDeleteSuccess}
        projectDeleteFailed={projectLabels.projectDeleteFailed}
        projectDeleteConfirm={projectLabels.projectDeleteConfirm}
        projectFileCount={projectLabels.projectFileCount}
        projectLastModified={projectLabels.projectLastModified}
        enterProjectLabel={projectLabels.enterProject}
        locale={locale}
        projectTypeLabel={projectLabels.projectType}
        projectTypeHint={projectLabels.projectTypeHint}
        projectTypes={projectLabels.projectTypes}
        projectTypeDesc={projectLabels.projectTypeDesc}
      />
    );
  }

  // 显示项目文件编辑器
  return (
    <div
      ref={containerRef}
      className="flex h-full overflow-hidden bg-background"
      style={{ cursor: isDragging ? 'col-resize' : 'default' }}
    >
      {/* 隐藏的文件上传 input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept=".txt,.md,.doc,.docx"
      />

      {/* 左侧：文件树 */}
      <div
        className={`flex-shrink-0 h-full border-r border-border bg-card transition-all duration-300 ${
          isFileTreeCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-64'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* 项目名称和操作按钮 */}
          <div className="group flex items-center justify-between h-12 px-3 border-b border-border flex-shrink-0">
            <h3 className="text-sm font-semibold text-foreground truncate" title={currentProject}>
              {currentProject}
            </h3>
            <div className="flex items-center gap-0.5">
              {/* 返回按钮 - 悬停时显示 */}
              <button
                onClick={handleBackToProjects}
                className="h-7 w-7 p-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title={projectLabels.backToProjects}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUploadClick}
                className="h-7 w-7 p-0"
                title={editorLabels.uploadLabel}
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateFile}
                className="h-7 w-7 p-0"
                title={editorLabels.newFileLabel}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateFolder}
                className="h-7 w-7 p-0"
                title={editorLabels.newFolderLabel}
              >
                <Folder className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* 文件树内容 */}
          <FileTree
            files={files}
            selectedFileId={selectedFile?.id || null}
            onSelectFile={handleSelectFile}
            onDeleteNode={handleDeleteNode}
            onRenameNode={handleRenameNode}
            emptyLabel={editorLabels.emptyFilesLabel}
            deleteConfirmLabel={editorLabels.deleteConfirmLabel}
            protectedFileLabel={editorLabels.protectedFileLabel}
            editingNodeId={editingNodeId}
            onEditingComplete={handleEditingComplete}
          />
        </div>
      </div>

      {/* 中间：富文本编辑器 */}
      <div className="flex-1 h-full overflow-hidden relative">
        {/* <RichTextEditor
          content={fileContent}
          onChange={handleContentChange}
          onSave={() => handleSaveFile(true)}
          placeholder={editorLabels.editorPlaceholder}
          fileName={selectedFile?.type === 'file' ? (() => {
            const supportedExtensions = ['.txt', '.md', '.doc', '.docx'];
            const ext = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
            return supportedExtensions.includes(ext) ? selectedFile.name : undefined;
          })() : undefined}
          unsupportedFileInfo={selectedFile?.type === 'file' ? (() => {
            const supportedExtensions = ['.txt', '.md', '.doc', '.docx'];
            const ext = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
            if (!supportedExtensions.includes(ext)) {
              return {
                fileName: selectedFile.name,
                message: editorLabels.unsupportedFileLabel,
                supportedFormats: editorLabels.supportedFormatsLabel,
              };
            }
            return undefined;
          })() : undefined}
          saveLabel={editorLabels.saveLabel}
          editLabel={editorLabels.editLabel}
          previewLabel={editorLabels.previewLabel}
          noFileLabel={editorLabels.noFileLabel}
          selectFileHint={editorLabels.selectFileHint}
          isFileTreeCollapsed={isFileTreeCollapsed}
          onToggleFileTree={() => setIsFileTreeCollapsed(!isFileTreeCollapsed)}
          collapseSidebarLabel={editorLabels.collapseSidebarLabel}
          expandSidebarLabel={editorLabels.expandSidebarLabel}
          isChatCollapsed={isChatCollapsed}
          onToggleChat={() => setIsChatCollapsed(!isChatCollapsed)}
          collapseChatLabel={editorLabels.collapseChatLabel}
          expandChatLabel={editorLabels.expandChatLabel}
          wordCountLabel={editorLabels.wordCountLabel}
          lastUpdatedLabel={isGeneratingOutline ? editorLabels.generatingOutlineLabel : editorLabels.lastUpdatedLabel}
          lastUpdatedTime={isGeneratingOutline ? null : lastUpdatedTime}
          onAIEdit={handleAIEdit}
          aiEditState={aiEditState}
          onAIEditConfirm={handleAIEditConfirm}
          onAIEditCancel={handleAIEditCancel}
          aiEditLabels={editorLabels.aiEditLabels}
          aiMenuLabels={editorLabels.aiMenuLabels}
        /> */}
        {/* 编辑器 / 图片查看器 */}
        {selectedFile?.type === 'file' && isImageFile(selectedFile.name) ? (
          <ImageViewer
            imageUrl={getImageUrl(selectedFile)}
            imageName={selectedFile.name}
          />
        ) : (
          <RichTextEditorTiptap
            content={fileContent}
            onChange={handleContentChange}
            onSave={() => handleSaveFile(true)}
            placeholder={editorLabels.editorPlaceholder}
            fileId={selectedFile?.id}
            fileName={selectedFile?.type === 'file' ? (() => {
              const supportedExtensions = ['.txt', '.md', '.doc', '.docx'];
              const ext = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
              return supportedExtensions.includes(ext) ? selectedFile.name : undefined;
            })() : undefined}
            projectId={currentProject || undefined}
            onImageUploadSuccess={refreshProjectFiles}
            unsupportedFileInfo={selectedFile?.type === 'file' ? (() => {
              const supportedExtensions = ['.txt', '.md', '.doc', '.docx'];
              const ext = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
              if (!supportedExtensions.includes(ext)) {
                return {
                  fileName: selectedFile.name,
                  message: editorLabels.unsupportedFileLabel,
                  supportedFormats: editorLabels.supportedFormatsLabel,
                };
              }
              return undefined;
            })() : undefined}
            saveLabel={editorLabels.saveLabel}
            editLabel={editorLabels.editLabel}
            previewLabel={editorLabels.previewLabel}
            noFileLabel={editorLabels.noFileLabel}
            selectFileHint={editorLabels.selectFileHint}
            isFileTreeCollapsed={isFileTreeCollapsed}
            onToggleFileTree={() => setIsFileTreeCollapsed(!isFileTreeCollapsed)}
            collapseSidebarLabel={editorLabels.collapseSidebarLabel}
            expandSidebarLabel={editorLabels.expandSidebarLabel}
            isChatCollapsed={isChatCollapsed}
            onToggleChat={() => setIsChatCollapsed(!isChatCollapsed)}
            collapseChatLabel={editorLabels.collapseChatLabel}
            expandChatLabel={editorLabels.expandChatLabel}
            wordCountLabel={editorLabels.wordCountLabel}
            lastUpdatedLabel={isGeneratingOutline ? editorLabels.generatingOutlineLabel : editorLabels.lastUpdatedLabel}
            lastUpdatedTime={isGeneratingOutline ? null : lastUpdatedTime}
            onAIEdit={handleAIEdit}
            aiEditState={aiEditState}
            onAIEditConfirm={handleAIEditConfirm}
            onAIEditCancel={handleAIEditCancel}
            aiEditLabels={editorLabels.aiEditLabels}
            aiMenuLabels={editorLabels.aiMenuLabels}
          />
        )}

        {/* 生成章节按钮 - 仅在 outline.md 文件时显示 */}
        {selectedFile?.name?.toLowerCase() === 'outline.md' && !isGeneratingOutline && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
            <Button
              onClick={handleGenerateChaptersClick}
              disabled={isGeneratingChapters}
              className="shadow-lg gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white border-0"
            >
              <Sparkles className="h-4 w-4" />
              <span>{editorLabels.generateChaptersLabel || '生成章节'}</span>
            </Button>
          </div>
        )}

        {/* 重新生成确认对话框 */}
        {showChapterConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancelRegenerate} />
            <div className="relative bg-background rounded-xl shadow-2xl border border-border p-6 max-w-md mx-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-blue-500/10">
                  <Sparkles className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {editorLabels.regenerateConfirmTitle || '重新生成章节'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {editorLabels.regenerateConfirmMessage || '检测到已有生成的章节文件，重新生成将覆盖现有内容。确定要继续吗？'}
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleCancelRegenerate}
                      className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      {editorLabels.regenerateCancel || '取消'}
                    </button>
                    <button
                      onClick={handleConfirmRegenerate}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                    >
                      {editorLabels.regenerateConfirm || '确认生成'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 拖动条 */}
      {!isChatCollapsed && (
        <div
          className="flex-shrink-0 w-px bg-border cursor-col-resize transition-all flex items-center justify-center relative"
          onMouseDown={handleDragStart}
        >
          <GripVertical className="absolute h-4 w-4 text-muted-foreground/40 z-10" />
        </div>
      )}

      {/* 右侧：AI 对话 */}
      <div
        className={`flex-shrink-0 h-full overflow-hidden transition-all duration-300 ${
          isChatCollapsed ? 'w-0' : ''
        }`}
        style={{ width: isChatCollapsed ? 0 : `${chatWidth}px` }}
      >
        <WorkspaceChat
          documentContent={fileContent}
          documentName={selectedFile?.name}
          titleLabel={editorLabels.chatTitle}
          inputPlaceholder={editorLabels.chatInputPlaceholder}
          sendLabel={editorLabels.sendLabel}
          newChatLabel={editorLabels.newChatLabel}
          welcomeLabel={editorLabels.welcomeLabel}
          thinkingLabel={editorLabels.thinkingLabel}
          sendFailedLabel={editorLabels.sendFailedLabel}
          llmNotConfiguredLabel={editorLabels.llmNotConfiguredLabel}
          llmConfigHintLabel={editorLabels.llmConfigHintLabel}
          quickActions={editorLabels.quickActions}
        />
      </div>

      {/* 章节生成模态框 */}
      <ChapterGenerationModal
        isOpen={showChapterModal}
        chapters={chaptersState}
        currentChapterIndex={currentChapterIndex}
        isGenerating={isGeneratingChapters}
        isComplete={isChapterGenerationComplete}
        hasError={hasChapterError}
        onClose={handleCloseChapterModal}
        onToggleChapter={handleToggleChapter}
        labels={editorLabels.chapterModalLabels || {
          title: '生成章节',
          generating: '正在根据大纲生成章节内容...',
          complete: '所有章节已生成完成',
          failed: '部分章节生成失败',
          close: '关闭',
          pending: '等待中',
          generatingStatus: '生成中',
          doneStatus: '已完成',
          errorStatus: '失败',
          progress: '{completed}/{total}',
        }}
      />
    </div>
  );
}
