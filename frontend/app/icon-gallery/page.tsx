"use client";

import { MessageCircle, Globe, CalendarDays, FolderOpen, ShieldCheck } from "lucide-react";

// --- Icon Set 1: Lucide Line Icons (极简线框) ---
const LucideSet = [
	{
		id: "wechat",
		name: "微信",
		desc: "关注微信消息，识别邀约和待办",
		icon: <MessageCircle className="h-6 w-6 text-[#07C160]" strokeWidth={2} />,
	},
	{
		id: "browser",
		name: "Chrome 浏览器",
		desc: "感知浏览内容，辅助信息检索",
		icon: <Globe className="h-6 w-6 text-blue-400" strokeWidth={2} />,
	},
	{
		id: "calendar",
		name: "系统日历",
		desc: "读取日程安排，检测冲突",
		icon: <CalendarDays className="h-6 w-6 text-red-400" strokeWidth={2} />,
	},
	{
		id: "files",
		name: "文件管理器",
		desc: "监测文件变动，辅助文件检索",
		icon: <FolderOpen className="h-6 w-6 text-yellow-500" strokeWidth={2} />,
	},
];

// --- Icon Set 2: Modern Duotone (现代双色) ---
const DuotoneSet = [
	{
		id: "wechat",
		name: "微信",
		desc: "关注微信消息，识别邀约和待办",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-[#07C160]">
				<path d="M8.5 14.5C11.5376 14.5 14 12.2614 14 9.5C14 6.73858 11.5376 4.5 8.5 4.5C5.46243 4.5 3 6.73858 3 9.5C3 11.0028 3.7317 12.3503 4.88147 13.235L4.5 15L6.11853 14.235C6.8683 14.4072 7.66243 14.5 8.5 14.5Z" fill="currentColor" opacity="0.3" />
				<path d="M15.5 19.5C18.5376 19.5 21 17.2614 21 14.5C21 11.7386 18.5376 9.5 15.5 9.5C12.4624 9.5 10 11.7386 10 14.5C10 16.0028 10.7317 17.3503 11.8815 18.235L11.5 20L13.1185 19.235C13.8683 19.4072 14.6624 19.5 15.5 19.5Z" fill="currentColor" />
			</svg>
		),
	},
	{
		id: "browser",
		name: "Chrome 浏览器",
		desc: "感知浏览内容，辅助信息检索",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-blue-500">
				<circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
				<circle cx="12" cy="12" r="4" fill="currentColor" />
				<path d="M12 8C14.2091 8 16 9.79086 16 12H22C22 6.47715 17.5228 2 12 2V8Z" fill="currentColor" opacity="0.6" />
			</svg>
		),
	},
	{
		id: "calendar",
		name: "系统日历",
		desc: "读取日程安排，检测冲突",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-red-500">
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="currentColor" opacity="0.2" />
				<path d="M3 10H21V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V10Z" fill="currentColor" opacity="0.4" />
				<rect x="7" y="14" width="4" height="4" rx="1" fill="currentColor" />
				<path d="M16 2V6M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			</svg>
		),
	},
	{
		id: "files",
		name: "文件管理器",
		desc: "监测文件变动，辅助文件检索",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-yellow-500">
				<path d="M4 3H9.33333L11.3333 5H20C21.1046 5 22 5.89543 22 7V10H2V5C2 3.89543 2.89543 3 4 3Z" fill="currentColor" opacity="0.4" />
				<path d="M22 10V19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V10H22Z" fill="currentColor" />
			</svg>
		),
	},
];

