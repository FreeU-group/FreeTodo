"use client";

import { useState } from "react";
import {
	MessageCircle,
	Globe,
	CalendarDays,
	FolderOpen,
	ShieldCheck,
} from "lucide-react";
import { useSetupStore } from "@/lib/store/setup-store";
import { useCompleteSetup } from "@/lib/query/setup";

interface PermissionsStepProps {
	onComplete: () => void;
	onBack: () => void;
}

const INITIAL_APPS = [
	{
		id: "wechat",
		name: "微信",
		icon: <MessageCircle className="h-6 w-6 text-[#07C160]" strokeWidth={2} />,
		desc: "关注微信消息，识别邀约和待办",
		enabled: true,
	},
	{
		id: "browser",
		name: "Chrome 浏览器",
		icon: <Globe className="h-6 w-6 text-blue-400" strokeWidth={2} />,
		desc: "感知浏览内容，辅助信息检索",
		enabled: false,
	},
	{
		id: "calendar",
		name: "系统日历",
		icon: <CalendarDays className="h-6 w-6 text-red-400" strokeWidth={2} />,
		desc: "读取日程安排，检测冲突",
		enabled: false,
	},
	{
		id: "files",
		name: "文件管理器",
		icon: <FolderOpen className="h-6 w-6 text-yellow-500" strokeWidth={2} />,
		desc: "关注文件变动，辅助文件检索",
		enabled: false,
	},
];

export function PermissionsStep({ onComplete, onBack }: PermissionsStepProps) {
	const { userName, agentName, scanDirectory } = useSetupStore();
	const completeMutation = useCompleteSetup();
	const [apps, setApps] = useState(INITIAL_APPS);

	const toggleApp = (id: string) => {
		setApps((prev) =>
			prev.map((app) =>
				app.id === id ? { ...app, enabled: !app.enabled } : app,
			),
		);
	};

	const handleComplete = async () => {
		const allowedApps = apps.filter((a) => a.enabled).map((a) => a.name);
		await completeMutation.mutateAsync({
			userName,
			agentName: agentName || "Free U",
			scanDirectories: scanDirectory ? [scanDirectory] : [],
			allowedApps,
		});
		onComplete();
	};

	return (
		<div className="flex w-full max-w-md flex-col gap-5">
			<div className="text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
						<ShieldCheck className="h-6 w-6" />
					</div>
				</div>
				<h2 className="text-xl font-bold text-white">屏幕感知权限</h2>
				<p className="mt-1 text-sm text-white/60">
					Agent 将通过截屏感知以下应用，帮助你自动识别信息
				</p>
			</div>

			<div className="space-y-2">
				{apps.map((app) => (
					<button
						key={app.id}
						type="button"
						onClick={() => toggleApp(app.id)}
						className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
							app.enabled
								? "border-primary/30 bg-primary/5"
								: "border-white/5 bg-white/[0.02] opacity-60 hover:opacity-100 hover:bg-white/[0.04]"
						}`}
					>
						<span className="flex-shrink-0 drop-shadow-sm">{app.icon}</span>
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<span className="text-sm font-medium text-white">
									{app.name}
								</span>
							</div>
							<p className="text-xs text-white/40">{app.desc}</p>
						</div>
						<div
							className={`h-5 w-9 rounded-full transition-colors ${
								app.enabled ? "bg-primary" : "bg-white/10"
							}`}
						>
							<div
								className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
									app.enabled ? "translate-x-4" : "translate-x-0"
								}`}
							/>
						</div>
					</button>
				))}
			</div>

			<p className="text-center text-xs text-white/30">
				这些权限之后可以在设置中随时调整
			</p>

			<div className="flex gap-3">
				<button
					type="button"
					onClick={onBack}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
				>
					上一步
				</button>
				<button
					type="button"
					onClick={handleComplete}
					disabled={completeMutation.isPending}
					className="flex-1 rounded-lg bg-gradient-to-r from-primary to-primary/80 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-40"
				>
					{completeMutation.isPending ? "正在完成…" : "🎉 开始使用"}
				</button>
			</div>
		</div>
	);
}
