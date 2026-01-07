"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig, useSaveConfig } from "@/lib/query";
import { ContextMenu } from "./ContextMenu";
import { FloatContent } from "./FloatContent";
import { IslandMode } from "./types";

interface DynamicIslandProps {
	mode: IslandMode;
	onModeChange?: (mode: IslandMode) => void;
	onClose?: () => void;
}

type ElectronAPI = typeof window & {
	electronAPI?: {
		collapseWindow?: () => Promise<void> | void;
		expandWindow?: () => Promise<void> | void;
		expandWindowFull?: () => Promise<void> | void;
		setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => void;
		resizeWindow?: (dx: number, dy: number, pos: string) => void;
		quit?: () => void;
	};
	require?: (module: string) => { ipcRenderer?: { send: (...args: unknown[]) => void } };
};

function getElectronAPI(): ElectronAPI {
	return window as ElectronAPI;
}

export function DynamicIsland({
	mode,
	onModeChange,
	onClose,
}: DynamicIslandProps) {
	const [isHovered, setIsHovered] = useState(false);
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
	const islandRef = useRef<HTMLDivElement>(null);

	const { theme, systemTheme } = useTheme();
	const currentTheme = theme === "system" ? systemTheme : theme;
	const isDark = currentTheme === "dark";

	const { data: config } = useConfig();
	const saveConfigMutation = useSaveConfig();
	const recorderEnabled = config?.jobsRecorderEnabled ?? false;

	const layoutState = useMemo(() => {
		const margin = 32;
		if (mode === IslandMode.FLOAT) {
			const base = isHovered
				? { width: 140, height: 48, borderRadius: 24 }
				: { width: 36, height: 36, borderRadius: 18 };
			return { ...base, right: margin, bottom: margin };
		}
		if (mode === IslandMode.PANEL) {
			return { width: "100%", height: "100%", borderRadius: 12, inset: 0 };
		}
		return { width: "100vw", height: "100vh", borderRadius: 12, inset: 0 };
	}, [isHovered, mode]);

	const setIgnoreMouse = useCallback((ignore: boolean) => {
		const api = getElectronAPI();
		try {
			if (api.require) {
				const { ipcRenderer } = api.require("electron") ?? {};
				ipcRenderer?.send("set-ignore-mouse-events", ignore, ignore ? { forward: true } : {});
			} else {
				api.electronAPI?.setIgnoreMouseEvents?.(ignore, ignore ? { forward: true } : undefined);
			}
		} catch (error) {
			console.error("[DynamicIsland] setIgnoreMouse failed", error);
		}
	}, []);

	useEffect(() => {
		if (mode === IslandMode.FLOAT) {
			setTimeout(() => setIgnoreMouse(true), 120);
		} else {
			setIgnoreMouse(false);
		}
	}, [mode, setIgnoreMouse]);

	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			if (e.key === "1") {
				const api = getElectronAPI();
				await api.electronAPI?.collapseWindow?.();
				setTimeout(() => api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true }), 120);
				onModeChange?.(IslandMode.FLOAT);
			} else if (e.key === "4") {
				const api = getElectronAPI();
				await api.electronAPI?.expandWindow?.();
				onModeChange?.(IslandMode.PANEL);
			} else if (e.key === "5") {
				const api = getElectronAPI();
				await api.electronAPI?.expandWindowFull?.();
				onModeChange?.(IslandMode.FULLSCREEN);
			} else if (e.key === "Escape") {
				if (mode === IslandMode.FULLSCREEN || mode === IslandMode.PANEL) {
					const api = getElectronAPI();
					await api.electronAPI?.collapseWindow?.();
					setTimeout(() => api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true }), 120);
					onModeChange?.(IslandMode.FLOAT);
					onClose?.();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [mode, onClose, onModeChange]);

	const handleToggleScreenshot = useCallback(async () => {
		try {
			await saveConfigMutation.mutateAsync({
				data: { jobsRecorderEnabled: !recorderEnabled },
			});
		} catch (error) {
			console.error("[DynamicIsland] toggle screenshot failed", error);
		}
	}, [recorderEnabled, saveConfigMutation]);

	const handleOpenContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (mode !== IslandMode.FLOAT) return;
			event.preventDefault();
			setContextMenuPosition({ x: event.clientX, y: event.clientY - 8 });
			setContextMenuOpen(true);
		},
		[mode],
	);

	const handleCloseContextMenu = useCallback(() => {
		setContextMenuOpen(false);
	}, []);

	const handleOpenPanel = useCallback(async () => {
		const api = getElectronAPI();
		await api.electronAPI?.expandWindow?.();
		onModeChange?.(IslandMode.PANEL);
	}, [onModeChange]);

	if (mode === IslandMode.FULLSCREEN) {
		return (
			<>
				<AnimatePresence>
					<motion.div
						initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
						animate={{ opacity: 1, scale: 1, rotate: 0 }}
						exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
						className="fixed inset-x-0 top-0 z-[70] pointer-events-none"
					>
						<div
							className="flex items-center justify-end px-4 h-15"
							style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
						>
							<div
								className="flex items-center gap-1.5 rounded-xl bg-background/80 dark:bg-background/80 backdrop-blur-xl border border-[oklch(var(--border))]/40 shadow-sm px-2 py-1 text-[oklch(var(--foreground))]/60 pointer-events-auto mr-6"
								style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
							>
								<button
									type="button"
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
									title="退出全屏"
									onClick={async (e) => {
										e.stopPropagation();
										const api = getElectronAPI();
										await api.electronAPI?.expandWindow?.();
										api.electronAPI?.setIgnoreMouseEvents?.(false);
										onModeChange?.(IslandMode.PANEL);
									}}
								>
									<Minimize2 size={15} />
								</button>
								<button
									type="button"
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
									title="折叠到灵动岛"
									onClick={async (e) => {
										e.stopPropagation();
										const api = getElectronAPI();
										await api.electronAPI?.collapseWindow?.();
										api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
										onModeChange?.(IslandMode.FLOAT);
										onClose?.();
									}}
								>
									<ChevronsUpDown size={15} />
								</button>
							</div>
						</div>
					</motion.div>
				</AnimatePresence>
			</>
		);
	}

	if (mode === IslandMode.PANEL) {
		return (
			<div className="fixed inset-0 z-[40] pointer-events-none overflow-hidden">
				<motion.div
					layout
					initial={false}
					animate={layoutState}
					transition={{
						type: "spring",
						stiffness: 320,
						damping: 26,
						mass: 0.7,
						restDelta: 0.001,
					}}
					className="absolute pointer-events-auto origin-bottom-right bg-background shadow-2xl border-2 border-[oklch(var(--border))]/80 overflow-hidden"
					style={{ borderRadius: "12px", clipPath: "inset(0 round 12px)" } as React.CSSProperties}
				>
					<div className="flex flex-col w-full h-full text-[oklch(var(--foreground))]">
						<div
							className="h-8 px-4 flex items-center justify-between bg-background/95"
							style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
						>
							<div className="text-xs text-[oklch(var(--foreground))]/70 select-none">
								Dynamic Island · 面板模式
							</div>
							<div
								className="flex items-center gap-1.5 text-[oklch(var(--foreground))]/60"
								style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
							>
								<button
									type="button"
									className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
									title="展开为全屏"
									onClick={async (e) => {
										e.stopPropagation();
										const api = getElectronAPI();
										await api.electronAPI?.expandWindowFull?.();
										onModeChange?.(IslandMode.FULLSCREEN);
									}}
								>
									<Maximize2 size={14} />
								</button>
								<button
									type="button"
									className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
									title="折叠到灵动岛"
									onClick={async (e) => {
										e.stopPropagation();
										const api = getElectronAPI();
										await api.electronAPI?.collapseWindow?.();
										api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
										onModeChange?.(IslandMode.FLOAT);
										onClose?.();
									}}
								>
									<ChevronsUpDown size={14} />
								</button>
							</div>
						</div>
						<div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-muted-foreground">
							<div className="rounded-lg border border-dashed border-[oklch(var(--border))]/60 p-4 bg-background/70">
								<div className="font-medium text-foreground mb-1">灵动岛 Panel 占位</div>
								<div className="text-xs text-muted-foreground">
									后续可在此嵌入语音、任务或通知面板内容。
								</div>
							</div>
						</div>
					</div>
				</motion.div>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden">
			<motion.div
				ref={islandRef}
				layout
				initial={false}
				animate={layoutState}
				onMouseEnter={() => {
					setIsHovered(true);
					setIgnoreMouse(false);
				}}
				onMouseLeave={() => {
					setIsHovered(false);
					setIgnoreMouse(true);
				}}
				onContextMenu={handleOpenContextMenu}
				transition={{
					type: "spring",
					stiffness: 350,
					damping: 30,
					mass: 0.8,
					restDelta: 0.001,
				}}
				className="absolute cursor-default overflow-hidden pointer-events-auto"
				style={
					{
						boxShadow: isDark
							? "0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)"
							: "0px 20px 50px -10px rgba(0, 0, 0, 0.15), 0px 10px 20px -10px rgba(0,0,0,0.1)",
						borderRadius: layoutState.borderRadius ? `${layoutState.borderRadius}px` : undefined,
						userSelect: "none",
						backgroundColor: isDark ? "#0a0a0a" : "oklch(var(--primary-foreground))",
					} as React.CSSProperties
				}
			>
				<div
					className="absolute inset-0 backdrop-blur-[80px] transition-colors duration-700 ease-out"
					style={{
						backgroundColor: isDark ? "rgba(8, 8, 8, 0.9)" : "oklch(var(--primary-foreground))",
					}}
				/>
				<div
					className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500"
					style={{
						border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
						boxShadow: isDark
							? "inset 0 0 20px rgba(255,255,255,0.03)"
							: "inset 0 0 20px rgba(0,0,0,0.02)",
					}}
				/>

				<div
					className="absolute inset-0 w-full h-full font-sans antialiased overflow-hidden text-[oklch(var(--foreground))]"
					onContextMenu={handleOpenContextMenu}
				>
					<FloatContent
						onToggleRecording={() => {
							console.log("[DynamicIsland] toggle recording (placeholder)");
						}}
						onStopRecording={() => {
							console.log("[DynamicIsland] stop recording (placeholder)");
						}}
						onScreenshot={handleToggleScreenshot}
						screenshotEnabled={recorderEnabled}
						isCollapsed={!isHovered}
						onOpenPanel={handleOpenPanel}
					/>
				</div>
			</motion.div>

			<ContextMenu
				open={contextMenuOpen}
				position={contextMenuPosition}
				onClose={handleCloseContextMenu}
				onQuit={() => {
					const api = getElectronAPI();
					api.electronAPI?.quit?.();
				}}
			/>
		</div>
	);
}


