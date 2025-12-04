'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, FolderOpen, Archive } from 'lucide-react';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import ProjectCard from '@/components/project/ProjectCard';
import CreateProjectModal from '@/components/project/CreateProjectModal';
import { Project } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

export default function ProjectManagementPage() {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  // 是否正在查看归档项目
  const [viewingArchived, setViewingArchived] = useState(false);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      // 根据当前视图模式加载不同状态的项目
      const status = viewingArchived ? 'archived' : 'active';
      const response = await api.getProjects({ limit: 100, offset: 0, status });
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('加载项目列表失败:', error);
      toast.error(t.project.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [viewingArchived, t.project.loadFailed]);

  // 初始加载和切换视图时重新加载
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 处理创建项目
  const handleCreateProject = () => {
    setEditingProject(undefined);
    setIsModalOpen(true);
  };

  // 处理编辑项目
  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  // 处理删除项目
  const handleDeleteProject = async (projectId: number) => {
    if (!confirm(t.project.deleteConfirm)) {
      return;
    }

    try {
      await api.deleteProject(projectId);
      toast.success(t.project.deleteSuccess);
      // 刷新列表
      loadProjects();
    } catch (error) {
      console.error('删除项目失败:', error);
      toast.error(t.project.deleteFailed);
    }
  };

  // 处理归档项目
  const handleArchiveProject = async (projectId: number) => {
    if (!confirm(t.project.archiveConfirm)) {
      return;
    }

    try {
      await api.updateProject(projectId, { status: 'archived' });
      toast.success(t.project.archiveSuccess);
      // 刷新列表
      loadProjects();
    } catch (error) {
      console.error('归档项目失败:', error);
      toast.error(t.project.archiveFailed);
    }
  };

  // 处理恢复项目
  const handleRestoreProject = async (projectId: number) => {
    try {
      await api.updateProject(projectId, { status: 'active' });
      toast.success(t.project.restoreSuccess);
      // 刷新列表
      loadProjects();
    } catch (error) {
      console.error('恢复项目失败:', error);
      toast.error(t.project.restoreFailed);
    }
  };

  // 模态框成功回调
  const handleModalSuccess = () => {
    loadProjects();
  };

  return (
    <div className="p-6 relative min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl">
        {/* 页面头部 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {viewingArchived ? t.project.archivedTitle : t.project.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {viewingArchived ? t.project.archivedSubtitle : t.project.subtitle}
            </p>
          </div>
          {!viewingArchived && (
            <Button onClick={handleCreateProject} className="gap-2">
              <Plus className="h-5 w-5" />
              {t.project.create}
            </Button>
          )}
        </div>

        {/* 项目列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        ) : projects.length === 0 ? (
          // 空状态
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {viewingArchived ? t.project.noArchivedProjects : t.project.noProjects}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {viewingArchived ? t.project.noArchivedProjectsHint : t.project.noProjectsHint}
            </p>
            {!viewingArchived && (
              <Button onClick={handleCreateProject} className="gap-2">
                <Plus className="h-5 w-5" />
                {t.project.createFirst}
              </Button>
            )}
          </div>
        ) : (
          // 项目网格
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={handleEditProject}
                onDelete={handleDeleteProject}
                onArchive={handleArchiveProject}
                onRestore={handleRestoreProject}
              />
            ))}
          </div>
        )}
      </div>

      {/* 左下角归档切换按钮 - 相对于页面内容区域定位 */}
      <button
        onClick={() => setViewingArchived(!viewingArchived)}
        className="absolute bottom-6 left-6 z-10 p-3 rounded-full bg-card border border-border shadow-lg hover:bg-accent transition-all duration-200 group"
        title={viewingArchived ? t.project.viewActive : t.project.viewArchived}
      >
        <Archive
          className={`h-5 w-5 transition-colors ${
            viewingArchived
              ? 'text-primary'
              : 'text-muted-foreground group-hover:text-foreground'
          }`}
        />
      </button>

      {/* 创建/编辑项目模态框 */}
      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        project={editingProject}
      />
    </div>
  );
}
