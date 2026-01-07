"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AchievementsPanel } from "@/apps/achievements/AchievementsPanel";
import { ActivityPanel } from "@/apps/activity/ActivityPanel";
import { CalendarPanel } from "@/apps/calendar/CalendarPanel";
import { ChatPanel } from "@/apps/chat/ChatPanel";
import { CostTrackingPanel } from "@/apps/cost-tracking";
import { SettingsPanel } from "@/apps/settings";
import { TodoDetail } from "@/apps/todo-detail";
import { TodoList } from "@/apps/todo-list";
import { PanelPositionProvider } from "@/components/common/layout/PanelHeader";
import type { PanelFeature } from "@/lib/config/panel-config";
import {
	ALL_PANEL_FEATURES,
	FEATURE_ICON_MAP,
} from "@/lib/config/panel-config";
import { cn } from "@/lib/utils";
import { PanelSelectorMenu } from "./PanelSelectorMenu";

// 可选导入 VoiceModulePanel（如果 voice module 不存在也不会报错）
let VoiceModulePanel: React.ComponentType | null = null;
try {
	// 使用动态导入，如果模块不存在会抛出错误
	const voiceModule = require("@/apps/voice-module/VoiceModulePanel");
	VoiceModulePanel = voiceModule.VoiceModulePanel;
} catch (_error) {
	// voice module 不存在，VoiceModulePanel 保持为 null
	console.log(
		"[PanelContent] VoiceModulePanel 不可用，将使用占位符",
	);
}

// 功能到翻译键的映射 - 完全照搬 BottomDock
const FEATURE_LABEL_MAP: Partial<Record<PanelFeature, string>> = {
	calendar: "calendar",
	activity: "activity",
	todos: "todos",
	chat: "chat",
	todoDetail: "todoDetail",
	diary: "diary",
	settings: "settings",
	costTracking: "costTracking",
	achievements: "achievements",
	voiceModule: "voiceModule",
	debugShots: "debugShots",
};

function getFeatureLabelKey(feature: PanelFeature): string {
	return FEATURE_LABEL_MAP[feature] ?? "todos";
}

interface PanelContentProps {
	onClose?: () => void;
}

// Dock 高度相关常量 - 完全照搬 BottomDock
const DOCK_TRIGGER_ZONE = 80; // 触发展开的底部区域高度
const HIDE_DELAY_MS = 1000; // 鼠标离开触发区域后收起的延迟时间
const DOCK_BOTTOM_OFFSET = 12; // bottom-1 = 4px，但实际是 12px

// 动画配置 - 完全照搬 BottomDock
const DOCK_ANIMATION_CONFIG = {
	spring: {
		type: "spring" as const,
		stiffness: 350,
		damping: 30,
		mass: 0.8,
	},
};

