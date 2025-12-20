"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Edit2, Pause, Play, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import {
	getGetAllJobsApiSchedulerJobsGetQueryKey,
	getGetSchedulerStatusApiSchedulerStatusGetQueryKey,
	useGetAllJobsApiSchedulerJobsGet,
	useGetSchedulerStatusApiSchedulerStatusGet,
	usePauseAllJobsApiSchedulerJobsPauseAllPost,
	usePauseJobApiSchedulerJobsJobIdPausePost,
	useResumeAllJobsApiSchedulerJobsResumeAllPost,
	useResumeJobApiSchedulerJobsJobIdResumePost,
	useUpdateJobIntervalApiSchedulerJobsJobIdIntervalPut,
} from "@/lib/generated/scheduler/scheduler";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

// 任务配置信息
interface JobConfig {
	zh: string;
	en: string;
	legacy?: boolean; // 是否为旧版任务（在此前端不需要）
	description?: { zh: string; en: string };
}

// 任务名称和配置映射
const JOB_CONFIG_MAP: Record<string, JobConfig> = {
	recorder_job: {
		zh: "屏幕录制",
		en: "Screen Recorder",
		description: {
			zh: "定时截取屏幕截图",
			en: "Capture screenshots periodically",
		},
	},
	ocr_job: {
		zh: "文字识别",
		en: "OCR Processing",
		description: {
			zh: "识别截图中的文字内容",
			en: "Extract text from screenshots",
		},
	},
	task_context_mapper_job: {
		zh: "任务上下文关联",
		en: "Task Context Mapper",
		legacy: true,
		description: {
			zh: "（旧版）关联截图与任务上下文",
			en: "(Legacy) Associate screenshots with task context",
		},
	},
	task_summary_job: {
		zh: "任务总结",
		en: "Task Summary",
		legacy: true,
		description: {
			zh: "（旧版）生成任务执行总结",
			en: "(Legacy) Generate task execution summary",
		},
	},
	clean_data_job: {
		zh: "数据清理",
		en: "Data Cleanup",
		description: {
			zh: "清理过期的截图和数据",
			en: "Clean up expired screenshots and data",
		},
	},
	activity_aggregator_job: {
		zh: "活动聚合",
		en: "Activity Aggregator",
		description: {
			zh: "聚合用户活动事件",
			en: "Aggregate user activity events",
		},
	},
};

// Legacy 任务列表
const LEGACY_JOB_IDS = ["task_context_mapper_job", "task_summary_job"];

interface SchedulerSectionProps {
	locale: "zh" | "en";
	loading?: boolean;
}

/**
 * 调度器管理设置区块
 */
