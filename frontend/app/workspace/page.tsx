"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useLocaleStore } from "@/lib/store/locale";
import { useTranslations } from "@/lib/i18n";
import { SimpleEditor } from "@/components/editor/markdownEditor/tiptap-templates/simple/simple-editor";
import { ChatBot } from "@/components/editor/chatBot/ChatBot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Save, Loader2, ChevronDown, FileText, MessageSquareMore } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { getWorkspaceOwnerId } from "@/lib/workspace/owner";
import type { WorkspaceFileResponse, WorkspaceFileSummary } from "@/lib/workspace/types";
import { diffWordsWithSpace, Change } from "diff";

interface AiEditSuggestion {
  original: string;
  suggested: string;
  instruction: string;
}

export default function WorkspacePage() {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const ownerId = useMemo(() => getWorkspaceOwnerId(), []);
  
  const [files, setFiles] = useState<WorkspaceFileSummary[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentFile, setCurrentFile] = useState<WorkspaceFileResponse | null>(null);
  const [lockId, setLockId] = useState<string | null>(null);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiEditSuggestion | null>(null);
  const [showAiDiff, setShowAiDiff] = useState(false);
  const [chatbotWidth, setChatbotWidth] = useState(400)
  const [isChatbotCollapsed, setIsChatbotCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const chatbotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const { data } = await api.getWorkspaceFiles();
        const fileList = data.files ?? [];
        setFiles(fileList);
        
        if (fileList.length === 0) return;

        const firstFile = fileList[0];
        const fileRes = await api.getWorkspaceFile(firstFile.path);
        const fileData = fileRes.data as WorkspaceFileResponse;
        
        const lockRes = await api.acquireWorkspaceLock({
          path: firstFile.path,
          owner: ownerId,
          mode: "human",
        });
        
        setCurrentFile(fileData);
        setMarkdown(fileData.content);
        setLockId(lockRes.data.lock_id);
        setIsDirty(false);
      } catch (error) {
        console.error("Failed to load files", error);
      }
    };

    loadFiles();
  }, [ownerId]);

  const handleSave = useCallback(async () => {
    if (!currentFile || !isDirty) return;
    
    setIsSaving(true);
    try {
      const { data } = await api.saveWorkspaceFile({
        path: currentFile.path,
        content: markdown,
        actor: "human",
        lock_id: lockId,
        last_known_modification: currentFile.updated_at,
      });
      
      const savedData = data as WorkspaceFileResponse;
      setCurrentFile(savedData);
      setMarkdown(savedData.content);
      setIsDirty(false);
      
      // Update file list with new metadata
      setFiles(prev => prev.map(f => 
        f.path === savedData.path 
          ? { ...f, size: savedData.size, updated_at: savedData.updated_at }
          : f
      ));
      
      toast.success("保存成功");
    } catch (error) {
      console.error("Save failed", error);
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [currentFile, isDirty, markdown, lockId]);

  // Keyboard shortcut for save (Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleFileSwitch = useCallback(async (file: WorkspaceFileSummary) => {
    if (file.path === currentFile?.path) return;
    
    if (isDirty) {
      toast.warning("请先保存当前文件");
      return;
    }

    try {
      if (lockId && currentFile) {
        await api.releaseWorkspaceLock({
          path: currentFile.path,
          owner: ownerId,
          lock_id: lockId,
        });
      }

      const fileRes = await api.getWorkspaceFile(file.path);
      const fileData = fileRes.data as WorkspaceFileResponse;
      
      const lockRes = await api.acquireWorkspaceLock({
        path: file.path,
        owner: ownerId,
        mode: "human",
      });
      
      setCurrentFile(fileData);
      setMarkdown(fileData.content);
      setLockId(lockRes.data.lock_id);
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to switch file", error);
      toast.error("切换文件失败");
    }
  }, [currentFile, isDirty, lockId, ownerId]);

  const handleAiEditRequest = useCallback(async (instruction: string) => {
    if (!currentFile || isAiEditing) return;
    
    setIsAiEditing(true);
    setShowAiDiff(false);
    
    try {
      // TODO: Replace with real AI agent API call
      // const response = await api.requestAiEdit({ path: currentFile.path, instruction, content: markdown });
      // const suggestedContent = response.data.content;
      
      // Mock AI service - simulates AI processing with delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Mock transformation: add metadata, TOC, and formatting improvements
      const suggestedContent = `---
title: AI Enhanced Document
generated: ${new Date().toISOString()}
instruction: ${instruction}
---

# Table of Contents
1. [Original Content](#original)

## Original Content

${markdown}

---
*Enhanced by AI Assistant*`;
      
      setAiSuggestion({
        original: markdown,
        suggested: suggestedContent,
        instruction,
      });
      setShowAiDiff(true);
    } catch (error) {
      console.error('AI edit failed:', error);
      toast.error('AI编辑失败');
    } finally {
      setIsAiEditing(false);
    }
  }, [currentFile, markdown, isAiEditing]);

  const handleAcceptAiEdit = useCallback(() => {
    if (!aiSuggestion) return;
    
    setMarkdown(aiSuggestion.suggested);
    setAiSuggestion(null);
    setShowAiDiff(false);
    
    // Set dirty state after a short delay to ensure SimpleEditor's effect runs first
    setTimeout(() => {
      setIsDirty(true);
    }, 0);
    
    toast.success('已应用AI建议');
  }, [aiSuggestion]);

  const handleRejectAiEdit = useCallback(() => {
    setAiSuggestion(null);
    setShowAiDiff(false);
    toast.info('已拒绝AI建议');
  }, []);

  const renderDiff = useCallback((original: string, suggested: string) => {
    const changes: Change[] = diffWordsWithSpace(original, suggested);
    
    return (
      <div className="max-h-[400px] overflow-auto rounded-lg border bg-background p-4">
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed overflow-wrap-anywhere">
          {changes.map((change, index) => {
            if (change.added) {
              return (
                <span
                  key={index}
                  className="bg-green-500/20 text-green-700 dark:text-green-400 rounded px-0.5"
                >
                  {change.value}
                </span>
              );
            } else if (change.removed) {
              return (
                <span
                  key={index}
                  className="bg-red-500/20 text-red-700 dark:text-red-400 line-through rounded px-0.5"
                >
                  {change.value}
                </span>
              );
            } else {
              return <span key={index}>{change.value}</span>;
            }
          })}
        </div>
      </div>
    );
  }, []);

  // Handle chatbot resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 450 && newWidth <= 700) {
        setChatbotWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex max-h-screen flex-col gap-6 bg-muted/20 p-6">
      <div className="flex flex-1 flex-col gap-6 xl:flex-row xl:gap-4">
        <section className="flex flex-1 flex-col rounded-3xl border border-border/60 bg-background/80 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={isAiEditing}>
                  <Button variant="outline" className="gap-2" disabled={isAiEditing}>
                    <FileText className="h-4 w-4" />
                    <span className="max-w-[200px] truncate">{currentFile?.name ?? "选择文件"}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[280px]">
                  {files.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">无可用文件</div>
                  ) : (
                    files.map((file) => (
                      <DropdownMenuItem
                        key={file.path}
                        onClick={() => handleFileSwitch(file)}
                        className="flex items-center gap-2"
                        disabled={file.path === currentFile?.path || isAiEditing}
                      >
                        <FileText className="h-4 w-4" />
                        <div className="flex-1 truncate">
                          <div className="font-medium">{file.name}</div>
                          <div className="text-xs text-muted-foreground">{file.path}</div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {currentFile && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{currentFile.path}</p>
                  {isDirty && (
                    <span className="text-xs text-amber-600">● 未保存</span>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              size="sm"
              className="gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </div>

          {showAiDiff && aiSuggestion && (
            <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">AI建议预览</h3>
                  <p className="text-sm text-muted-foreground">
                    指令: {aiSuggestion.instruction}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleRejectAiEdit}
                    variant="outline"
                    size="sm"
                  >
                    拒绝
                  </Button>
                  <Button
                    onClick={handleAcceptAiEdit}
                    variant="default"
                    size="sm"
                  >
                    接受
                  </Button>
                </div>
              </div>
              
              {renderDiff(aiSuggestion.original, aiSuggestion.suggested)}
            </div>
          )}

          <div className="mx-auto flex w-full max-h-[80vh] max-w-5xl flex-1">
            <SimpleEditor
              key={currentFile?.path || 'no-file'}
              markdown={markdown}
              onMarkdownChange={setMarkdown}
              onDirtyChange={setIsDirty}
              readOnly={isSaving || isAiEditing}
              onSelectionChange={setSelectedText}
            />
          </div>
        </section>

        {!isChatbotCollapsed && (
          <div
            ref={chatbotRef}
            style={{ width: `${chatbotWidth}px` }}
            className="relative shrink-0 transition-none"
          >
            {/* Resize handle */}
            <div
              onMouseDown={handleMouseDown}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
            />
            <div className="max-h-[80vh] pl-2">
              <ChatBot 
                copy={t.workspace.chatPanel}
                onAiEditRequest={handleAiEditRequest}
                isAiEditing={isAiEditing}
                currentFileName={currentFile?.name}
                onCollapse={() => setIsChatbotCollapsed(true)}
                selectedContext={selectedText}
              />
            </div>
          </div>
        )}
        
        {/* Collapsed ChatBot Button */}
        {isChatbotCollapsed && (
          <div className="shrink-0">
            <button
              onClick={() => setIsChatbotCollapsed(false)}
              className="flex h-full items-center justify-center w-12 border-l border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground">
                <MessageSquareMore className="h-5 w-5" />
                <span className="text-xs font-medium writing-mode-vertical-rl transform">
                  ChatBot
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
