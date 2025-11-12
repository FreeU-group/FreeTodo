'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Clock, FileText, Sparkles, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import { TaskProgress } from '@/lib/types';
import { api } from '@/lib/api';
import Loading from '@/components/common/Loading';
import MessageContent from '@/components/common/MessageContent';
import { toast } from '@/lib/toast';

interface TaskProgressCardProps {
  projectId: number;
  taskId: number;
}

export default function TaskProgressCard({ projectId, taskId }: TaskProgressCardProps) {
  const [latestProgress, setLatestProgress] = useState<TaskProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadLatestProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getLatestTaskProgress(projectId, taskId);
      console.log('任务进展数据:', response.data);
      // API 现在返回 null 而不是 404 错误
      setLatestProgress(response.data || null);
    } catch (err) {
        console.error('加载任务进展失败:', err);
        setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  const handleGenerateSummary = async () => {
    setGenerating(true);
    try {
      const response = await api.generateTaskSummary(projectId, taskId);
      if (response.data.success) {
        toast.success(`生成成功！已总结 ${response.data.contexts_summarized} 个上下文`);
        // 重新加载最新进展
        await loadLatestProgress();
      } else {
        toast.error(response.data.message || '生成失败');
      }
    } catch (err) {
      console.error('生成任务总结失败:', err);
      const errorMsg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '生成失败，请稍后重试';
      toast.error(errorMsg);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    loadLatestProgress();
  }, [loadLatestProgress]);

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              任务进展
            </CardTitle>
            <button
              onClick={handleGenerateSummary}
              disabled={generating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="手动生成进度总结"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
              生成总结
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loading />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              任务进展
            </CardTitle>
            <button
              onClick={handleGenerateSummary}
              disabled={generating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="手动生成进度总结"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
              生成总结
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!latestProgress) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              任务进展
            </CardTitle>
            <button
              onClick={handleGenerateSummary}
              disabled={generating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="手动生成进度总结"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
              生成总结
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">暂无进展记录</p>
            <p className="text-xs text-muted-foreground">
              AI 会定期分析任务相关的工作上下文并生成进展摘要
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg mb-2">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
              最新进展
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1" title="上下文数量">
                <TrendingUp className="h-3 w-3" />
                <span>{latestProgress.context_count} 条</span>
              </div>
              <div className="flex items-center gap-1" title="更新时间">
                <Clock className="h-3 w-3" />
                <span>{formatDateTime(latestProgress.created_at)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleGenerateSummary}
            disabled={generating}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="手动生成进度总结"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
            生成总结
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <MessageContent
          content={latestProgress.summary}
          isMarkdown={true}
        />
      </CardContent>
    </Card>
  );
}