// --- Icon Set 3: Apple/macOS Style (拟物微渐变) ---
const MacStyleSet = [
	{
		id: "wechat",
		name: "微信",
		desc: "关注微信消息，识别邀约和待办",
		icon: (
			<svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
				<defs>
					<linearGradient id="wx_grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
						<stop stopColor="#22D369" />
						<stop offset="1" stopColor="#05B34A" />
					</linearGradient>
					<filter id="wx_shadow" x="-2" y="-2" width="36" height="36" filterUnits="userSpaceOnUse">
						<feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#05B34A" floodOpacity="0.3" />
					</filter>
				</defs>
				<path d="M11.5 20.5C15.6421 20.5 19 17.5899 19 14C19 10.4101 15.6421 7.5 11.5 7.5C7.35786 7.5 4 10.4101 4 14C4 15.9082 4.93922 17.6253 6.4258 18.7846L5.5 21.5L8.5 20.25C9.44497 20.4137 10.4532 20.5 11.5 20.5Z" fill="url(#wx_grad)" filter="url(#wx_shadow)" />
				<path d="M21 26C24.866 26 28 23.3137 28 20C28 16.6863 24.866 14 21 14C17.134 14 14 16.6863 14 20C14 21.7645 14.8727 23.352 16.2536 24.4235L15.5 27L18.25 25.8C19.1245 25.9312 20.0494 26 21 26Z" fill="#FFFFFF" filter="url(#wx_shadow)" />
			</svg>
		),
	},
	{
		id: "browser",
		name: "Chrome 浏览器",
		desc: "感知浏览内容，辅助信息检索",
		icon: (
			<svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
				<defs>
					<linearGradient id="chrome_grad" x1="0" y1="0" x2="32" y2="32">
						<stop stopColor="#4285F4" />
						<stop offset="1" stopColor="#3367D6" />
					</linearGradient>
					<filter id="chrome_shadow" x="-2" y="-2" width="36" height="36">
						<feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.15" />
					</filter>
				</defs>
				<circle cx="16" cy="16" r="14" fill="#FFFFFF" filter="url(#chrome_shadow)" />
				<path d="M16 10L21.5 19.5H30C28 25.5 22.5 30 16 30C12 30 8.5 28.5 6 26L16 10Z" fill="#34A853" />
				<path d="M16 10L10.5 19.5H2C4 13.5 9.5 9 16 9V10Z" fill="#FBBC05" />
				<path d="M16 10H27C24.5 5.5 19 2 16 2C13 2 10.5 3 8.5 4.5L16 10Z" fill="#EA4335" />
				<circle cx="16" cy="16" r="5.5" fill="#FFFFFF" />
				<circle cx="16" cy="16" r="4.5" fill="url(#chrome_grad)" />
			</svg>
		),
	},
	{
		id: "calendar",
		name: "系统日历",
		desc: "读取日程安排，检测冲突",
		icon: (
			<svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
				<defs>
					<linearGradient id="cal_grad" x1="16" y1="4" x2="16" y2="28">
						<stop stopColor="#FFFFFF" />
						<stop offset="1" stopColor="#F1F5F9" />
					</linearGradient>
					<filter id="cal_shadow" x="-2" y="-2" width="36" height="36">
						<feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.1" />
					</filter>
				</defs>
				<rect x="4" y="6" width="24" height="22" rx="4" fill="url(#cal_grad)" filter="url(#cal_shadow)" />
				<path d="M4 10C4 7.79086 5.79086 6 8 6H24C26.2091 6 28 7.79086 28 10V12H4V10Z" fill="#EF4444" />
				<rect x="9" y="16" width="4" height="4" rx="1" fill="#3B82F6" />
				<rect x="15" y="16" width="4" height="4" rx="1" fill="#94A3B8" />
				<rect x="21" y="16" width="4" height="4" rx="1" fill="#94A3B8" />
				<rect x="9" y="22" width="4" height="4" rx="1" fill="#94A3B8" />
				<rect x="15" y="22" width="4" height="4" rx="1" fill="#94A3B8" />
				<path d="M10 4V8M22 4V8" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
			</svg>
		),
	},
	{
		id: "files",
		name: "文件管理器",
		desc: "监测文件变动，辅助文件检索",
		icon: (
			<svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
				<defs>
					<linearGradient id="folder_back" x1="16" y1="4" x2="16" y2="28">
						<stop stopColor="#FBBF24" />
						<stop offset="1" stopColor="#D97706" />
					</linearGradient>
					<linearGradient id="folder_front" x1="16" y1="12" x2="16" y2="28">
						<stop stopColor="#FDE047" />
						<stop offset="1" stopColor="#F59E0B" />
					</linearGradient>
					<filter id="folder_shadow" x="-2" y="-2" width="36" height="36">
						<feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#D97706" floodOpacity="0.3" />
					</filter>
				</defs>
				<path d="M4 7C4 5.34315 5.34315 4 7 4H12.5L15.5 7H25C26.6569 7 28 8.34315 28 10V25C28 26.6569 26.6569 28 25 28H7C5.34315 28 4 26.6569 4 25V7Z" fill="url(#folder_back)" filter="url(#folder_shadow)" />
				<path d="M3 14C3 12.8954 3.89543 12 5 12H27C28.1046 12 29 12.8954 29 14V25C29 26.6569 27.6569 28 26 28H6C4.34315 28 3 26.6569 3 25V14Z" fill="url(#folder_front)" />
			</svg>
		),
	},
];

