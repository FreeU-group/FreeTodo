"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
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
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-[#07C160]">
				<path
					d="M8.5 14.5C11.5376 14.5 14 12.2614 14 9.5C14 6.73858 11.5376 4.5 8.5 4.5C5.46243 4.5 3 6.73858 3 9.5C3 11.0028 3.7317 12.3503 4.88147 13.235L4.5 15L6.11853 14.235C6.8683 14.4072 7.66243 14.5 8.5 14.5Z"
					fill="currentColor"
				/>
				<path
					d="M15.5 19.5C18.5376 19.5 21 17.2614 21 14.5C21 11.7386 18.5376 9.5 15.5 9.5C12.4624 9.5 10 11.7386 10 14.5C10 16.0028 10.7317 17.3503 11.8815 18.235L11.5 20L13.1185 19.235C13.8683 19.4072 14.6624 19.5 15.5 19.5Z"
					fill="currentColor"
				/>
			</svg>
		),
		desc: "监测微信消息，识别邀约和待办",
		enabled: true,
	},
	{
		id: "browser",
		name: "Chrome 浏览器",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
				<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#4285F4"/>
				<path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" fill="#FFF"/>
				<path d="M12 8L16.33 15.5H21.5C20.1 19.4 16.4 22 12 22C10.7 22 9.5 21.7 8.4 21.2L12 15V8Z" fill="#34A853"/>
				<path d="M12 8L7.67 15.5H2.5C3.9 11.6 7.6 9 12 9V8Z" fill="#FBBC05"/>
				<path d="M12 8H21.5C21.8 9 22 10 22 11C22 11.3 22 11.7 21.9 12H16L12 8Z" fill="#EA4335"/>
				<path d="M12 8L8.4 14.2L2.5 11C3.6 6.4 7.4 3 12 3C13.5 3 14.9 3.4 16.1 4L12 11V8Z" fill="#EA4335"/>
			</svg>
		),
		desc: "感知浏览内容，辅助信息检索",
		enabled: false,
	},
	{
		id: "calendar",
		name: "系统日历",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-blue-400">
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
				<line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
				<line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
				<line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
				<rect x="7" y="14" width="3" height="3" fill="currentColor" rx="0.5"/>
			</svg>
		),
		desc: "读取日程安排，检测冲突",
		enabled: false,
	},
	{
		id: "files",
		name: "文件管理器",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-yellow-500">
				<path d="M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9.33333L11.3333 5H20C21.1046 5 22 5.89543 22 7V19Z" fill="currentColor"/>
			</svg>
		),
		desc: "监测文件变动，辅助文件检索",
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