export function SchedulerSection({
	locale,
	loading = false,
}: SchedulerSectionProps) {
	const queryClient = useQueryClient();
	const [editingJobId, setEditingJobId] = useState<string | null>(null);
	const [editInterval, setEditInterval] = useState({
		hours: 0,
		minutes: 0,
		seconds: 0,
	});
	const [showLegacy, setShowLegacy] = useState(false);

	// 获取任务列表和状态
	const { data: jobsData, isLoading: jobsLoading } =
		useGetAllJobsApiSchedulerJobsGet({
			query: {
				refetchInterval: 10000, // 每10秒刷新一次
			},
		});

	const { data: statusData, isLoading: statusLoading } =
		useGetSchedulerStatusApiSchedulerStatusGet({
			query: {
				refetchInterval: 10000,
			},
		});

	// 操作 mutations
	const pauseJobMutation = usePauseJobApiSchedulerJobsJobIdPausePost();
	const resumeJobMutation = useResumeJobApiSchedulerJobsJobIdResumePost();
	const pauseAllMutation = usePauseAllJobsApiSchedulerJobsPauseAllPost();
	const resumeAllMutation = useResumeAllJobsApiSchedulerJobsResumeAllPost();
	const updateIntervalMutation =
		useUpdateJobIntervalApiSchedulerJobsJobIdIntervalPut();

	const isLoading =
		loading ||
		jobsLoading ||
		statusLoading ||
		pauseJobMutation.isPending ||
		resumeJobMutation.isPending ||
		pauseAllMutation.isPending ||
		resumeAllMutation.isPending ||
		updateIntervalMutation.isPending;

	// 刷新数据
	const handleRefresh = () => {
		queryClient.invalidateQueries({
			queryKey: getGetAllJobsApiSchedulerJobsGetQueryKey(),
		});
		queryClient.invalidateQueries({
			queryKey: getGetSchedulerStatusApiSchedulerStatusGetQueryKey(),
		});
	};

	// 暂停单个任务
	const handlePauseJob = async (jobId: string) => {
		try {
			await pauseJobMutation.mutateAsync({ jobId });
			toastSuccess(
				locale === "zh"
					? `任务 ${getJobName(jobId)} 已暂停`
					: `Job ${getJobName(jobId)} paused`,
			);
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(locale === "zh" ? `暂停失败: ${msg}` : `Pause failed: ${msg}`);
		}
	};

	// 恢复单个任务
	const handleResumeJob = async (jobId: string) => {
		try {
			await resumeJobMutation.mutateAsync({ jobId });
			toastSuccess(
				locale === "zh"
					? `任务 ${getJobName(jobId)} 已恢复`
					: `Job ${getJobName(jobId)} resumed`,
			);
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(
				locale === "zh" ? `恢复失败: ${msg}` : `Resume failed: ${msg}`,
			);
		}
	};

	// 暂停所有任务（不包括 legacy）
	const handlePauseAll = async () => {
		try {
			await pauseAllMutation.mutateAsync();
			toastSuccess(locale === "zh" ? "已暂停所有任务" : "All jobs paused");
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(locale === "zh" ? `暂停失败: ${msg}` : `Pause failed: ${msg}`);
		}
	};

	// 恢复所有任务（不包括 legacy）
	const handleResumeAll = async () => {
		try {
			await resumeAllMutation.mutateAsync();
			toastSuccess(locale === "zh" ? "已恢复所有任务" : "All jobs resumed");
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(
				locale === "zh" ? `恢复失败: ${msg}` : `Resume failed: ${msg}`,
			);
		}
	};

	// 开始编辑间隔
	const handleStartEditInterval = (jobId: string, trigger: string) => {
		const parsed = parseIntervalToNumbers(trigger);
		setEditInterval(parsed);
		setEditingJobId(jobId);
	};

	// 取消编辑
	const handleCancelEdit = () => {
		setEditingJobId(null);
		setEditInterval({ hours: 0, minutes: 0, seconds: 0 });
	};

	// 保存间隔
	const handleSaveInterval = async (jobId: string) => {
		const { hours, minutes, seconds } = editInterval;

		// 验证至少有一个值
		if (hours === 0 && minutes === 0 && seconds === 0) {
			toastError(locale === "zh" ? "间隔时间不能为0" : "Interval cannot be 0");
			return;
		}

		try {
			await updateIntervalMutation.mutateAsync({
				jobId,
				data: {
					job_id: jobId,
					hours: hours > 0 ? hours : undefined,
					minutes: minutes > 0 ? minutes : undefined,
					seconds: seconds > 0 ? seconds : undefined,
				},
			});
			toastSuccess(
				locale === "zh"
					? `任务 ${getJobName(jobId)} 间隔已更新`
					: `Job ${getJobName(jobId)} interval updated`,
			);
			handleCancelEdit();
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(
				locale === "zh" ? `更新失败: ${msg}` : `Update failed: ${msg}`,
			);
		}
	};

	// 获取任务显示名称
	const getJobName = (jobId: string) => {
		const config = JOB_CONFIG_MAP[jobId];
		if (config) {
			return locale === "zh" ? config.zh : config.en;
		}
		return jobId;
	};

	// 获取任务描述
	const getJobDescription = (jobId: string) => {
		const config = JOB_CONFIG_MAP[jobId];
		if (config?.description) {
			return locale === "zh" ? config.description.zh : config.description.en;
		}
		return "";
	};

	// 检查是否为 legacy 任务
	const isLegacyJob = (jobId: string) => {
		return LEGACY_JOB_IDS.includes(jobId);
	};

	// 格式化下次运行时间
	const formatNextRunTime = (nextRunTime: string | null) => {
		if (!nextRunTime) {
			return locale === "zh" ? "已暂停" : "Paused";
		}
		const date = new Date(nextRunTime);
		return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	};

	// 解析 trigger 字符串获取间隔文字
	const parseInterval = (trigger: string) => {
		const match = trigger.match(/interval\[(\d+):(\d+):(\d+)\]/);
		if (match) {
			const hours = parseInt(match[1], 10);
			const minutes = parseInt(match[2], 10);
			const seconds = parseInt(match[3], 10);
			const parts: string[] = [];
			if (hours > 0) parts.push(locale === "zh" ? `${hours}小时` : `${hours}h`);
			if (minutes > 0)
				parts.push(locale === "zh" ? `${minutes}分钟` : `${minutes}m`);
			if (seconds > 0)
				parts.push(locale === "zh" ? `${seconds}秒` : `${seconds}s`);
			return parts.join(" ") || (locale === "zh" ? "未知" : "Unknown");
		}
		return trigger;
	};

	// 解析 trigger 字符串获取间隔数值
	const parseIntervalToNumbers = (trigger: string) => {
		const match = trigger.match(/interval\[(\d+):(\d+):(\d+)\]/);
		if (match) {
			return {
				hours: parseInt(match[1], 10),
				minutes: parseInt(match[2], 10),
				seconds: parseInt(match[3], 10),
			};
		}
		return { hours: 0, minutes: 0, seconds: 10 };
	};

	const status = statusData as
		| {
				running?: boolean;
				totalJobs?: number;
				runningJobs?: number;
				pausedJobs?: number;
		  }
		| undefined;
	const allJobs = jobsData?.jobs || [];

	// 分离活跃任务和 legacy 任务
	const activeJobs = allJobs.filter((job) => !isLegacyJob(job.id));
	const legacyJobs = allJobs.filter((job) => isLegacyJob(job.id));

	// 渲染单个任务项
	const renderJobItem = (
		job: {
			id: string;
			trigger: string;
			next_run_time?: string | null;
			pending?: boolean;
		},
		isLegacy = false,
	) => {
		const isRunning = job.pending ?? false;
		const isEditing = editingJobId === job.id;

		return (
			<div
				key={job.id}
				className={`rounded-md border px-3 py-2 ${
					isLegacy
						? "border-border/50 bg-muted/30 opacity-70"
						: "border-border bg-background/50"
				}`}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<span
							className={`h-2 w-2 rounded-full shrink-0 ${
								isRunning ? "bg-green-500" : "bg-yellow-500"
							}`}
							title={
								isRunning
									? locale === "zh"
										? "运行中"
										: "Running"
									: locale === "zh"
										? "已暂停"
										: "Paused"
							}
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<p className="text-sm font-medium text-foreground truncate">
									{getJobName(job.id)}
								</p>
								{isLegacy && (
									<span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
										Legacy
									</span>
								)}
							</div>
							<p className="text-xs text-muted-foreground truncate">
								{getJobDescription(job.id)}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() =>
							isRunning ? handlePauseJob(job.id) : handleResumeJob(job.id)
						}
						disabled={isLoading}
						className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
							isRunning
								? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
								: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
						}`}
					>
						{isRunning ? (
							<>
								<Pause className="h-3 w-3" />
								{locale === "zh" ? "暂停" : "Pause"}
							</>
						) : (
							<>
								<Play className="h-3 w-3" />
								{locale === "zh" ? "恢复" : "Resume"}
							</>
						)}
					</button>
				</div>

				{/* 间隔配置行 */}
				<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
					<Clock className="h-3 w-3 shrink-0" />
					{isEditing ? (
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-1">
								<input
									type="number"
									min="0"
									max="23"
									value={editInterval.hours}
									onChange={(e) =>
										setEditInterval((prev) => ({
											...prev,
											hours: parseInt(e.target.value, 10) || 0,
										}))
									}
									className="w-12 rounded border border-input bg-background px-1 py-0.5 text-xs text-center"
								/>
								<span>{locale === "zh" ? "时" : "h"}</span>
							</div>
							<div className="flex items-center gap-1">
								<input
									type="number"
									min="0"
									max="59"
									value={editInterval.minutes}
									onChange={(e) =>
										setEditInterval((prev) => ({
											...prev,
											minutes: parseInt(e.target.value, 10) || 0,
										}))
									}
									className="w-12 rounded border border-input bg-background px-1 py-0.5 text-xs text-center"
								/>
								<span>{locale === "zh" ? "分" : "m"}</span>
							</div>
							<div className="flex items-center gap-1">
								<input
									type="number"
									min="0"
									max="59"
									value={editInterval.seconds}
									onChange={(e) =>
										setEditInterval((prev) => ({
											...prev,
											seconds: parseInt(e.target.value, 10) || 0,
										}))
									}
									className="w-12 rounded border border-input bg-background px-1 py-0.5 text-xs text-center"
								/>
								<span>{locale === "zh" ? "秒" : "s"}</span>
							</div>
							<button
								type="button"
								onClick={() => handleSaveInterval(job.id)}
								disabled={isLoading}
								className="p-1 rounded hover:bg-accent text-green-600"
								title={locale === "zh" ? "保存" : "Save"}
							>
								<Check className="h-3 w-3" />
							</button>
							<button
								type="button"
								onClick={handleCancelEdit}
								className="p-1 rounded hover:bg-accent text-red-600"
								title={locale === "zh" ? "取消" : "Cancel"}
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					) : (
						<>
							<span>
								{locale === "zh" ? "间隔: " : "Interval: "}
								{parseInterval(job.trigger)}
							</span>
							<button
								type="button"
								onClick={() => handleStartEditInterval(job.id, job.trigger)}
								disabled={isLoading}
								className="p-0.5 rounded hover:bg-accent"
								title={locale === "zh" ? "编辑间隔" : "Edit interval"}
							>
								<Edit2 className="h-3 w-3" />
							</button>
							<span className="mx-1">•</span>
							<span>
								{locale === "zh" ? "下次: " : "Next: "}
								{formatNextRunTime(job.next_run_time ?? null)}
							</span>
						</>
					)}
				</div>
			</div>
		);
	};

	return (
		<SettingsSection
			title={locale === "zh" ? "定时任务管理" : "Scheduler Management"}
			description={
				locale === "zh"
					? "管理后台定时任务的运行状态和执行间隔"
					: "Manage background scheduled jobs and their intervals"
			}
		>
			{/* 状态概览 */}
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-4 text-sm text-muted-foreground">
					<span className="flex items-center gap-1">
						<span
							className={`h-2 w-2 rounded-full ${
								status?.running ? "bg-green-500" : "bg-red-500"
							}`}
						/>
						{status?.running
							? locale === "zh"
								? "调度器运行中"
								: "Scheduler Running"
							: locale === "zh"
								? "调度器已停止"
								: "Scheduler Stopped"}
					</span>
					<span>
						{locale === "zh"
							? `${status?.runningJobs || 0} 运行 / ${status?.pausedJobs || 0} 暂停`
							: `${status?.runningJobs || 0} running / ${status?.pausedJobs || 0} paused`}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isLoading}
						className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
						title={locale === "zh" ? "刷新" : "Refresh"}
					>
						<RefreshCw
							className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
						/>
					</button>
					<button
						type="button"
						onClick={handlePauseAll}
						disabled={isLoading}
						className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
					>
						<Pause className="h-3 w-3" />
						{locale === "zh" ? "全部暂停" : "Pause All"}
					</button>
					<button
						type="button"
						onClick={handleResumeAll}
						disabled={isLoading}
						className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
					>
						<Play className="h-3 w-3" />
						{locale === "zh" ? "全部恢复" : "Resume All"}
					</button>
				</div>
			</div>

			{/* 活跃任务列表 */}
			<div className="space-y-2">
				{activeJobs.map((job) => renderJobItem(job))}

				{activeJobs.length === 0 && !jobsLoading && (
					<div className="py-4 text-center text-sm text-muted-foreground">
						{locale === "zh" ? "暂无定时任务" : "No scheduled jobs"}
					</div>
				)}

				{jobsLoading && (
					<div className="py-4 text-center text-sm text-muted-foreground">
						{locale === "zh" ? "加载中..." : "Loading..."}
					</div>
				)}
			</div>

			{/* Legacy 任务区域 */}
			{legacyJobs.length > 0 && (
				<div className="mt-4 pt-4 border-t border-border">
					<button
						type="button"
						onClick={() => setShowLegacy(!showLegacy)}
						className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						<span
							className={`transition-transform ${showLegacy ? "rotate-90" : ""}`}
						>
							▶
						</span>
						{locale === "zh"
							? `旧版任务 (${legacyJobs.length})`
							: `Legacy Jobs (${legacyJobs.length})`}
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
							{locale === "zh" ? "此前端不需要" : "Not needed in this frontend"}
						</span>
					</button>

					{showLegacy && (
						<div className="mt-2 space-y-2">
							{legacyJobs.map((job) => renderJobItem(job, true))}
						</div>
					)}
				</div>
			)}
		</SettingsSection>
	);
}
