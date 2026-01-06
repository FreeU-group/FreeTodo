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
			zIndex: 1000,
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

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			console.log("[ResizeHandle] 开始拖动:", position);
			setIsDragging(true);
			startPosRef.current = { x: e.clientX, y: e.clientY };
		},
		[position],
	);

	useEffect(() => {
		if (!isDragging) return;

		let rafId: number | null = null;
		let lastUpdateTime = 0;
		const throttleMs = 16; // 约 60fps，减少 IPC 调用频率

		const handleMouseMove = (e: MouseEvent) => {
			if (!startPosRef.current) return;

			const now = Date.now();
			if (now - lastUpdateTime < throttleMs) {
				// 使用 requestAnimationFrame 节流，避免卡顿
				if (rafId) return;
				rafId = requestAnimationFrame(() => {
					if (!startPosRef.current) {
						rafId = null;
						return;
					}
					const deltaX = e.clientX - startPosRef.current.x;
					const deltaY = e.clientY - startPosRef.current.y;
					if (deltaX !== 0 || deltaY !== 0) {
						onResize(deltaX, deltaY, position);
						startPosRef.current = { x: e.clientX, y: e.clientY };
						lastUpdateTime = Date.now();
					}
					rafId = null;
				});
				return;
			}

			const deltaX = e.clientX - startPosRef.current.x;
			const deltaY = e.clientY - startPosRef.current.y;
			if (deltaX !== 0 || deltaY !== 0) {
				onResize(deltaX, deltaY, position);
				startPosRef.current = { x: e.clientX, y: e.clientY };
				lastUpdateTime = now;
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			startPosRef.current = null;
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
