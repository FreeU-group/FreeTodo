"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Edit2, Pause, Play, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { useLocaleStore } from "@/lib/store/locale";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

// Legacy 任务列表
const LEGACY_JOB_IDS = ["task_context_mapper_job", "task_summary_job"];

interface SchedulerSectionProps {
	loading?: boolean;
}

/**
 * 调度器管理设置区块
 */
export function SchedulerSection({ loading = false }: SchedulerSectionProps) {
	const { locale } = useLocaleStore();
	const t = useTranslations("scheduler");
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
			toastSuccess(t("jobPaused", { job: getJobName(jobId) }));
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("pauseFailed", { error: msg }));
		}
	};

	// 恢复单个任务
	const handleResumeJob = async (jobId: string) => {
		try {
			await resumeJobMutation.mutateAsync({ jobId });
			toastSuccess(t("jobResumed", { job: getJobName(jobId) }));
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("resumeFailed", { error: msg }));
		}
	};

	// 暂停所有任务（不包括 legacy）
	const handlePauseAll = async () => {
		try {
			await pauseAllMutation.mutateAsync();
			toastSuccess(t("allJobsPaused"));
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("pauseFailed", { error: msg }));
		}
	};

	// 恢复所有任务（不包括 legacy）
	const handleResumeAll = async () => {
		try {
			await resumeAllMutation.mutateAsync();
			toastSuccess(t("allJobsResumed"));
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("resumeFailed", { error: msg }));
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
			toastError(t("intervalCannotBeZero"));
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
			toastSuccess(t("intervalUpdated", { job: getJobName(jobId) }));
			handleCancelEdit();
			handleRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("updateFailed", { error: msg }));
		}
	};

	// 获取任务显示名称
	const getJobName = (jobId: string) => {
		try {
			return t(`jobs.${jobId}` as Parameters<typeof t>[0]);
		} catch {
			return jobId;
		}
	};

	// 获取任务描述
	const getJobDescription = (jobId: string) => {
		try {
			return t(`jobDescriptions.${jobId}` as Parameters<typeof t>[0]);
		} catch {
			return "";
		}
	};

	// 检查是否为 legacy 任务
	const isLegacyJob = (jobId: string) => {
		return LEGACY_JOB_IDS.includes(jobId);
	};

	// 格式化下次运行时间
	const formatNextRunTime = (nextRunTime: string | null) => {
		if (!nextRunTime) {
			return t("paused");
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
			if (hours > 0) parts.push(`${hours}${t("hour")}`);
			if (minutes > 0) parts.push(`${minutes}${t("minute")}`);
			if (seconds > 0) parts.push(`${seconds}${t("second")}`);
			return parts.join(" ") || trigger;
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
							title={isRunning ? t("running") : t("paused")}
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
								{t("pause")}
							</>
						) : (
							<>
								<Play className="h-3 w-3" />
								{t("resume")}
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
								<span>{t("hour")}</span>
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
								<span>{t("minute")}</span>
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
								<span>{t("second")}</span>
							</div>
							<button
								type="button"
								onClick={() => handleSaveInterval(job.id)}
								disabled={isLoading}
								className="p-1 rounded hover:bg-accent text-green-600"
								title={t("save")}
							>
								<Check className="h-3 w-3" />
							</button>
							<button
								type="button"
								onClick={handleCancelEdit}
								className="p-1 rounded hover:bg-accent text-red-600"
								title={t("cancel")}
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					) : (
						<>
							<span>
								{t("interval")}: {parseInterval(job.trigger)}
							</span>
							<button
								type="button"
								onClick={() => handleStartEditInterval(job.id, job.trigger)}
								disabled={isLoading}
								className="p-0.5 rounded hover:bg-accent"
								title={t("editInterval")}
							>
								<Edit2 className="h-3 w-3" />
							</button>
							<span className="mx-1">•</span>
							<span>
								{t("next")}: {formatNextRunTime(job.next_run_time ?? null)}
							</span>
						</>
					)}
				</div>
			</div>
		);
	};

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			{/* 状态概览 */}
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-4 text-sm text-muted-foreground">
					<span className="flex items-center gap-1">
						<span
							className={`h-2 w-2 rounded-full ${
								status?.running ? "bg-green-500" : "bg-red-500"
							}`}
						/>
						{status?.running ? t("schedulerRunning") : t("schedulerStopped")}
					</span>
					<span>
						{t("runningCount", {
							running: status?.runningJobs || 0,
							paused: status?.pausedJobs || 0,
						})}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isLoading}
						className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
						title={t("refresh")}
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
						{t("pauseAll")}
					</button>
					<button
						type="button"
						onClick={handleResumeAll}
						disabled={isLoading}
						className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
					>
						<Play className="h-3 w-3" />
						{t("resumeAll")}
					</button>
				</div>
			</div>

			{/* 活跃任务列表 */}
			<div className="space-y-2">
				{activeJobs.map((job) => renderJobItem(job))}

				{activeJobs.length === 0 && !jobsLoading && (
					<div className="py-4 text-center text-sm text-muted-foreground">
						{t("noJobs")}
					</div>
				)}

				{jobsLoading && (
					<div className="py-4 text-center text-sm text-muted-foreground">
						{t("loading")}
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
						{t("legacyJobs")} ({legacyJobs.length})
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
							{t("legacyNotNeeded")}
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
