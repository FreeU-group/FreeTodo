'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, FileText, Clock, ArrowRight, BookOpen, FlaskConical, Wrench, FileQuestion } from 'lucide-react';
import Button from '@/components/common/Button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);

// 工作区项目类型
export interface WorkspaceProject {
  id: string;
  name: string;
  file_count: number;
  last_modified: string | null;
  created_at: string | null;
}

// 论文项目类型
type ProjectType = 'liberal_arts' | 'science' | 'engineering' | 'other';

interface WorkspaceProjectListProps {
  onSelectProject: (projectId: string, options?: { isNew?: boolean; projectType?: ProjectType }) => void;
  // i18n labels
  title: string;
  subtitle: string;
  createProjectLabel: string;
  createFirstProjectLabel: string;
  noProjectsLabel: string;
  noProjectsHint: string;
  projectNameLabel: string;
  projectNamePlaceholder: string;
  projectNameRequired: string;
  projectCreateSuccess: string;
  projectCreateFailed: string;
  projectDeleteSuccess: string;
  projectDeleteFailed: string;
  projectDeleteConfirm: string;
  projectFileCount: string;
  projectLastModified: string;
  enterProjectLabel: string;
  locale: string;
  // 项目类型 i18n
  projectTypeLabel?: string;
  projectTypeHint?: string;
  projectTypes?: {
    liberal_arts: string;
    science: string;
    engineering: string;
    other: string;
  };
  projectTypeDesc?: {
    liberal_arts: string;
    science: string;
    engineering: string;
    other: string;
  };
}

// 项目类型配置
const PROJECT_TYPE_CONFIG: { type: ProjectType; icon: typeof BookOpen }[] = [
  { type: 'liberal_arts', icon: BookOpen },
  { type: 'science', icon: FlaskConical },
  { type: 'engineering', icon: Wrench },
  { type: 'other', icon: FileQuestion },
];

export default function WorkspaceProjectList({
  onSelectProject,
  title,
  subtitle,
  createProjectLabel,
  createFirstProjectLabel,
  noProjectsLabel,
  noProjectsHint,
  projectNameLabel,
  projectNamePlaceholder,
  projectNameRequired,
  projectCreateSuccess,
  projectCreateFailed,
  projectDeleteSuccess,
  projectDeleteFailed,
  projectDeleteConfirm,
  projectFileCount,
  projectLastModified,
  enterProjectLabel,
  locale,
  projectTypeLabel = '论文类型',
  projectTypeHint = '选择论文类型，系统将自动生成对应的大纲模板',
  projectTypes = {
    liberal_arts: '文科',
    science: '理科',
    engineering: '工科',
    other: '其他',
  },
  projectTypeDesc = {
    liberal_arts: '适用于文学、历史、哲学、社会学等人文社科类论文',
    science: '适用于数学、物理、化学、生物等自然科学类论文',
    engineering: '适用于计算机、机械、电子、土木等工程技术类论文',
    other: '适用于其他类型的论文或通用写作项目',
  },
}: WorkspaceProjectListProps) {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('other');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 设置 dayjs 语言
  useEffect(() => {
    dayjs.locale(locale === 'zh' ? 'zh-cn' : 'en');
  }, [locale]);

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await api.getWorkspaceProjects();
      if (response.data?.projects) {
        setProjects(response.data.projects);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建项目
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error(projectNameRequired);
      return;
    }

    try {
      setCreating(true);
      const response = await api.createWorkspaceProject(newProjectName.trim(), newProjectType);

      if (response.data?.success) {
        toast.success(projectCreateSuccess);
        setShowCreateModal(false);
        const createdProjectType = newProjectType;
        setNewProjectName('');
        setNewProjectType('other');
        loadProjects();
        // 创建成功后直接进入项目，标记为新建项目并传递类型
        if (response.data.project_id) {
          onSelectProject(response.data.project_id, { isNew: true, projectType: createdProjectType });
        }
      } else {
        toast.error(response.data?.error || projectCreateFailed);
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      toast.error(projectCreateFailed);
    } finally {
      setCreating(false);
    }
  };

  // 删除项目
  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(projectDeleteConfirm)) {
      return;
    }

    try {
      setDeletingId(projectId);
      const response = await api.deleteWorkspaceProject(projectId);

      if (response.data?.success) {
        toast.success(projectDeleteSuccess);
        loadProjects();
      } else {
        toast.error(response.data?.error || projectDeleteFailed);
      }
    } catch (error) {
      console.error('删除项目失败:', error);
      toast.error(projectDeleteFailed);
    } finally {
      setDeletingId(null);
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    return dayjs(timeStr).fromNow();
  };

  // 格式化文件数量
  const formatFileCount = (count: number) => {
    return projectFileCount.replace('{count}', String(count));
  };

  // 格式化最后修改时间
  const formatLastModified = (timeStr: string | null) => {
    if (!timeStr) return '';
    return projectLastModified.replace('{time}', formatTime(timeStr));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex-shrink-0 border-b border-border px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {createProjectLabel}
          </Button>
        </div>
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl mx-auto">
          {projects.length === 0 ? (
            // 空状态
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <FolderOpen className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">{noProjectsLabel}</h3>
              <p className="text-muted-foreground mb-6">{noProjectsHint}</p>
              <Button onClick={() => setShowCreateModal(true)} size="lg">
                <Plus className="h-5 w-5 mr-2" />
                {createFirstProjectLabel}
              </Button>
            </div>
          ) : (
            // 项目卡片网格
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative bg-card border border-border rounded-xl p-5 hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer"
                  onClick={() => onSelectProject(project.id)}
                >
                  {/* 项目图标和名称 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate pr-8">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {formatFileCount(project.file_count)}
                        </span>
                        {project.last_modified && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatTime(project.last_modified)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 进入项目按钮 */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {formatLastModified(project.last_modified)}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* 删除按钮 */}
                      <button
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        disabled={deletingId === project.id}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        title="删除项目"
                      >
                        {deletingId === project.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                      {/* 进入按钮 */}
                      <span className="flex items-center gap-1 text-sm text-primary font-medium">
                        {enterProjectLabel}
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 创建项目弹窗 */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">{createProjectLabel}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-foreground transition-colors hover:bg-muted"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* 表单 */}
            <div className="p-6 space-y-5">
              {/* 项目名称 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {projectNameLabel} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !creating) {
                      handleCreateProject();
                    }
                  }}
                  placeholder={projectNamePlaceholder}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* 论文类型 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {projectTypeLabel} <span className="text-destructive">*</span>
                </label>
                <p className="text-xs text-muted-foreground mb-3">{projectTypeHint}</p>
                <div className="grid grid-cols-2 gap-3">
                  {PROJECT_TYPE_CONFIG.map(({ type, icon: Icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewProjectType(type)}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        newProjectType === type
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className={`flex-shrink-0 p-2 rounded-lg ${
                        newProjectType === type ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        <Icon className={`h-5 w-5 ${
                          newProjectType === type ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${
                          newProjectType === type ? 'text-primary' : 'text-foreground'
                        }`}>
                          {projectTypes[type]}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {projectTypeDesc[type]}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  取消
                </Button>
                <Button onClick={handleCreateProject} disabled={creating}>
                  {creating ? '创建中...' : '创建'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