export const PanelContent: React.FC<PanelContentProps> = () => {
	const t = useTranslations("bottomDock");
	const [currentFeature, setCurrentFeature] = useState<PanelFeature>("chat");
	const [isExpanded, setIsExpanded] = useState(true);
	const [mounted, setMounted] = useState(false);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dockRef = useRef<HTMLDivElement | null>(null);
	const [dockHeight, setDockHeight] = useState(52);
	const buttonRef = useRef<HTMLButtonElement | null>(null);

	const [menuState, setMenuState] = useState<{
		isOpen: boolean;
		anchorElement: HTMLElement | null;
	}>({
		isOpen: false,
		anchorElement: null,
	});

	useEffect(() => {
		setMounted(true);
	}, []);

	// 测量 dock 实际高度
	useEffect(() => {
		if (dockRef.current) {
			const height = dockRef.current.offsetHeight;
			if (height > 0) {
				setDockHeight(height);
			}
		}
	}, []);

	// 全局鼠标位置监听 - 完全照搬 BottomDock
	useEffect(() => {
		if (!mounted) return;

		const handleMouseMove = (e: MouseEvent) => {
			// 如果右键菜单打开，保持 dock 展开
			if (menuState.isOpen) {
				if (hideTimeoutRef.current) {
					clearTimeout(hideTimeoutRef.current);
					hideTimeoutRef.current = null;
				}
				setIsExpanded(true);
				return;
			}

			const windowHeight = window.innerHeight;
			const mouseY = e.clientY;
			const distanceFromBottom = windowHeight - mouseY;

			// 鼠标在底部触发区域内
			if (distanceFromBottom <= DOCK_TRIGGER_ZONE) {
				if (hideTimeoutRef.current) {
					clearTimeout(hideTimeoutRef.current);
					hideTimeoutRef.current = null;
				}
				setIsExpanded(true);
			} else {
				// 鼠标离开触发区域，启动延迟收起
				if (!hideTimeoutRef.current) {
					hideTimeoutRef.current = setTimeout(() => {
						setIsExpanded(false);
						hideTimeoutRef.current = null;
					}, HIDE_DELAY_MS);
				}
			}
		};

		window.addEventListener("mousemove", handleMouseMove);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
		};
	}, [mounted, menuState.isOpen]);

	// 计算收起时的 translateY 值
	const hiddenTranslateY = dockHeight + DOCK_BOTTOM_OFFSET;

	// 渲染当前功能对应的组件
	const renderFeatureContent = () => {
		const content = (() => {
			switch (currentFeature) {
				case "chat":
					return <ChatPanel />;
				case "voiceModule":
					// 如果 VoiceModulePanel 不可用，显示占位符
					if (VoiceModulePanel) {
						return <VoiceModulePanel />;
					}
					return (
						<div className="flex items-center justify-center h-full text-muted-foreground">
							<div className="text-center">
								<p className="text-sm">语音模块不可用</p>
								<p className="text-xs mt-2 opacity-70">
									请确保已安装并启用语音模块
								</p>
							</div>
						</div>
					);
				case "todos":
					return <TodoList />;
				case "calendar":
					return <CalendarPanel />;
				case "activity":
					return <ActivityPanel />;
				case "todoDetail":
					return <TodoDetail />;
				case "settings":
					return <SettingsPanel />;
				case "achievements":
					return <AchievementsPanel />;
				case "costTracking":
					return <CostTrackingPanel />;
				default:
					return <ChatPanel />;
			}
		})();

		return (
			<PanelPositionProvider position="panelA">{content}</PanelPositionProvider>
		);
	};

	const Icon = FEATURE_ICON_MAP[currentFeature];

	// 避免 Hydration 错误：服务器端和客户端返回相同结构
	if (!mounted) {
		return (
			<div className="flex h-full w-full flex-col bg-[oklch(var(--background))] relative">
				<div className="flex-1 overflow-hidden relative z-10 bg-[oklch(var(--background))]" />
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col bg-[oklch(var(--background))] relative">
			{/* 内容区域 */}
			<div className="flex-1 overflow-hidden relative z-10 bg-[oklch(var(--background))]">
				<motion.div
					key={currentFeature}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -10 }}
					transition={{ duration: 0.2 }}
					className="h-full w-full"
				>
					{renderFeatureContent()}
				</motion.div>
			</div>

			{/* 底部 Dock - 完全照搬 BottomDock 的实现 */}
			<motion.div
				className="pointer-events-auto fixed bottom-1 left-1/2 z-50"
				initial={false}
				animate={{
					x: "-50%",
					y: isExpanded ? 0 : hiddenTranslateY,
				}}
				transition={DOCK_ANIMATION_CONFIG.spring}
			>
				<div
					ref={dockRef}
					className={cn(
						"flex items-center gap-2",
						"bg-[oklch(var(--card))]/80 dark:bg-background",
						"backdrop-blur-md",
						"border border-[oklch(var(--border))]",
						"shadow-lg",
						"px-2 py-1.5",
						"rounded-xl",
					)}
				>
					{/* 功能切换按钮 - 完全照搬 BottomDock 的按钮样式 */}
					<button
						ref={buttonRef}
						type="button"
						onClick={() => {
							const currentIndex = ALL_PANEL_FEATURES.indexOf(currentFeature);
							const nextIndex = (currentIndex + 1) % ALL_PANEL_FEATURES.length;
							setCurrentFeature(ALL_PANEL_FEATURES[nextIndex]);
						}}
						onContextMenu={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setMenuState({
								isOpen: true,
								anchorElement: buttonRef.current,
							});
						}}
						className={cn(
							"relative flex items-center gap-2",
							"px-3 py-2 rounded-lg",
							"transition-all duration-200",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] focus-visible:ring-offset-2",
							"bg-[oklch(var(--primary-weak))] dark:bg-[oklch(var(--primary-weak-hover))] text-[oklch(var(--primary))] dark:text-[oklch(var(--primary-foreground))] shadow-[0_0_0_1px_oklch(var(--primary))] hover:bg-[oklch(var(--primary-weak-hover))] dark:hover:bg-[oklch(var(--primary-weak))]",
						)}
						aria-label={t(getFeatureLabelKey(currentFeature))}
						aria-pressed={true}
					>
						<Icon
							className={cn(
								"h-5 w-5",
								"text-[oklch(var(--primary))] dark:text-[oklch(var(--primary-foreground))]",
							)}
						/>
						<span
							className={cn(
								"text-sm font-medium",
								"text-[oklch(var(--primary))] dark:text-[oklch(var(--primary-foreground))]",
							)}
						>
							{t(getFeatureLabelKey(currentFeature))}
						</span>
						<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-[oklch(var(--primary))] dark:bg-[oklch(var(--primary-foreground))]" />
					</button>
				</div>
			</motion.div>

			{/* 右键菜单 - 选择功能 - 使用 ALL_PANEL_FEATURES 而不是 getAvailableFeatures */}
			<PanelSelectorMenu
				isOpen={menuState.isOpen}
				onClose={() => setMenuState({ isOpen: false, anchorElement: null })}
				onSelect={(feature) => {
					setCurrentFeature(feature);
					setMenuState({ isOpen: false, anchorElement: null });
				}}
				anchorElement={menuState.anchorElement}
			/>
		</div>
	);
};
