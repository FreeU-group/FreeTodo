"use client";

import { Award, Star, Target, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/common/layout/PanelHeader";

/**
 * 成就面板组件
 * 用于展示游戏化的成就系统
 */
export function AchievementsPanel() {
	const t = useTranslations("page");
	const tAchievements = useTranslations("achievements");

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader icon={Award} title={t("achievementsLabel")} />

			{/* 成就内容区域 */}
			<div className="flex-1 overflow-y-auto px-4 py-6">
				{/* 占位内容 - 后续可替换为实际的成就系统 */}
				<div className="flex flex-col items-center justify-center h-full text-center">
					<div className="mb-6 flex items-center justify-center">
						<div className="relative">
							<div className="absolute inset-0 rounded-full bg-yellow-500/20 blur-2xl" />
							<div className="relative rounded-full bg-linear-to-br from-yellow-400 to-orange-500 p-6">
								<Trophy className="h-12 w-12 text-white" />
							</div>
						</div>
					</div>

					<h3 className="mb-2 text-xl font-semibold text-foreground">
						{tAchievements("title")}
					</h3>
					<p className="mb-8 max-w-md text-sm text-muted-foreground">
						{tAchievements("placeholder")}
					</p>

					{/* 示例成就卡片 */}
					<div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
						{/* 示例成就 1 */}
						<div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
									<Star className="h-5 w-5 text-primary" />
								</div>
								<div className="flex-1">
									<h4 className="mb-1 text-sm font-medium text-foreground">
										{tAchievements("achievement1.name")}
									</h4>
									<p className="text-xs text-muted-foreground">
										{tAchievements("achievement1.description")}
									</p>
									<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div className="h-full w-0 bg-primary transition-all" />
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
										{tAchievements("achievement2.name")}
									</h4>
									<p className="text-xs text-muted-foreground">
										{tAchievements("achievement2.description")}
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
										{tAchievements("achievement3.name")}
									</h4>
									<p className="text-xs text-muted-foreground">
										{tAchievements("achievement3.description")}
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
										{tAchievements("achievement4.name")}
									</h4>
									<p className="text-xs text-muted-foreground">
										{tAchievements("achievement4.description")}
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
