'use client';

import { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Trash2,
  Pencil,
  Check,
  X,
  Lock,
  Sparkles,
} from 'lucide-react';

// 文件/文件夹节点类型
export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  parentId?: string;
  is_protected?: boolean;  // 受保护的文件，不可删除
}

interface FileTreeProps {
  files: FileNode[];
  selectedFileId: string | null;
  onSelectFile: (file: FileNode) => void;
  onDeleteNode?: (nodeId: string) => void;
  onRenameNode?: (nodeId: string, newName: string) => void;
  emptyLabel: string;
  deleteConfirmLabel?: string;
  protectedFileLabel?: string;
  editingNodeId?: string | null;
  onEditingComplete?: () => void;
}

interface TreeNodeProps {
  node: FileNode;
  level: number;
  selectedFileId: string | null;
  onSelectFile: (file: FileNode) => void;
  onDeleteNode?: (nodeId: string) => void;
  onRenameNode?: (nodeId: string, newName: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (folderId: string) => void;
  deleteConfirmLabel?: string;
  protectedFileLabel?: string;
  editingNodeId?: string | null;
  onEditingComplete?: () => void;
}

function TreeNode({
  node,
  level,
  selectedFileId,
  onSelectFile,
  onDeleteNode,
  onRenameNode,
  expandedFolders,
  toggleFolder,
  deleteConfirmLabel,
  protectedFileLabel,
  editingNodeId,
  onEditingComplete,
}: TreeNodeProps) {
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFileId === node.id;
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevEditingNodeIdRef = useRef<string | null | undefined>(null);

  // 当外部设置 editingNodeId 时，进入编辑模式
  useEffect(() => {
    // 只有当 editingNodeId 第一次变为当前 node.id 时，才设置编辑状态
    if (editingNodeId === node.id && prevEditingNodeIdRef.current !== node.id) {
      setEditName(node.name);
      setIsEditing(true);
    }
    prevEditingNodeIdRef.current = editingNodeId;
  }, [editingNodeId, node.id, node.name]);

  // 当进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // 选中文件名（不包括扩展名）
      const dotIndex = editName.lastIndexOf('.');
      if (dotIndex > 0 && node.type === 'file') {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleClick = () => {
    if (isEditing || showDeleteConfirm) return;
    // 选中当前节点（无论是文件还是文件夹）
    onSelectFile(node);
    // 如果是文件夹，同时展开/折叠
    if (node.type === 'folder') {
      toggleFolder(node.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteNode?.(node.id);
    setShowDeleteConfirm(false);
    setShowActions(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(node.name);
    setIsEditing(true);
  };

  const handleConfirmEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trimmedName = editName.trim();
    if (trimmedName && trimmedName !== node.name) {
      onRenameNode?.(node.id, trimmedName);
    }
    setIsEditing(false);
    setShowActions(false);
    onEditingComplete?.();
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditName(node.name);
    setIsEditing(false);
    onEditingComplete?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted text-foreground'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => !isEditing && !showDeleteConfirm && setShowActions(false)}
      >
        {/* 展开/折叠图标 */}
        {node.type === 'folder' ? (
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* 文件/文件夹图标 */}
        {node.type === 'folder' ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )
        ) : node.name === 'outline.md' ? (
          <Sparkles className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : (
          <File className="h-4 w-4 text-blue-500 flex-shrink-0" />
        )}

        {/* 文件名 - 编辑模式或显示模式 */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => handleConfirmEdit()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 text-sm px-1 py-0.5 bg-background border border-border rounded outline-none focus:border-primary min-w-0"
          />
        ) : (
          <span className="flex-1 truncate text-sm">{node.name}</span>
        )}

        {/* 操作按钮 */}
        {isEditing ? (
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleConfirmEdit}
              className="flex-shrink-0 p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex-shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : showDeleteConfirm ? (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-destructive whitespace-nowrap">{deleteConfirmLabel || 'Delete?'}</span>
            <button
              onClick={handleConfirmDelete}
              className="flex-shrink-0 p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
              title="确认删除"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleCancelDelete}
              className="flex-shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="取消"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          showActions && (
            <div className="flex items-center gap-0.5">
              {node.is_protected ? (
                <span
                  className="flex-shrink-0 p-1 text-muted-foreground/50"
                  title={protectedFileLabel || 'Protected file'}
                >
                  <Lock className="h-3.5 w-3.5" />
                </span>
              ) : (
                <>
                  {onRenameNode && (
                    <button
                      onClick={handleStartEdit}
                      className="flex-shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onDeleteNode && (
                    <button
                      onClick={handleDeleteClick}
                      className="flex-shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )
        )}
      </div>

      {/* 子节点 */}
      {node.type === 'folder' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onDeleteNode={onDeleteNode}
              onRenameNode={onRenameNode}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              deleteConfirmLabel={deleteConfirmLabel}
              protectedFileLabel={protectedFileLabel}
              editingNodeId={editingNodeId}
              onEditingComplete={onEditingComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({
  files,
  selectedFileId,
  onSelectFile,
  onDeleteNode,
  onRenameNode,
  emptyLabel,
  deleteConfirmLabel,
  protectedFileLabel,
  editingNodeId,
  onEditingComplete,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // 当有节点正在编辑时，自动展开其父文件夹
  useEffect(() => {
    if (!editingNodeId) return;

    // 查找节点的父文件夹
    const findParentFolder = (nodes: FileNode[], targetId: string, parentId?: string): string | undefined => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return parentId;
        }
        if (node.children) {
          const found = findParentFolder(node.children, targetId, node.id);
          if (found !== undefined) {
            return found;
          }
        }
      }
      return undefined;
    };

    const parentId = findParentFolder(files, editingNodeId);
    if (parentId) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
  }, [editingNodeId, files]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm px-4">
          <Folder className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-center">{emptyLabel}</p>
        </div>
      ) : (
        files.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            level={0}
            selectedFileId={selectedFileId}
            onSelectFile={onSelectFile}
            onDeleteNode={onDeleteNode}
            onRenameNode={onRenameNode}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            deleteConfirmLabel={deleteConfirmLabel}
            protectedFileLabel={protectedFileLabel}
            editingNodeId={editingNodeId}
            onEditingComplete={onEditingComplete}
          />
        ))
      )}
    </div>
  );
}
