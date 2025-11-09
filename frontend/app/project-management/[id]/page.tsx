'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, FolderOpen } from 'lucide-react';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import TaskList from '@/components/task/TaskList';
import CreateTaskModal from '@/components/task/CreateTaskModal';
import { Project, Task } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = parseInt(params.id as string);

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [parentTaskId, setParentTaskId] = useState<number | undefined>(undefined);

  // 加载项目信息
  const loadProject = async () => {
    try {
      const response = await api.getProject(projectId);
      setProject(response.data);
    } catch (error) {
      console.error('加载项目信息失败:', error);
      toast.error('加载项目信息失败');
    }
  };

  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true);
    try {
      const response = await api.getProjectTasks(projectId, {
        limit: 1000,
        offset: 0,
        include_subtasks: true,
      });
      setTasks(response.data.tasks || []);
    } catch (error) {
      console.error('加载任务列表失败:', error);
      toast.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    if (projectId) {
      loadProject();
      loadTasks();
    }
  }, [projectId]);

  // 处理创建任务
  const handleCreateTask = (parentId?: number) => {
    setEditingTask(undefined);
    setParentTaskId(parentId);
    setIsModalOpen(true);
  };

  // 处理编辑任务
  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setParentTaskId(undefined);
    setIsModalOpen(true);
  };

  // 处理删除任务
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('确定要删除这个任务吗？此操作将同时删除所有子任务且不可恢复。')) {
      return;
    }

    try {
      await api.deleteTask(projectId, taskId);
      toast.success('任务删除成功');
      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
      toast.error('删除任务失败');
    }
  };

  // 处理任务状态变更
  const handleTaskStatusChange = async (taskId: number, newStatus: string) => {
    try {
      await api.updateTask(projectId, taskId, { status: newStatus });
      toast.success('任务状态已更新');
      loadTasks();
    } catch (error) {
      console.error('更新任务状态失败:', error);
      toast.error('更新任务状态失败');
    }
  };

  // 模态框成功回调
  const handleModalSuccess = () => {
    loadTasks();
  };

  if (!project && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground mb-4">项目不存在</p>
        <Button onClick={() => router.push('/project-management')}>
          返回项目列表
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        {/* 顶部导航 */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/project-management')}
            className="gap-2 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
          </Button>

          {project && (
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">{project.name}</h1>
                {project.goal && (
                  <p className="mt-2 text-muted-foreground">{project.goal}</p>
                )}
              </div>
              <Button onClick={() => handleCreateTask()} className="gap-2">
                <Plus className="h-5 w-5" />
                创建任务
              </Button>
            </div>
          )}
        </div>

        {/* 任务列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        ) : tasks.length === 0 ? (
          // 空状态
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  还没有任务
                </h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  创建第一个任务，开始管理您的工作
                </p>
                <Button onClick={() => handleCreateTask()} className="gap-2">
                  <Plus className="h-5 w-5" />
                  创建第一个任务
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          // 任务列表
          <TaskList
            tasks={tasks}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onStatusChange={handleTaskStatusChange}
            onCreateSubtask={handleCreateTask}
            projectId={projectId}
          />
        )}
      </div>

      {/* 创建/编辑任务模态框 */}
      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        projectId={projectId}
        task={editingTask}
        parentTaskId={parentTaskId}
      />
    </div>
  );
}

