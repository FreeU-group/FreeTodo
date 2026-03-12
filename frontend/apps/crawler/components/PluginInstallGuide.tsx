"use client";

import { CheckCircle2, Download, Globe, Loader2, Package, Sparkles, Video, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrawlerStore } from "../store";

/**
 * 插件安装引导组件
 *
 * 当 MediaCrawler 插件未安装时显示，引导用户一键安装。
 * 安装过程中实时显示进度条和步骤说明。
 */
export function PluginInstallGuide() {
	const {
		pluginInstalling,
		pluginInstallProgress,
		installPlugin,
	} = useCrawlerStore();

	const { step, percent, message } = pluginInstallProgress;
	const isError = step === "error";
	const isComplete = step === "complete";

	// 安装步骤可视化
	const steps = [
		{ key: "downloading", label: "下载插件" },
		{ key: "extracting", label: "解压文件" },
		{ key: "installing_deps", label: "安装依赖" },
		{ key: "complete", label: "安装完成" },
	];

	const currentStepIndex = steps.findIndex((s) => s.key === step);

	return (
		<div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
			{/* 主卡片 */}
			<div className="w-full max-w-md rounded-xl border border-border bg-card/60 p-8 shadow-sm backdrop-blur">
				{/* 图标 */}
				<div className="mb-5 flex justify-center">
					<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
						<Package className="h-8 w-8 text-primary" />
					</div>
				</div>

				{/* 标题 */}
				<h2 className="mb-2 text-center text-lg font-semibold text-foreground">
					媒体爬虫插件
				</h2>
				<p className="mb-6 text-center text-sm text-muted-foreground">
					该功能需要安装 MediaCrawler 插件才能使用
				</p>

				{/* 如果正在安装，显示进度 */}
				{pluginInstalling && (
					<div className="mb-6">
						{/* 进度条 */}
						<div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								className={cn(
									"h-full rounded-full transition-all duration-500",
									isError ? "bg-red-500" : "bg-primary"
								)}
								style={{ width: `${percent}%` }}
							/>
						</div>

						{/* 步骤指示器 */}
						<div className="mb-3 flex items-center justify-between">
							{steps.map((s, i) => {
								const isDone = currentStepIndex > i;
								const isCurrent = currentStepIndex === i;
								return (
									<div key={s.key} className="flex flex-col items-center">
										<div
											className={cn(
												"flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors",
												isDone
													? "bg-primary text-primary-foreground"
													: isCurrent
														? "border-2 border-primary bg-primary/10 text-primary"
														: "border border-border bg-muted text-muted-foreground"
											)}
										>
											{isDone ? (
												<CheckCircle2 className="h-3.5 w-3.5" />
											) : (
												i + 1
											)}
										</div>
										<span
											className={cn(
												"mt-1 text-[10px]",
												isDone || isCurrent
													? "text-foreground"
													: "text-muted-foreground"
											)}
										>
											{s.label}
										</span>
									</div>
								);
							})}
						</div>

						{/* 当前消息 */}
						<p className={cn(
							"text-center text-xs",
							isError ? "text-red-500" : "text-muted-foreground"
						)}>
							{message}
						</p>
					</div>
				)}

				{/* 安装完成提示 */}
				{isComplete && !pluginInstalling && (
					<div className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-green-500/10 py-3 text-sm text-green-600 dark:text-green-400">
						<CheckCircle2 className="h-4 w-4" />
						安装完成，正在加载爬虫功能...
					</div>
				)}

				{/* 安装失败提示 */}
				{isError && !pluginInstalling && (
					<div className="mb-6 rounded-lg bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
						<div className="flex items-center gap-2">
							<XCircle className="h-4 w-4 shrink-0" />
							<span className="font-medium">安装失败</span>
						</div>
						<p className="mt-1 pl-6">{message}</p>
					</div>
				)}

				{/* 安装按钮 */}
				<button
					type="button"
					onClick={() => installPlugin()}
					disabled={pluginInstalling}
					className={cn(
						"flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all",
						pluginInstalling
							? "cursor-not-allowed bg-muted text-muted-foreground"
							: "bg-primary text-primary-foreground hover:bg-primary/90"
					)}
				>
					{pluginInstalling ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							正在安装...
						</>
					) : isError ? (
						<>
							<Download className="h-4 w-4" />
							重试安装
						</>
					) : (
						<>
							<Download className="h-4 w-4" />
							安装插件
						</>
					)}
				</button>

				{/* 功能介绍 */}
				<div className="mt-6 space-y-3 border-t border-border pt-5">
					<p className="text-xs font-medium text-muted-foreground">安装后可以：</p>
					<div className="space-y-2.5">
						<div className="flex items-start gap-2.5">
							<Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
							<span className="text-xs text-muted-foreground">
								爬取小红书、抖音、哔哩哔哩等 7 大社交媒体平台内容
							</span>
						</div>
						<div className="flex items-start gap-2.5">
							<Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
							<span className="text-xs text-muted-foreground">
								查看热点速递和 AI 智能总结分析
							</span>
						</div>
						<div className="flex items-start gap-2.5">
							<Video className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
							<span className="text-xs text-muted-foreground">
								自动下载视频并转写为文字内容
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
