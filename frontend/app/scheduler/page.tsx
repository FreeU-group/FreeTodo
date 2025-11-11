'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Pause,
  Play,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';

interface Job {
  id: string;
  name: string | null;
  func: string;
  trigger: string;
  next_run_time: string | null;
  pending: boolean;
}

interface SchedulerStatus {
  running: boolean;
  total_jobs: number;
  running_jobs: number;
  paused_jobs: number;
}

export default function SchedulerPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState<string>('');
  const [intervalMinutes, setIntervalMinutes] = useState<string>('');
  const [intervalHours, setIntervalHours] = useState<string>('');

  // 加载任务列表
  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.getSchedulerJobs();
      setJobs(response.data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  // 加载调度器状态
  const loadStatus = async () => {
    try {
      const response = await api.getSchedulerStatus();
      setStatus(response.data);
    } catch (err) {
      console.error('加载状态失败:', err);
    }
  };

  // 初始加载
  useEffect(() => {
    loadJobs();
    loadStatus();
  }, []);

  // 暂停任务
  const handlePauseJob = async (jobId: string) => {
    try {
      setError(null);
      await api.pauseSchedulerJob(jobId);
      setSuccess(`任务 ${jobId} 已暂停`);
      loadJobs();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 恢复任务
  const handleResumeJob = async (jobId: string) => {
    try {
      setError(null);
      await api.resumeSchedulerJob(jobId);
      setSuccess(`任务 ${jobId} 已恢复`);
      loadJobs();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 删除任务
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm(`确定要删除任务 ${jobId} 吗？`)) {
      return;
    }

    try {
      setError(null);
      await api.deleteSchedulerJob(jobId);
      setSuccess(`任务 ${jobId} 已删除`);
      loadJobs();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 打开编辑对话框
  const handleOpenEditDialog = (job: Job) => {
    setEditingJob(job);
    // 解析当前触发器获取间隔
    const triggerMatch = job.trigger.match(/interval\[(\d+):(\d+):(\d+)\]/);
    if (triggerMatch) {
      setIntervalHours(triggerMatch[1]);
      setIntervalMinutes(triggerMatch[2]);
      setIntervalSeconds(triggerMatch[3]);
    } else {
      setIntervalHours('');
      setIntervalMinutes('');
      setIntervalSeconds('');
    }
    setEditDialogOpen(true);
  };

  // 关闭编辑对话框
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingJob(null);
    setIntervalSeconds('');
    setIntervalMinutes('');
    setIntervalHours('');
  };

  // 更新任务间隔
  const handleUpdateInterval = async () => {
    if (!editingJob) return;

    const seconds = intervalSeconds ? parseInt(intervalSeconds) : undefined;
    const minutes = intervalMinutes ? parseInt(intervalMinutes) : undefined;
    const hours = intervalHours ? parseInt(intervalHours) : undefined;

    if (!seconds && !minutes && !hours) {
      setError('请至少设置一个时间间隔');
      return;
    }

    try {
      setError(null);
      const response = await api.updateSchedulerJobInterval(editingJob.id, {
        job_id: editingJob.id,
        seconds,
        minutes,
        hours,
      });
      setSuccess(response.data.message);
      handleCloseEditDialog();
      loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 全部暂停
  const handlePauseAll = async () => {
    if (!confirm('确定要暂停所有任务吗？')) {
      return;
    }

    try {
      setError(null);
      const response = await api.pauseAllSchedulerJobs();
      setSuccess(response.data.message);
      loadJobs();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 全部启动
  const handleResumeAll = async () => {
    if (!confirm('确定要启动所有任务吗？')) {
      return;
    }

    try {
      setError(null);
      const response = await api.resumeAllSchedulerJobs();
      setSuccess(response.data.message);
      loadJobs();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 格式化下次运行时间
  const formatNextRunTime = (nextRunTime: string | null) => {
    if (!nextRunTime) return '-';
    const date = new Date(nextRunTime);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">定时任务管理</h1>
          <p className="text-gray-600 dark:text-gray-400">
            管理和监控所有定时任务的执行状态
          </p>
        </div>

        {/* 消息提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start justify-between">
            <div className="flex items-start">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 mt-0.5" />
              <span className="text-red-800 dark:text-red-200">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
            >
              ×
            </button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start justify-between">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-2 mt-0.5" />
              <span className="text-green-800 dark:text-green-200">{success}</span>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
            >
              ×
            </button>
          </div>
        )}

        {/* 状态卡片 */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                调度器状态
              </p>
              <div className="flex items-center gap-2">
                {status.running ? (
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                )}
                <span className="text-2xl font-bold">
                  {status.running ? '运行中' : '已停止'}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                总任务数
              </p>
              <p className="text-2xl font-bold">{status.total_jobs}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                运行中任务
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {status.running_jobs}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                已暂停任务
              </p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {status.paused_jobs}
              </p>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mb-4 flex justify-end gap-2">
          <button
            onClick={handlePauseAll}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-yellow-600 dark:text-yellow-400 hover:border-yellow-400 dark:hover:border-yellow-500"
          >
            <Pause className="w-4 h-4" />
            全部暂停
          </button>
          <button
            onClick={handleResumeAll}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-green-600 dark:text-green-400 hover:border-green-400 dark:hover:border-green-500"
          >
            <Play className="w-4 h-4" />
            全部启动
          </button>
          <button
            onClick={() => {
              loadJobs();
              loadStatus();
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        {/* 任务列表 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    任务名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    任务ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    触发器
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    下次运行时间
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      暂无任务
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {job.name || job.id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{job.id}</span>
                          <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                            {job.func}
                          </code>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm">{job.trigger}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm">
                          <Clock className="w-4 h-4 mr-1 text-gray-400" />
                          {formatNextRunTime(job.next_run_time)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {job.pending ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                            运行中
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                            已暂停
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditDialog(job)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="编辑间隔"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          {job.pending ? (
                            <button
                              onClick={() => handlePauseJob(job.id)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                              title="暂停"
                            >
                              <Pause className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleResumeJob(job.id)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                              title="恢复"
                            >
                              <Play className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 编辑间隔对话框 */}
        {editDialogOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold">编辑任务间隔</h2>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  任务: {editingJob?.id}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      小时
                    </label>
                    <input
                      type="number"
                      value={intervalHours}
                      onChange={(e) => setIntervalHours(e.target.value)}
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      分钟
                    </label>
                    <input
                      type="number"
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(e.target.value)}
                      min="0"
                      max="59"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      秒
                    </label>
                    <input
                      type="number"
                      value={intervalSeconds}
                      onChange={(e) => setIntervalSeconds(e.target.value)}
                      min="0"
                      max="59"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button
                  onClick={handleCloseEditDialog}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateInterval}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
           </div>
         )}
       </div>
  );
}
