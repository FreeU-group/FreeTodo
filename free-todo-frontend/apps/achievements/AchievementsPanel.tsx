"use client";

import { Award, Star, Target, Trophy } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";

/**
 * 成就面板组件
 * 用于展示游戏化的成就系统
 */
export function AchievementsPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<div className="shrink-0 bg-background">
				<div className="flex items-center justify-between px-4 py-3">
					<div className="flex items-center gap-2">
						<Award className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
						<h2 className="text-lg font-semibold text-foreground">
							{t.page.achievementsLabel}
						</h2>
					</div>
				</div>
			</div>

			{/* 成就内容区域 */}
			<div className="flex-1 overflow-y-auto px-4 py-6">
				{/* 占位内容 - 后续可替换为实际的成就系统 */}
				<div className="flex flex-col items-center justify-center h-full text-center">
					<div className="mb-6 flex items-center justify-center">
						<div className="relative">
							<div className="absolute inset-0 rounded-full bg-yellow-500/20 blur-2xl" />
							<div className="relative rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 p-6">
								<Trophy className="h-12 w-12 text-white" />
							</div>
						</div>
					</div>

					<h3 className="mb-2 text-xl font-semibold text-foreground">
						成就系统
					</h3>
					<p className="mb-8 max-w-md text-sm text-muted-foreground">
						{t.page.achievementsPlaceholder}
					</p>

					{/* 示例成就卡片 */}
					<div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
						{/* 示例成就 1 */}
						<div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
									<Star className="h-5 w-5 text-blue-500" />
								</div>
								<div className="flex-1">
									<h4 className="mb-1 text-sm font-medium text-foreground">
										初出茅庐
									</h4>
									<p className="text-xs text-muted-foreground">
										完成第一个待办
									</p>
									<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div className="h-full w-0 bg-blue-500 transition-all" />
									</div>
								</div>
							</div>
						</div>

						{/* 示例成就 2 */}
						<div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md opacity-50">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-500/10">
									<Target className="h-5 w-5 text-purple-500" />
								</div>
								<div className="flex-1">
									<h4 className="mb-1 text-sm font-medium text-foreground">
										待办达人
									</h4>
									<p className="text-xs text-muted-foreground">
										完成 10 个待办
									</p>
									<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div className="h-full w-0 bg-purple-500 transition-all" />
									</div>
								</div>
							</div>
						</div>

						{/* 示例成就 3 */}
						<div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md opacity-50">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
									<Award className="h-5 w-5 text-green-500" />
								</div>
								<div className="flex-1">
									<h4 className="mb-1 text-sm font-medium text-foreground">
										效率之星
									</h4>
									<p className="text-xs text-muted-foreground">
										连续 7 天完成任务
									</p>
									<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div className="h-full w-0 bg-green-500 transition-all" />
									</div>
								</div>
							</div>
						</div>

						{/* 示例成就 4 */}
						<div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md opacity-50">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
									<Trophy className="h-5 w-5 text-orange-500" />
								</div>
								<div className="flex-1">
									<h4 className="mb-1 text-sm font-medium text-foreground">
										完美主义者
									</h4>
									<p className="text-xs text-muted-foreground">
										完成 100 个任务
									</p>
									<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div className="h-full w-0 bg-orange-500 transition-all" />
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
