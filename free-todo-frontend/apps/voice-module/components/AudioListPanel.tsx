/**
 * 音频列表面板组件
 * 显示当前日期的所有音频文件列表
 */

import { ChevronDown, ChevronUp, MoreVertical, Music } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { AudioSegment } from "../types";

interface AudioListPanelProps {
	audioSegments: AudioSegment[];
	selectedAudioId?: string;
	onSelectAudio: (audio: AudioSegment) => void;
	onEditTitle?: (audioId: string) => void;
	onUpdateAudio?: (audioId: string, updates: Partial<AudioSegment>) => void;
	onDeleteAudio?: (audioId: string) => void;
	isLoading?: boolean; // 是否正在加载
}

export function AudioListPanel({
	audioSegments,
	selectedAudioId,
	onSelectAudio,
	onEditTitle,
	onUpdateAudio,
	onDeleteAudio,
	isLoading = false,
}: AudioListPanelProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const [contextMenu, setContextMenu] = useState<{
		audioId: string;
		x: number;
		y: number;
	} | null>(null);
	const contextMenuRef = useRef<HTMLDivElement>(null);
	const [editingAudioId, setEditingAudioId] = useState<string | null>(null);
	const [editTitleValue, setEditTitleValue] = useState<string>("");
	const editInputRef = useRef<HTMLInputElement>(null);

	// 格式化时间显示（确保使用本地时间）
	const formatTime = (date: Date): string => {
		// 确保日期对象有效
		if (!date || Number.isNaN(date.getTime())) {
			return "00:00";
		}
		// 使用本地时间（getHours 和 getMinutes 已经是本地时间）
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	// 格式化时长显示
	const formatDuration = (ms: number): string => {
		const seconds = Math.floor(ms / 1000);
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	// 格式化文件大小
	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	// 关闭右键菜单
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				contextMenuRef.current &&
				!contextMenuRef.current.contains(event.target as Node)
			) {
				setContextMenu(null);
			}
		};

		if (contextMenu) {
			document.addEventListener("mousedown", handleClickOutside);
			return () =>
				document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [contextMenu]);

	// 处理右键菜单
	const handleContextMenu = (e: React.MouseEvent, audio: AudioSegment) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			audioId: audio.id,
			x: e.clientX,
			y: e.clientY,
		});
	};

	// 处理编辑标题
	const handleEditTitle = () => {
		if (contextMenu) {
			const audio = audioSegments.find((a) => a.id === contextMenu.audioId);
			if (audio) {
				setEditingAudioId(contextMenu.audioId);
				setEditTitleValue(audio.title || "");
				setContextMenu(null);
			}
		}
	};

	// 处理删除音频
	const handleDeleteAudio = () => {
		if (contextMenu) {
			const audio = audioSegments.find((a) => a.id === contextMenu.audioId);
			if (
				audio &&
				window.confirm(
					`确定要删除音频 "${audio.title || audio.id}" 吗？此操作不可撤销。`,
				)
			) {
				onDeleteAudio?.(contextMenu.audioId);
				setContextMenu(null);
			}
		}
	};

	// 保存标题
	const handleSaveTitle = () => {
		if (editingAudioId) {
			onUpdateAudio?.(editingAudioId, {
				title: editTitleValue.trim() || undefined,
			});
			setEditingAudioId(null);
			setEditTitleValue("");
		}
	};

	// 取消编辑
	const handleCancelEdit = () => {
		setEditingAudioId(null);
		setEditTitleValue("");
	};

	// 当进入编辑模式时，聚焦输入框
	useEffect(() => {
		if (editingAudioId && editInputRef.current) {
			editInputRef.current.focus();
			editInputRef.current.select();
		}
	}, [editingAudioId]);

	// 即使没有音频也显示面板，显示空状态

	const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			setIsExpanded(!isExpanded);
		}
	};

	return (
		<div className="overflow-hidden">
			{/* 头部 - 与智能纪要保持一致 */}
			<div
				className="flex items-center justify-between px-0 py-3 cursor-pointer hover:opacity-80 transition-opacity"
				onClick={() => setIsExpanded(!isExpanded)}
				onKeyDown={handleHeaderKeyDown}
				role="button"
				tabIndex={0}
			>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1.5">
						<Music className="h-4 w-4 text-primary" />
						<span className="text-sm font-semibold">音频列表</span>
					</div>
				</div>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsExpanded(!isExpanded);
					}}
					className="p-1 rounded hover:bg-muted transition-colors"
					aria-label={isExpanded ? "收起" : "展开"}
				>
					{isExpanded ? (
						<ChevronUp className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					)}
				</button>
			</div>

			{/* 内容区域 */}
			{isExpanded && (
				<div className="pt-1 space-y-3 max-h-[400px] overflow-y-auto">
					{isLoading ? (
						<div className="flex items-center justify-center py-6">
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
								<span>加载中...</span>
							</div>
						</div>
					) : audioSegments.length === 0 ? (
						<div className="text-center py-6 text-sm text-muted-foreground">
							当天暂无音频文件
						</div>
					) : (
						<div className="space-y-2">
							{audioSegments.map((audio, index) => {
								const isSelected = selectedAudioId === audio.id;
								const isEditing = editingAudioId === audio.id;
								// 使用index作为fallback确保key唯一
								const uniqueKey = `${audio.id}_${index}`;

								const handleItemKeyDown = (e: React.KeyboardEvent) => {
									if (!isEditing && (e.key === "Enter" || e.key === " ")) {
										e.preventDefault();
										onSelectAudio(audio);
									}
								};

								const interactiveProps = !isEditing
									? {
											onClick: () => onSelectAudio(audio),
											onKeyDown: handleItemKeyDown,
											onContextMenu: (e: React.MouseEvent) => {
												handleContextMenu(e, audio);
											},
											role: "button" as const,
											tabIndex: 0,
										}
									: {};

								return (
									<div
										key={uniqueKey}
										className={cn(
											"group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors",
											isSelected && "bg-primary/5",
											!isEditing && "cursor-pointer",
										)}
										{...interactiveProps}
									>
										<div className="flex items-start gap-3">
											<div className="flex-shrink-0 mt-0.5">
												<div
													className={cn(
														"w-4 h-4 rounded border-2 flex items-center justify-center",
														isSelected
															? "border-primary bg-primary/10"
															: "border-muted-foreground/30 bg-muted/50",
													)}
												>
													<Music
														className={cn(
															"h-2.5 w-2.5",
															isSelected
																? "text-primary"
																: "text-muted-foreground",
														)}
													/>
												</div>
											</div>
											<div className="flex-1 min-w-0 space-y-1.5">
												{isEditing ? (
													<input
														ref={editInputRef}
														type="text"
														value={editTitleValue}
														onChange={(e) => setEditTitleValue(e.target.value)}
														onBlur={handleSaveTitle}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																handleSaveTitle();
															} else if (e.key === "Escape") {
																e.preventDefault();
																handleCancelEdit();
															}
														}}
														onClick={(e) => e.stopPropagation()}
														className="w-full px-2 py-1 text-sm bg-background border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
														placeholder="输入音频标题（如：xx会议）"
													/>
												) : (
													<>
														{audio.title ? (
															<div className="text-sm font-medium text-foreground">
																{audio.title}
															</div>
														) : null}
														<div className="text-xs font-mono text-muted-foreground">
															{formatTime(audio.startTime)}
															{isSelected && (
																<span className="ml-2 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded font-medium">
																	当前
																</span>
															)}
														</div>
														<div className="flex items-center gap-2 text-xs text-muted-foreground">
															<span>
																时长: {formatDuration(audio.duration)}
															</span>
															<span>•</span>
															<span>{formatFileSize(audio.fileSize)}</span>
														</div>
													</>
												)}
											</div>
											{!isEditing && onEditTitle && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleContextMenu(e, audio);
													}}
													className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
													title="更多操作"
												>
													<MoreVertical className="h-4 w-4 text-muted-foreground" />
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* 右键菜单 - 使用Portal渲染到body */}
			{contextMenu &&
				typeof window !== "undefined" &&
				createPortal(
					<div
						ref={contextMenuRef}
						className="fixed z-[99999] bg-background border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
						style={{
							left: `${contextMenu.x}px`,
							top: `${contextMenu.y}px`,
						}}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.stopPropagation();
							}
						}}
						onContextMenu={(e) => e.preventDefault()}
						role="menu"
						tabIndex={0}
					>
						<button
							type="button"
							onClick={handleEditTitle}
							className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors"
						>
							编辑标题
						</button>
						<button
							type="button"
							onClick={handleDeleteAudio}
							className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors"
						>
							删除音频
						</button>
					</div>,
					document.body,
				)}
		</div>
	);
}
