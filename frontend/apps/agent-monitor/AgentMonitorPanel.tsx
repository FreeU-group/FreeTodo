"use client";

import {
	Activity,
	BrainCircuit,
	ChevronDown,
	ChevronRight,
	Clock,
	MessageSquare,
	RefreshCw,
	Search,
	Sparkles,
	StopCircle,
	Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { cn } from "@/lib/utils";
import { getRuntimeBackendUrl } from "@/lib/runtime-backend-url";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ActivityStep {
	type: string;
	name: string;
	content: string;
	ts: number;
}

interface AgentActivity {
	id: string;
	agent_type: string;
	task: string;
	model: string;
	status: "running" | "completed" | "error" | "cancelled";
	started_at: number;
	updated_at: number;
	ended_at?: number;
	duration_ms?: number;
	details: { steps?: ActivityStep[]; [k: string]: unknown };
}

interface ActivityEvent {
	event: "snapshot" | "start" | "update" | "stop" | "step";
	activities?: AgentActivity[];
	id?: string;
	agent_type?: string;
	task?: string;
	model?: string;
	status?: string;
	started_at?: number;
	ended_at?: number;
	duration_ms?: number;
	step?: ActivityStep;
	details?: { steps?: ActivityStep[]; [k: string]: unknown };
}

/* ------------------------------------------------------------------ */
/* Agent type → display config                                         */
/* ------------------------------------------------------------------ */

const AGENT_CONFIG: Record<
	string,
	{ label: string; icon: typeof Activity; color: string }
> = {
	chat: {
		label: "AI 聊天",
		icon: MessageSquare,
		color: "text-blue-500",
	},
	intent: {
		label: "意图识别",
		icon: BrainCircuit,
		color: "text-purple-500",
	},
	intent_gate: {
		label: "意图 Gate",
		icon: Zap,
		color: "text-amber-500",
	},
	memory_compress: {
		label: "记忆压缩",
		icon: Sparkles,
		color: "text-emerald-500",
	},
	chat_title: {
		label: "标题生成",
		icon: MessageSquare,
		color: "text-sky-500",
	},
	calendar_plan: {
		label: "日历规划",
		icon: Clock,
		color: "text-violet-500",
	},
	search: {
		label: "搜索",
		icon: Search,
		color: "text-orange-500",
	},
};

function getAgentConfig(agentType: string) {
	return (
		AGENT_CONFIG[agentType] ?? {
			label: agentType,
			icon: Activity,
			color: "text-muted-foreground",
		}
	);
}

function formatElapsed(startedAt: number): string {
	const elapsed = Math.round((Date.now() / 1000 - startedAt) * 10) / 10;
	if (elapsed < 60) return `${elapsed.toFixed(1)}s`;
	return `${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

/* ------------------------------------------------------------------ */
/* Cancel helper                                                       */
/* ------------------------------------------------------------------ */

async function cancelActivity(activityId: string) {
	try {
		const base = getRuntimeBackendUrl();
		await fetch(`${base}/api/agents/${activityId}/cancel`, {
			method: "POST",
		});
	} catch {
		/* best-effort */
	}
}

/* ------------------------------------------------------------------ */
/* Step detail row                                                     */
/* ------------------------------------------------------------------ */

function StepRow({ step }: { step: ActivityStep }) {
	const typeLabel =
		step.type === "tool_call"
			? "🔧 工具调用"
			: step.type === "tool_result"
				? "📋 返回结果"
				: step.type === "model_response"
					? "🤖 模型输出"
					: step.type;

	return (
		<div className="flex gap-2 text-xs py-1 border-b border-border/30 last:border-0">
			<span className="shrink-0 text-muted-foreground/70 w-16 text-right">
				{typeLabel}
			</span>
			<div className="min-w-0 flex-1">
				{step.name && (
					<span className="font-medium text-foreground/80 mr-1">
						{step.name}
					</span>
				)}
				{step.content && (
					<span className="text-muted-foreground break-all line-clamp-3">
						{step.content}
					</span>
				)}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Activity Card                                                       */
/* ------------------------------------------------------------------ */

function ActivityCard({
	activity,
	isRunning,
}: { activity: AgentActivity; isRunning: boolean }) {
	const config = getAgentConfig(activity.agent_type);
	const Icon = config.icon;
	const [, setTick] = useState(0);
	const [expanded, setExpanded] = useState(false);
	const steps = activity.details?.steps ?? [];
	const hasSteps = steps.length > 0;

	useEffect(() => {
		if (!isRunning) return;
		const interval = setInterval(() => setTick((t) => t + 1), 500);
		return () => clearInterval(interval);
	}, [isRunning]);

	return (
		<div
			className={cn(
				"rounded-lg border transition-all duration-300",
				isRunning
					? "border-primary/30 bg-primary/5"
					: activity.status === "error"
						? "border-destructive/30 bg-destructive/5 opacity-70"
						: activity.status === "cancelled"
							? "border-amber-500/30 bg-amber-500/5 opacity-70"
							: "border-border bg-card opacity-60",
			)}
		>
			{/* Header */}
			<div className="p-3">
				<div className="flex items-center gap-2">
					<div className={cn("shrink-0", config.color)}>
						<Icon className="h-4 w-4" />
					</div>
					<span className="text-sm font-medium truncate flex-1">
						{config.label}
					</span>

					{/* Expand toggle */}
					{hasSteps && (
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
							title={expanded ? "收起详情" : "展开详情"}
						>
							{expanded ? (
								<ChevronDown className="h-3.5 w-3.5" />
							) : (
								<ChevronRight className="h-3.5 w-3.5" />
							)}
						</button>
					)}

					{/* Cancel button */}
					{isRunning && (
						<button
							type="button"
							onClick={() => cancelActivity(activity.id)}
							className="p-0.5 rounded hover:bg-destructive/10 transition-colors text-destructive/70 hover:text-destructive"
							title="中断"
						>
							<StopCircle className="h-3.5 w-3.5" />
						</button>
					)}

					{isRunning && (
						<span className="flex items-center gap-1 text-xs text-primary">
							<span className="relative flex h-2 w-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
								<span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
							</span>
							{formatElapsed(activity.started_at)}
						</span>
					)}
					{!isRunning && activity.duration_ms != null && (
						<span className="text-xs text-muted-foreground">
							{formatDuration(activity.duration_ms)}
						</span>
					)}
					{activity.status === "error" && (
						<span className="text-xs text-destructive font-medium">
							失败
						</span>
					)}
					{activity.status === "cancelled" && (
						<span className="text-xs text-amber-500 font-medium">
							已中断
						</span>
					)}
					{activity.status === "completed" && !isRunning && (
						<span className="text-xs text-emerald-500">完成</span>
					)}
				</div>
				{activity.task && (
					<p className="mt-1.5 text-xs text-muted-foreground truncate pl-6">
						{activity.task}
					</p>
				)}
				{activity.model && (
					<p className="mt-0.5 text-xs text-muted-foreground/60 pl-6">
						模型: {activity.model}
					</p>
				)}
			</div>

			{/* Expandable steps detail */}
			{expanded && hasSteps && (
				<div className="border-t border-border/40 px-3 py-2 bg-muted/30 max-h-60 overflow-y-auto">
					<p className="text-[10px] text-muted-foreground/50 mb-1 uppercase tracking-wider">
						执行步骤 ({steps.length})
					</p>
					{steps.map((step, idx) => (
						<StepRow key={`${step.ts}-${idx}`} step={step} />
					))}
				</div>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

const MAX_HISTORY = 50;

export function AgentMonitorPanel() {
	const t = useTranslations("page");
	const [running, setRunning] = useState<AgentActivity[]>([]);
	const [history, setHistory] = useState<AgentActivity[]>([]);
	const [connected, setConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) return;

		const base = getRuntimeBackendUrl().replace(/^http/, "ws");
		const ws = new WebSocket(`${base}/api/agents/stream`);
		wsRef.current = ws;

		ws.onopen = () => setConnected(true);

		ws.onmessage = (evt) => {
			try {
				const data: ActivityEvent = JSON.parse(evt.data);

				if (data.event === "snapshot") {
					setRunning(data.activities ?? []);
					return;
				}

				if (data.event === "start") {
					const act = data as unknown as AgentActivity;
					if (!act.details) act.details = { steps: [] };
					if (!act.details.steps) act.details.steps = [];
					setRunning((prev) => [...prev, act]);
					return;
				}

				if (data.event === "update") {
					setRunning((prev) =>
						prev.map((a) => {
							if (a.id !== data.id) return a;
							const updated = {
								...a,
								...data,
								status:
									(data.status as AgentActivity["status"]) ??
									a.status,
							};
							if (data.details?.steps) {
								updated.details = {
									...a.details,
									...data.details,
								};
							}
							return updated;
						}),
					);
					return;
				}

				if (data.event === "step" && data.id && data.step) {
					setRunning((prev) =>
						prev.map((a) => {
							if (a.id !== data.id) return a;
							const steps = [...(a.details?.steps ?? []), data.step!];
							return {
								...a,
								details: { ...a.details, steps },
							};
						}),
					);
					return;
				}

				if (data.event === "stop") {
					setRunning((prev) => {
						const existing = prev.find((a) => a.id === data.id);
						const stopped: AgentActivity = {
							...(existing ?? {}),
							...(data as unknown as AgentActivity),
							details: {
								...(existing?.details ?? {}),
								...((data as unknown as AgentActivity).details ?? {}),
							},
						} as AgentActivity;
						if (!stopped.details) stopped.details = { steps: [] };
						setHistory((h) =>
							[stopped, ...h].slice(0, MAX_HISTORY),
						);
						return prev.filter((a) => a.id !== data.id);
					});
				}
			} catch {
				/* ignore */
			}
		};

		ws.onclose = () => {
			setConnected(false);
			reconnectTimer.current = setTimeout(connect, 3000);
		};

		ws.onerror = () => ws.close();
	}, []);

	useEffect(() => {
		connect();
		return () => {
			clearTimeout(reconnectTimer.current);
			wsRef.current?.close();
		};
	}, [connect]);

	return (
		<div className="flex h-full flex-col">
			<PanelHeader
				title={t("agentMonitorLabel")}
				icon={Activity}
				actions={
					<button
						type="button"
						onClick={connect}
						className="p-1 rounded hover:bg-muted transition-colors"
						title="重连"
					>
						<RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
					</button>
				}
			/>

			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				{/* Connection status */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span
						className={cn(
							"h-2 w-2 rounded-full",
							connected ? "bg-emerald-500" : "bg-destructive",
						)}
					/>
					{connected ? "已连接" : "断开连接"}
					{running.length > 0 && (
						<span className="ml-auto text-primary font-medium">
							{running.length} 个任务运行中
						</span>
					)}
				</div>

				{/* Running activities */}
				{running.length > 0 && (
					<div className="space-y-2">
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							运行中
						</h3>
						{running.map((act) => (
							<ActivityCard
								key={act.id}
								activity={act}
								isRunning
							/>
						))}
					</div>
				)}

				{/* Empty state */}
				{running.length === 0 && history.length === 0 && (
					<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
						<Clock className="h-8 w-8 mb-2 opacity-40" />
						<p className="text-sm">暂无 AI 任务活动</p>
						<p className="text-xs mt-1">
							当后台 AI 开始工作时，会在这里实时显示
						</p>
					</div>
				)}

				{/* History */}
				{history.length > 0 && (
					<div className="space-y-2">
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							最近完成
						</h3>
					{history.map((act, idx) => (
						<ActivityCard
							key={`${act.id}-done-${idx}`}
								activity={act}
								isRunning={false}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
