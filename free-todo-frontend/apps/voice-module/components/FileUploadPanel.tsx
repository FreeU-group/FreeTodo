"use client";

import {
	AlertCircle,
	Check,
	FileAudio,
	FileVideo,
	Loader2,
	Upload,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ExtractedTodo = {
	id?: string;
	title: string;
	description?: string;
	deadline?: string;
	priority?: "high" | "medium" | "low" | string;
};

type ExtractedSchedule = {
	id?: string;
	schedule_time: string;
	description: string;
	status?: string;
};

interface FileUploadPanelProps {
	onTranscriptionComplete?: (result: {
		transcript: string;
		optimized_text?: string;
		todos: ExtractedTodo[];
		schedules: ExtractedSchedule[];
	}) => void;
}

export function FileUploadPanel({
	onTranscriptionComplete,
}: FileUploadPanelProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [result, setResult] = useState<{
		transcript: string;
		optimized_text?: string;
		todos: ExtractedTodo[];
		schedules: ExtractedSchedule[];
		processing_time?: number;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const supportedFormats = [
		"audio/mp3",
		"audio/wav",
		"audio/m4a",
		"audio/flac",
		"audio/ogg",
		"audio/webm",
		"audio/aac",
		"video/mp4",
		"video/avi",
		"video/mov",
		"video/mkv",
		"video/webm",
		"video/flv",
	];

	const handleFileSelect = async (files: FileList | null) => {
		if (!files || files.length === 0) return;

		const file = files[0];

		// 检查文件类型
		const isValidFormat =
			supportedFormats.some((format) =>
				file.type.includes(format.split("/")[1]),
			) ||
			[
				".mp3",
				".wav",
				".m4a",
				".flac",
				".ogg",
				".webm",
				".aac",
				".mp4",
				".avi",
				".mov",
				".mkv",
				".flv",
			].some((ext) => file.name.toLowerCase().endsWith(ext));

		if (!isValidFormat) {
			setError(
				`不支持的文件格式: ${file.name}。支持的格式: MP3, WAV, M4A, FLAC, OGG, WebM, AAC, MP4, AVI, MOV, MKV, FLV`,
			);
			return;
		}

		// 检查文件大小（限制100MB）
		const maxSize = 100 * 1024 * 1024; // 100MB
		if (file.size > maxSize) {
			setError(
				`文件过大: ${(file.size / 1024 / 1024).toFixed(2)}MB。最大支持 100MB`,
			);
			return;
		}

		setUploading(true);
		setUploadProgress(0);
		setError(null);
		setResult(null);

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("optimize", "true");
			formData.append("extract_todos", "true");
			formData.append("extract_schedules", "true");

			const xhr = new XMLHttpRequest();

			// 监听上传进度
			xhr.upload.addEventListener("progress", (e) => {
				if (e.lengthComputable) {
					const percentComplete = (e.loaded / e.total) * 50; // 上传占50%
					setUploadProgress(percentComplete);
				}
			});

			// 监听响应
			xhr.addEventListener("load", () => {
				if (xhr.status === 200) {
					try {
						const response = JSON.parse(xhr.responseText);
						setUploadProgress(100);
						setResult(response);
						onTranscriptionComplete?.(response);
					} catch (_e) {
						setError("解析响应失败");
					}
				} else {
					try {
						const errorResponse = JSON.parse(xhr.responseText);
						setError(errorResponse.detail || `上传失败: ${xhr.statusText}`);
					} catch {
						setError(`上传失败: ${xhr.status} ${xhr.statusText}`);
					}
				}
				setUploading(false);
			});

			xhr.addEventListener("error", () => {
				setError("网络错误，请检查网络连接");
				setUploading(false);
			});

			xhr.addEventListener("abort", () => {
				setError("上传已取消");
				setUploading(false);
			});

			// 模拟处理进度（转录和处理占50%）
			const progressInterval = setInterval(() => {
				setUploadProgress((prev) => {
					if (prev < 50) return prev;
					if (prev < 95) return prev + 0.5;
					return prev;
				});
			}, 500);

			// 使用完整的后端URL（直接连接，不通过代理）
			const apiUrl =
				typeof window !== "undefined"
					? process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api"
					: "http://localhost:8000/api";
			xhr.open("POST", `${apiUrl}/audio/transcribe-file`);
			xhr.send(formData);

			// 清理进度定时器
			xhr.addEventListener("loadend", () => {
				clearInterval(progressInterval);
			});
		} catch (error) {
			console.error("上传失败:", error);
			setError(error instanceof Error ? error.message : "上传失败");
			setUploading(false);
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		handleFileSelect(e.dataTransfer.files);
	};

	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		handleFileSelect(e.target.files);
	};

	return (
		<div className="border border-border rounded-lg bg-card shadow-sm overflow-hidden">
			{/* 头部 */}
			<div className="px-4 py-3 bg-muted/30 border-b border-border">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold flex items-center gap-2">
						<Upload className="h-4 w-4 text-primary" />
						<span>上传文件转录</span>
					</h3>
					{result && (
						<button
							type="button"
							onClick={() => {
								setResult(null);
								setError(null);
							}}
							className="p-1 rounded hover:bg-muted transition-colors"
							aria-label="清除结果"
						>
							<X className="h-4 w-4 text-muted-foreground" />
						</button>
					)}
				</div>
			</div>

			{/* 内容区域 */}
			<div className="p-4 space-y-4">
				{/* 上传区域 */}
				{!result && (
					<div
						className={cn(
							"border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
							isDragging
								? "border-primary bg-primary/5"
								: "border-border hover:border-primary/50",
							uploading && "opacity-50 cursor-not-allowed",
						)}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						onClick={() => !uploading && fileInputRef.current?.click()}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								!uploading && fileInputRef.current?.click();
							}
						}}
						role="button"
						tabIndex={0}
					>
						<input
							ref={fileInputRef}
							type="file"
							accept="audio/*,video/*"
							className="hidden"
							onChange={handleFileInputChange}
							disabled={uploading}
						/>

						{uploading ? (
							<div className="space-y-3">
								<Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
								<div className="space-y-2">
									<p className="text-sm font-medium">正在处理...</p>
									<div className="w-full bg-muted rounded-full h-2 overflow-hidden">
										<div
											className="h-full bg-primary transition-all duration-300"
											style={{ width: `${uploadProgress}%` }}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										{uploadProgress < 50 ? "上传中..." : "转录中..."}
									</p>
								</div>
							</div>
						) : (
							<div className="space-y-3">
								<div className="flex justify-center gap-4">
									<FileAudio className="h-10 w-10 text-muted-foreground" />
									<FileVideo className="h-10 w-10 text-muted-foreground" />
								</div>
								<div>
									<p className="text-sm font-medium">
										拖放文件到此处，或点击选择文件
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										支持音频（MP3, WAV, M4A, FLAC, OGG, WebM, AAC）和视频（MP4,
										AVI, MOV, MKV, WebM, FLV）
									</p>
									<p className="text-xs text-muted-foreground">最大 100MB</p>
								</div>
							</div>
						)}
					</div>
				)}

				{/* 错误提示 */}
				{error && (
					<div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
						<AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
						<p className="text-sm text-red-600 dark:text-red-400">{error}</p>
					</div>
				)}

				{/* 结果展示 */}
				{result && (
					<div className="space-y-4">
						{/* 处理信息 */}
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>处理完成</span>
							{result.processing_time && (
								<span>耗时: {result.processing_time}秒</span>
							)}
						</div>

						{/* 转录文本 */}
						<div className="space-y-2">
							<h4 className="text-sm font-semibold">转录文本</h4>
							<div className="p-3 rounded-lg bg-muted/50 border border-border max-h-48 overflow-y-auto">
								<p className="text-sm whitespace-pre-wrap">
									{result.transcript}
								</p>
							</div>
						</div>

						{/* 优化文本 */}
						{result.optimized_text && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold">优化文本</h4>
								<div className="p-3 rounded-lg bg-muted/50 border border-border max-h-48 overflow-y-auto">
									<p className="text-sm whitespace-pre-wrap">
										{result.optimized_text}
									</p>
								</div>
							</div>
						)}

						{/* 提取的待办 */}
						{result.todos && result.todos.length > 0 && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold flex items-center gap-2">
									<Check className="h-4 w-4 text-primary" />
									<span>提取的待办 ({result.todos.length})</span>
								</h4>
								<div className="space-y-2">
									{result.todos.map((todo, index) => {
										const key = todo.id ?? `${todo.title}-${todo.deadline ?? index}`;
										return (
										<div
											key={key}
											className="p-3 rounded-lg border border-border bg-background"
										>
											<p className="text-sm font-medium">{todo.title}</p>
											{todo.description && (
												<p className="text-xs text-muted-foreground mt-1">
													{todo.description}
												</p>
											)}
											{todo.deadline && (
												<p className="text-xs text-muted-foreground mt-1">
													截止:{" "}
													{new Date(todo.deadline).toLocaleString("zh-CN")}
												</p>
											)}
											<span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
												{todo.priority === "high"
													? "高优先级"
													: todo.priority === "low"
														? "低优先级"
														: "中优先级"}
											</span>
										</div>
										);
									})}
								</div>
							</div>
						)}

						{/* 提取的日程 */}
						{result.schedules && result.schedules.length > 0 && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold flex items-center gap-2">
									<FileVideo className="h-4 w-4 text-amber-600 dark:text-amber-400" />
									<span>提取的日程 ({result.schedules.length})</span>
								</h4>
								<div className="space-y-2">
									{result.schedules.map((schedule, index) => {
										const key =
											schedule.id ??
											`${schedule.description}-${schedule.schedule_time}-${index}`;
										return (
										<div
											key={key}
											className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5"
										>
											<p className="text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
												{new Date(schedule.schedule_time).toLocaleString(
													"zh-CN",
												)}
											</p>
											<p className="text-sm mt-1">{schedule.description}</p>
										</div>
										);
									})}
								</div>
							</div>
						)}

						{/* 重新上传按钮 */}
						<button
							type="button"
							onClick={() => {
								setResult(null);
								setError(null);
								fileInputRef.current?.click();
							}}
							className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
						>
							上传新文件
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
