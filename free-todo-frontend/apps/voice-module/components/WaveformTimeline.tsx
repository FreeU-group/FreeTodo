"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioSegment, ScheduleItem, TimelineState } from "../types";

// 绘制圆角矩形的辅助函数
const drawRoundedRect = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) => {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
	ctx.lineTo(x + width, y + height - radius);
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
	ctx.lineTo(x + radius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
};

interface WaveformTimelineProps {
	analyser: AnalyserNode | null;
	isRecording: boolean;
	timeline: TimelineState;
	audioSegments: AudioSegment[];
	schedules: ScheduleItem[];
	onSeek: (time: Date) => void;
	onTimelineChange: (startTime: Date, duration: number) => void;
	onZoomChange: (zoomLevel: number) => void;
}

const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
	analyser,
	isRecording,
	timeline,
	audioSegments,
	schedules,
	onSeek,
	onTimelineChange,
	onZoomChange,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const animationRef = useRef<number>(0);

	const [scrollLeft, setScrollLeft] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0 });

	const currentTime = new Date();

	// 获取时间间隔（根据视图时长）
	const getTimeInterval = useCallback((duration: number): number => {
		if (duration <= 60 * 60 * 1000) return 5 * 60 * 1000; // 5分钟
		if (duration <= 6 * 60 * 60 * 1000) return 30 * 60 * 1000; // 30分钟
		return 2 * 60 * 60 * 1000; // 2小时
	}, []);

	// 计算时间到像素的转换
	const pixelsPerSecond = useCallback(() => {
		if (!containerRef.current) return 1;
		const containerWidth = containerRef.current.clientWidth;
		return containerWidth / (timeline.viewDuration / 1000);
	}, [timeline.viewDuration]);

	// 时间到像素位置
	const timeToPixel = useCallback(
		(time: Date): number => {
			const pps = pixelsPerSecond();
			const timeDiff = time.getTime() - timeline.viewStartTime.getTime();
			return (timeDiff / 1000) * pps;
		},
		[timeline.viewStartTime, pixelsPerSecond],
	);

	// 像素位置到时间
	const pixelToTime = useCallback(
		(pixel: number): Date => {
			const pps = pixelsPerSecond();
			const timeDiff = (pixel / pps) * 1000;
			return new Date(timeline.viewStartTime.getTime() + timeDiff);
		},
		[timeline.viewStartTime, pixelsPerSecond],
	);

	// 绘制波形
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const resizeCanvas = () => {
			if (canvas.parentElement) {
				const dpr = window.devicePixelRatio || 1;
				const rect = canvas.parentElement.getBoundingClientRect();
				canvas.width = rect.width * dpr;
				canvas.height = rect.height * dpr;
				ctx.scale(dpr, dpr);
				canvas.style.width = `${rect.width}px`;
				canvas.style.height = `${rect.height}px`;
			}
		};

		window.addEventListener("resize", resizeCanvas);
		resizeCanvas();

		const draw = () => {
			const width = canvas.width / (window.devicePixelRatio || 1);
			const height = canvas.height / (window.devicePixelRatio || 1);

			ctx.clearRect(0, 0, width, height);

			const centerY = height / 2;
			const startTime = timeline.viewStartTime.getTime();
			const viewDuration = timeline.viewDuration;
			const gridInterval = getTimeInterval(viewDuration);

			// 1. 绘制背景网格（更现代的设计）
			ctx.strokeStyle = "rgba(148, 163, 184, 0.15)"; // 浅灰色网格线
			ctx.lineWidth = 1;

			// 绘制水平网格线
			for (let i = 0; i <= 4; i++) {
				const y = (height / 4) * i;
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
				ctx.stroke();
			}

			// 2. 绘制时间刻度（改进的样式）
			ctx.strokeStyle = "rgba(148, 163, 184, 0.4)"; // 更柔和的刻度线颜色
			ctx.lineWidth = 1;
			ctx.font =
				'500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'; // 使用系统字体
			ctx.textBaseline = "middle";

			for (let t = startTime; t < startTime + viewDuration; t += gridInterval) {
				const x = timeToPixel(new Date(t));
				if (x >= 0 && x <= width) {
					// 绘制主刻度线（更粗）
					ctx.beginPath();
					ctx.moveTo(x, 0);
					ctx.lineTo(x, height);
					ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
					ctx.lineWidth = 1.5;
					ctx.stroke();

					// 绘制时间标签（改进的样式）
					const timeLabel = format(new Date(t), "HH:mm", { locale: zhCN });
					const textWidth = ctx.measureText(timeLabel).width;
					const labelY = 18; // 固定在顶部

					// 绘制圆角背景（更现代）
					const padding = 6;
					const bgHeight = 20;
					const bgWidth = textWidth + padding * 2;
					const radius = 4;

					// 绘制圆角矩形背景
					ctx.fillStyle = "rgba(15, 23, 42, 0.85)"; // 更不透明的背景
					drawRoundedRect(
						ctx,
						x - bgWidth / 2,
						labelY - bgHeight / 2,
						bgWidth,
						bgHeight,
						radius,
					);
					ctx.fill();

					// 绘制文字（使用更亮的颜色）
					ctx.fillStyle = "#f1f5f9"; // 更亮的文字颜色
					ctx.textAlign = "center";
					ctx.fillText(timeLabel, x, labelY);
					ctx.textAlign = "left"; // 重置对齐方式
				}
			}

			// 绘制次要刻度线（更细的线，用于更好的时间感知）
			ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
			ctx.lineWidth = 0.5;
			const minorInterval = gridInterval / 5; // 每个主刻度之间5个次要刻度
			for (
				let t = startTime;
				t < startTime + viewDuration;
				t += minorInterval
			) {
				const x = timeToPixel(new Date(t));
				if (
					x >= 0 &&
					x <= width &&
					Math.abs((t - startTime) % gridInterval) > minorInterval / 2
				) {
					ctx.beginPath();
					ctx.moveTo(x, height * 0.2);
					ctx.lineTo(x, height * 0.8);
					ctx.stroke();
				}
			}

			// 3. 绘制已保存的音频片段（改进的样式）
			audioSegments.forEach((segment) => {
				const startX = timeToPixel(segment.startTime);
				const endX = timeToPixel(segment.endTime);
				const segmentWidth = endX - startX;

				if (endX < 0 || startX > width) return;

				let color = "#334155";
				if (segment.uploadStatus === "uploaded") color = "#22c55e";
				else if (segment.uploadStatus === "failed") color = "#ef4444";
				else if (segment.uploadStatus === "uploading") color = "#f59e0b";

				ctx.fillStyle = color;
				ctx.fillRect(
					Math.max(0, startX),
					centerY - 3,
					Math.min(segmentWidth, width - Math.max(0, startX)),
					6,
				);
			});

			// 4. 绘制日程标记（改进的样式）
			schedules.forEach((schedule, index) => {
				const x = timeToPixel(schedule.scheduleTime);
				if (x >= 0 && x <= width) {
					// 计算垂直位置，避免重叠（每个标记错开，从更下方开始，避免与时间标签重叠）
					const verticalOffset = 35 + (index % 3) * 22; // 从35px开始，每3个标记循环，错开22px

					// 绘制标记点（增大）
					ctx.fillStyle = "#f59e0b";
					ctx.beginPath();
					ctx.arc(x, verticalOffset, 6, 0, Math.PI * 2); // 增大半径到6px
					ctx.fill();

					// 绘制外圈（增强可见性）
					ctx.strokeStyle = "#fbbf24";
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.arc(x, verticalOffset, 6, 0, Math.PI * 2);
					ctx.stroke();

					// 绘制连接线
					ctx.strokeStyle = "#f59e0b";
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.moveTo(x, verticalOffset + 6);
					ctx.lineTo(x, centerY - 3);
					ctx.stroke();

					// 绘制文字背景（提高可读性）
					const description =
						schedule.description.length > 20
						? `${schedule.description.substring(0, 20)}...`
							: schedule.description;
					ctx.font = "bold 12px sans-serif"; // 增大字体到12px，加粗
					const textWidth = ctx.measureText(description).width;

					// 半透明背景（增大内边距）
					ctx.fillStyle = "rgba(251, 191, 36, 0.95)"; // 橙色半透明背景
					ctx.fillRect(x + 10, verticalOffset - 10, textWidth + 12, 20);

					// 绘制边框
					ctx.strokeStyle = "#f59e0b";
					ctx.lineWidth = 1;
					ctx.strokeRect(x + 10, verticalOffset - 10, textWidth + 12, 20);

					// 绘制文字
					ctx.fillStyle = "#78350f"; // 深色文字
					ctx.fillText(description, x + 16, verticalOffset - 3);
				}
			});

			// 5. 绘制当前时间指示器（改进的样式）
			const currentX = timeToPixel(currentTime);
			if (currentX >= 0 && currentX <= width) {
				// 绘制阴影效果（更现代）
				ctx.shadowColor = "rgba(239, 68, 68, 0.3)";
				ctx.shadowBlur = 8;
				ctx.shadowOffsetX = 0;
				ctx.shadowOffsetY = 0;

				// 绘制垂直线（带渐变效果）
				const gradient = ctx.createLinearGradient(
					currentX,
					0,
					currentX,
					height,
				);
				gradient.addColorStop(0, "rgba(239, 68, 68, 0.8)");
				gradient.addColorStop(0.5, "rgba(239, 68, 68, 1)");
				gradient.addColorStop(1, "rgba(239, 68, 68, 0.8)");

				ctx.beginPath();
				ctx.moveTo(currentX, 0);
				ctx.lineTo(currentX, height);
				ctx.strokeStyle = gradient;
				ctx.lineWidth = 3;
				ctx.stroke();

				// 重置阴影
				ctx.shadowColor = "transparent";
				ctx.shadowBlur = 0;

				// 绘制顶部指示器（改进的三角形，带圆角效果）
				ctx.fillStyle = "#ef4444";
				ctx.beginPath();
				ctx.moveTo(currentX, 0);
				ctx.lineTo(currentX - 8, 12);
				ctx.lineTo(currentX + 8, 12);
				ctx.closePath();
				ctx.fill();

				// 绘制时间标签（改进的样式）
				ctx.font =
					'600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
				const timeLabel = format(currentTime, "HH:mm:ss", { locale: zhCN });
				const textWidth = ctx.measureText(timeLabel).width;
				const labelX = Math.min(currentX + 10, width - textWidth - 12);
				const labelY = 18;

				// 绘制圆角背景
				const padding = 6;
				const bgHeight = 20;
				const bgWidth = textWidth + padding * 2;
				const radius = 4;

				ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
				drawRoundedRect(
					ctx,
					labelX - padding,
					labelY - bgHeight / 2,
					bgWidth,
					bgHeight,
					radius,
				);
				ctx.fill();

				// 绘制文字
				ctx.fillStyle = "#ffffff";
				ctx.textAlign = "left";
				ctx.fillText(timeLabel, labelX, labelY);
			}

			// 6. 实时录音波形
			if (isRecording && analyser) {
				const dataArray = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteTimeDomainData(dataArray);

				const recordingX = timeToPixel(currentTime);
				const visibleStart = Math.max(0, recordingX - 200);
				const visibleEnd = Math.min(width, recordingX + 200);

				if (recordingX >= -200 && recordingX <= width + 200) {
					ctx.strokeStyle = "#ef4444";
					ctx.lineWidth = 2;
					ctx.beginPath();

					const barWidth = 2;
					const gap = 1;
					const totalBars = Math.floor(
						(visibleEnd - visibleStart) / (barWidth + gap),
					);
					const step = Math.max(1, Math.floor(dataArray.length / totalBars));

					let firstPoint = true;
					for (let i = 0; i < totalBars; i++) {
						const index = i * step;
						const amplitude = (dataArray[index] - 128) / 128;
						const x = visibleStart + i * (barWidth + gap);

						if (x >= 0 && x <= width) {
							if (firstPoint) {
								ctx.moveTo(x, centerY + amplitude * height * 0.3);
								firstPoint = false;
							} else {
								ctx.lineTo(x, centerY + amplitude * height * 0.3);
							}
						}
					}

					ctx.stroke();
				}
			}

			animationRef.current = requestAnimationFrame(draw);
		};

		draw();

		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
			window.removeEventListener("resize", resizeCanvas);
		};
	}, [
		timeline,
		audioSegments,
		schedules,
		currentTime,
		isRecording,
		analyser,
		timeToPixel,
		getTimeInterval,
	]);

	// 处理点击跳转
	const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isRecording) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = pixelToTime(x);

		onSeek(time);
	};

	// 处理滚动
	const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
		const scrollLeft = e.currentTarget.scrollLeft;
		setScrollLeft(scrollLeft);

		const pps = pixelsPerSecond();
		const timeOffset = (scrollLeft / pps) * 1000;
		const newStartTime = new Date(
			timeline.viewStartTime.getTime() - timeOffset,
		);

		onTimelineChange(newStartTime, timeline.viewDuration);
	};

	// 处理拖拽
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button !== 0) return;
		setIsDragging(true);
		setDragStart({
			x: e.clientX,
			scrollLeft: scrollLeft,
		});
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDragging) return;

		const deltaX = e.clientX - dragStart.x;
		const newScrollLeft = dragStart.scrollLeft - deltaX;

		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollLeft = newScrollLeft;
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	// 处理缩放
	const handleWheel = (e: React.WheelEvent) => {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();

			const zoomLevels = [1, 2, 3];
			const currentIndex = zoomLevels.indexOf(timeline.zoomLevel);

			if (e.deltaY < 0 && currentIndex > 0) {
				onZoomChange(zoomLevels[currentIndex - 1]);
			} else if (e.deltaY > 0 && currentIndex < zoomLevels.length - 1) {
				onZoomChange(zoomLevels[currentIndex + 1]);
			}
		}
	};

	return (
		<div
			ref={containerRef}
			className="w-full h-full bg-card/50 backdrop-blur-sm rounded-lg overflow-hidden border border-border relative"
			onWheel={handleWheel}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			role="application"
		>
			<div className="absolute top-0 left-0 right-0 h-10 bg-card/90 backdrop-blur-sm border-b border-border z-20 flex items-center justify-between px-4">
				<div className="text-sm text-foreground font-mono font-semibold">
					{format(timeline.viewStartTime, "yyyy-MM-dd HH:mm:ss", {
						locale: zhCN,
					})}{" "}
					-{" "}
					{format(
						new Date(timeline.viewStartTime.getTime() + timeline.viewDuration),
						"HH:mm:ss",
						{ locale: zhCN },
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => onZoomChange(1)}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							timeline.zoomLevel === 1
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground hover:bg-muted/80"
						}`}
					>
						1小时
					</button>
					<button
						type="button"
						onClick={() => onZoomChange(2)}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							timeline.zoomLevel === 2
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground hover:bg-muted/80"
						}`}
					>
						6小时
					</button>
					<button
						type="button"
						onClick={() => onZoomChange(3)}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							timeline.zoomLevel === 3
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground hover:bg-muted/80"
						}`}
					>
						24小时
					</button>
				</div>
			</div>

			<div
				ref={scrollContainerRef}
				className="absolute top-10 left-0 right-0 bottom-0 overflow-x-auto overflow-y-hidden"
				onScroll={handleScroll}
				style={{ cursor: isDragging ? "grabbing" : "grab" }}
			>
				<div style={{ minWidth: "100%", height: "100%" }}>
					<canvas
						ref={canvasRef}
						onClick={handleCanvasClick}
						className={`w-full h-full ${isRecording ? "cursor-not-allowed" : "cursor-crosshair"}`}
					/>
				</div>
			</div>

			{isRecording && (
				<div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none z-30 bg-red-500/90 backdrop-blur-sm px-2 py-1 rounded-md border border-red-400/50 shadow-sm">
					<span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
					<span className="text-xs font-medium text-white">录音中</span>
				</div>
			)}
		</div>
	);
};

export default WaveformTimeline;