// --- Icon Set 4: Neon Glow (赛博发光) ---
const NeonSet = [
	{
		id: "wechat",
		name: "微信",
		desc: "关注微信消息，识别邀约和待办",
		icon: (
			<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#07C160]/10 shadow-[0_0_15px_rgba(7,193,96,0.3)] border border-[#07C160]/30">
				<MessageCircle className="h-4 w-4 text-[#07C160]" strokeWidth={2.5} />
			</div>
		),
	},
	{
		id: "browser",
		name: "Chrome 浏览器",
		desc: "感知浏览内容，辅助信息检索",
		icon: (
			<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-500/30">
				<Globe className="h-4 w-4 text-blue-400" strokeWidth={2.5} />
			</div>
		),
	},
	{
		id: "calendar",
		name: "系统日历",
		desc: "读取日程安排，检测冲突",
		icon: (
			<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-500/30">
				<CalendarDays className="h-4 w-4 text-red-400" strokeWidth={2.5} />
			</div>
		),
	},
	{
		id: "files",
		name: "文件管理器",
		desc: "监测文件变动，辅助文件检索",
		icon: (
			<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.3)] border border-yellow-500/30">
				<FolderOpen className="h-4 w-4 text-yellow-400" strokeWidth={2.5} />
			</div>
		),
	},
];

const SETS = [
	{ name: "方案 1：极简线框 (Lucide 原生)", apps: LucideSet },
	{ name: "方案 2：现代双色 (Duotone)", apps: DuotoneSet },
	{ name: "方案 3：苹果拟物风 (Mac Style)", apps: MacStyleSet },
	{ name: "方案 4：赛博发光 (Neon Glow)", apps: NeonSet },
];

export default function IconGalleryPage() {
	return (
		<div className="min-h-screen bg-neutral-950 p-10 text-white">
			<div className="mx-auto max-w-5xl">
				<h1 className="mb-8 text-3xl font-bold">图标风格画廊 (PermissionsStep 预览)</h1>
				<p className="mb-12 text-white/60">
					这里展示了 4 种不同的图标设计风格。它们被直接渲染在与引导页完全相同的卡片 UI 中，方便你对比选择。
				</p>

				<div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
					{SETS.map((set, idx) => (
						<div key={idx} className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
							<div className="text-center">
								<div className="mb-4 flex justify-center">
									<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
										<ShieldCheck className="h-6 w-6" />
									</div>
								</div>
								<h2 className="text-xl font-bold text-white">{set.name}</h2>
								<p className="mt-1 text-sm text-white/60">
									Agent 将通过截屏感知以下应用，帮助你自动识别信息
								</p>
							</div>

							<div className="space-y-2">
								{set.apps.map((app) => (
									<button
										key={app.id}
										type="button"
										className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left transition hover:bg-primary/10"
									>
										<span className="flex-shrink-0 drop-shadow-sm">{app.icon}</span>
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-white">{app.name}</span>
											</div>
											<p className="text-xs text-white/40">{app.desc}</p>
										</div>
										<div className="h-5 w-9 rounded-full bg-primary transition-colors">
											<div className="h-5 w-5 translate-x-4 rounded-full bg-white shadow transition-transform" />
										</div>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
