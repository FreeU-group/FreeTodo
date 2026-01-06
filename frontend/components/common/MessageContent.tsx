"use client";

import { marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import ScreenshotIdButton from "./ScreenshotIdButton";

interface MessageContentProps {
	content: string;
	isMarkdown?: boolean;
	isStreaming?: boolean; // 是否正在流式输出
}

export default function MessageContent({
	content,
	isMarkdown = true,
	isStreaming = false,
}: MessageContentProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const rootsRef = useRef<
		Array<{ root: ReturnType<typeof createRoot>; element: Element }>
	>([]);
	const lastHtmlRef = useRef<string>("");

	// 处理内容，将截图 ID 替换为占位符
	const processedContent = useMemo(() => {
		// 匹配多个截图 ID: [截图ID: 495, 494, 489] 或 [截图ID: 495]
		const screenshotIdsPattern = /\[截图ID:\s*([\d\s,]+)\]/g;
		let processed = content;
		const screenshotIds: number[] = [];

		// 替换所有截图 ID 为占位符，并记录 ID
		processed = processed.replace(screenshotIdsPattern, (match, idsStr) => {
			// 解析 ID 列表，支持逗号分隔和空格
			const ids = idsStr
				.split(",")
				.map((id: string) => parseInt(id.trim(), 10))
				.filter((id: number) => !Number.isNaN(id) && id > 0);

			if (ids.length === 0) return match;

			// 多个 ID 时，拆分成多个独立的按钮
			screenshotIds.push(...ids);
			return ids
				.map(
					(id: number) =>
						`<span data-screenshot-id="${id}" class="screenshot-id-placeholder">[截图ID: ${id}]</span>`,
				)
				.join(" ");
		});

		// 渲染 markdown
		if (isMarkdown) {
			try {
				processed = marked.parse(processed, { async: false }) as string;
			} catch (error) {
				console.error("Markdown渲染失败:", error);
			}
		}

		return { html: processed, screenshotIds };
	}, [content, isMarkdown]);

	// 只在内容变化时更新 innerHTML
	useEffect(() => {
		if (!containerRef.current) return;

		// 只有 HTML 内容真正变化时才更新
		if (lastHtmlRef.current !== processedContent.html) {
			containerRef.current.innerHTML = processedContent.html;
			lastHtmlRef.current = processedContent.html;
		}
	}, [processedContent.html]);

	// 渲染截图按钮
	useEffect(() => {
		if (!containerRef.current) return;

		// 正在流式输出时，不渲染截图按钮
		if (isStreaming) {
			return;
		}

		// 检查占位符
		const placeholders = containerRef.current.querySelectorAll(
			".screenshot-id-placeholder",
		);

		// 没有占位符，不需要处理
		if (placeholders.length === 0) {
			return;
		}

		// 渲染截图按钮
		const roots: Array<{
			root: ReturnType<typeof createRoot>;
			element: Element;
		}> = [];

		placeholders.forEach((placeholder) => {
			const screenshotId = parseInt(
				placeholder.getAttribute("data-screenshot-id") || "0",
				10,
			);
			// 检查是否已经挂载了 root（避免重复创建）
			if (screenshotId > 0 && !placeholder.hasAttribute("data-root-mounted")) {
				const root = createRoot(placeholder);
				root.render(<ScreenshotIdButton screenshotId={screenshotId} />);
				// 标记此元素已经挂载了 root
				(placeholder as HTMLElement).setAttribute("data-root-mounted", "true");
				roots.push({ root, element: placeholder });
			}
		});

		// 保存新创建的 roots，用于清理
		if (roots.length > 0) {
			rootsRef.current = [...rootsRef.current, ...roots];
		}
	}, [isStreaming]);

	// 组件卸载时清理
	useEffect(() => {
		return () => {
			if (rootsRef.current.length > 0) {
				// 捕获当前的 roots，避免闭包问题
				const rootsToCleanup = [...rootsRef.current];
				rootsRef.current = [];

				// 使用 setTimeout 将卸载操作延迟到下一个事件循环
				// 避免在 React 渲染期间同步卸载 root
				setTimeout(() => {
					rootsToCleanup.forEach(({ root, element }) => {
						try {
							root.unmount();
							// 移除标记
							(element as HTMLElement).removeAttribute("data-root-mounted");
						} catch {
							// 忽略卸载错误
						}
					});
				}, 0);
			}
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="markdown-content prose prose-sm max-w-none text-sm prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-ol:my-1.5"
		/>
	);
}
