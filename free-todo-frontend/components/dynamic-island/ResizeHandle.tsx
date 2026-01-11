"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ResizeHandleProps {
	position:
		| "top"
		| "bottom"
		| "left"
		| "right"
		| "top-left"
		| "top-right"
		| "bottom-left"
		| "bottom-right";
	onResize: (deltaX: number, deltaY: number, position: string) => void;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
	position,
	onResize,
}) => {
	const handleRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const startPosRef = useRef<{ x: number; y: number } | null>(null);

	const getCursor = () => {
		switch (position) {
			case "top":
			case "bottom":
				return "ns-resize";
			case "left":
			case "right":
				return "ew-resize";
			case "top-left":
			case "bottom-right":
				return "nwse-resize";
			case "top-right":
			case "bottom-left":
				return "nesw-resize";
			default:
				return "default";
		}
	};

	const getSize = () => {
		// 边：宽度或高度为 4px，长度填满
		// 角：8x8px 的正方形
		if (position.includes("-")) {
			return { width: 8, height: 8 };
		}
		if (position === "top" || position === "bottom") {
			return { width: "100%", height: 4 };
		}
		return { width: 4, height: "100%" };
	};

	const getPosition = () => {
		const size = getSize();
		const style: React.CSSProperties = {
			cursor: getCursor(),
			position: "absolute",
			zIndex: 10000,
			...size,
		};

		switch (position) {
			case "top":
				return { ...style, top: 0, left: 0 };
			case "bottom":
				return { ...style, bottom: 0, left: 0 };
			case "left":
				return { ...style, left: 0, top: 0 };
			case "right":
				return { ...style, right: 0, top: 0 };
			case "top-left":
				return { ...style, top: 0, left: 0 };
			case "top-right":
				return { ...style, top: 0, right: 0 };
			case "bottom-left":
				return { ...style, bottom: 0, left: 0 };
			case "bottom-right":
				return { ...style, bottom: 0, right: 0 };
			default:
				return style;
		}
	};

	const initialMousePosRef = useRef<{ x: number; y: number } | null>(null);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(true);
			const initialPos = { x: e.clientX, y: e.clientY };
			startPosRef.current = initialPos;
			initialMousePosRef.current = initialPos;
		},
		[],
	);

	useEffect(() => {
		if (!isDragging) return;

		let rafId: number | null = null;
		let lastUpdateTime = 0;
		// 左边和上边伸缩时，增加节流时间，减少更新频率，避免闪烁
		const isLeftOrTop = position === "left" || position === "top" || position.includes("left") || position.includes("top");
		const throttleMs = isLeftOrTop ? 32 : 16; // 左边/上边：约 30fps，其他：约 60fps

		const handleMouseMove = (e: MouseEvent) => {
			if (!startPosRef.current) return;

			const now = Date.now();
			if (now - lastUpdateTime < throttleMs) {
				// 使用 requestAnimationFrame 节流，避免卡顿
				if (rafId) return;
				rafId = requestAnimationFrame(() => {
					if (!startPosRef.current || !initialMousePosRef.current) {
						rafId = null;
						return;
					}
					// 使用相对于初始鼠标位置的总移动量，而不是相对于上一次的增量
					const totalDeltaX = e.clientX - initialMousePosRef.current.x;
					const totalDeltaY = e.clientY - initialMousePosRef.current.y;
					// 计算相对于上一次的增量（用于节流判断）
					const deltaX = e.clientX - startPosRef.current.x;
					const deltaY = e.clientY - startPosRef.current.y;
					if (deltaX !== 0 || deltaY !== 0) {
						onResize(totalDeltaX, totalDeltaY, position);
						startPosRef.current = { x: e.clientX, y: e.clientY };
						lastUpdateTime = Date.now();
					}
					rafId = null;
				});
				return;
			}

			if (!initialMousePosRef.current) return;
			// 使用相对于初始鼠标位置的总移动量，而不是相对于上一次的增量
			const totalDeltaX = e.clientX - initialMousePosRef.current.x;
			const totalDeltaY = e.clientY - initialMousePosRef.current.y;
			// 计算相对于上一次的增量（用于节流判断）
			const deltaX = e.clientX - startPosRef.current.x;
			const deltaY = e.clientY - startPosRef.current.y;
			if (deltaX !== 0 || deltaY !== 0) {
				onResize(totalDeltaX, totalDeltaY, position);
				startPosRef.current = { x: e.clientX, y: e.clientY };
				lastUpdateTime = now;
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			startPosRef.current = null;
			initialMousePosRef.current = null;
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
		};

		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
		};
	}, [isDragging, position, onResize]);

	const positionStyle = getPosition();
	return (
		<div
			ref={handleRef}
			style={
				{
					...positionStyle,
					WebkitAppRegion: "no-drag",
					pointerEvents: "auto",
				} as React.CSSProperties
			}
			onMouseDown={handleMouseDown}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					// 模拟一次鼠标按下，开始拖拽
					handleMouseDown({
						button: 0,
						clientX: 0,
						clientY: 0,
					} as unknown as React.MouseEvent)
				}
			}}
			role="button"
			tabIndex={0}
			aria-label="调整窗口大小"
			className="bg-transparent hover:bg-blue-500/20 transition-colors"
		/>
	);
};
