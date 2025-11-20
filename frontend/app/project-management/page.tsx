'use client';

import { useState, useEffect } from 'react';
import { Plus, FolderOpen } from 'lucide-react';
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

  // 加载项目列表
  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await api.getProjects({ limit: 100, offset: 0 });
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('加载项目列表失败:', error);
      toast.error(t.project.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadProjects();
  }, []);

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

  // 模态框成功回调
  const handleModalSuccess = () => {
    loadProjects();
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        {/* 页面头部 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t.project.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.project.subtitle}
            </p>
          </div>
          <Button onClick={handleCreateProject} className="gap-2">
            <Plus className="h-5 w-5" />
            {t.project.create}
          </Button>
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
              {t.project.noProjects}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {t.project.noProjectsHint}
            </p>
            <Button onClick={handleCreateProject} className="gap-2">
              <Plus className="h-5 w-5" />
              {t.project.createFirst}
            </Button>
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
              />
            ))}
          </div>
        )}
      </div>

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
