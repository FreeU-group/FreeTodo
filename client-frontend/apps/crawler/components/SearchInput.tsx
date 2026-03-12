"use client";

import { Ban, Loader2, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useCrawlerStore } from "../store";

/**
 * 搜索关键词输入组件
 */
export function SearchInput() {
	const {
		keywords,
		setKeywords,
		status,
		syncKeywordsToBackend,
		loadConfigFromBackend,
		extractedKeywords,
		excludedKeywords,
		extractingKeywords,
		extractKeywords,
		clearExtractedKeywords,
	} = useCrawlerStore();
	const initialLoadRef = useRef(false);
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

	// 组件挂载时从后端加载配置
	useEffect(() => {
		if (!initialLoadRef.current) {
			initialLoadRef.current = true;
			loadConfigFromBackend();
		}
	}, [loadConfigFromBackend]);

	// 防抖调用关键词提取API
	const debouncedExtractKeywords = useCallback((text: string) => {
		// 清除之前的定时器
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// 如果文本为空，清除关键词
		if (!text.trim()) {
			clearExtractedKeywords();
			return;
		}

		// 设置新的定时器，800ms后调用API
		debounceTimerRef.current = setTimeout(() => {
			extractKeywords(text);
		}, 800);
	}, [extractKeywords, clearExtractedKeywords]);

	// 处理输入变化
	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		setKeywords(newValue);
		debouncedExtractKeywords(newValue);
	};

	// 失去焦点时同步关键词到后端
	const handleBlur = () => {
		// 优先同步提取出的关键词，如果没有则同步原始输入
		if (extractedKeywords.length > 0) {
			syncKeywordsToBackend(extractedKeywords.join(","));
		} else if (keywords.trim()) {
			syncKeywordsToBackend(keywords);
		}
	};

	// 点击关键词，将其设置为搜索内容
	const handleKeywordClick = (keyword: string) => {
		setKeywords(keyword);
		syncKeywordsToBackend(keyword);
		clearExtractedKeywords();
	};

	// 组件卸载时清理定时器
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

	return (
		<div className="space-y-2">
			<div className="relative">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					value={keywords}
					onChange={handleInputChange}
					onBlur={handleBlur}
					placeholder="想知道些什么..."
					disabled={status === "running"}
					className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>

			{/* 关键词提取结果展示 */}
			{(extractingKeywords || extractedKeywords.length > 0 || excludedKeywords.length > 0) && (
				<div className="space-y-2 pt-1">
					{extractingKeywords ? (
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Loader2 className="h-3 w-3 animate-spin" />
							<span>正在提取关键词...</span>
						</div>
					) : (
						<>
							{/* 感兴趣的关键词 */}
							{extractedKeywords.length > 0 && (
								<div className="flex flex-wrap items-center gap-2">
									<div className="flex items-center gap-1 text-xs text-muted-foreground">
										<Sparkles className="h-3 w-3" />
										<span>感兴趣关键词：</span>
									</div>
									{extractedKeywords.map((keyword, index) => (
										<button
											key={index}
											type="button"
											onClick={() => handleKeywordClick(keyword)}
											className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
										>
											{keyword}
										</button>
									))}
								</div>
							)}
							{/* 不感兴趣的关键词 */}
							{excludedKeywords.length > 0 && (
								<div className="flex flex-wrap items-center gap-2">
									<div className="flex items-center gap-1 text-xs text-muted-foreground">
										<Ban className="h-3 w-3" />
										<span>排除关键词：</span>
									</div>
									{excludedKeywords.map((keyword, index) => (
										<span
											key={index}
											className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
										>
											{keyword}
										</span>
									))}
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
