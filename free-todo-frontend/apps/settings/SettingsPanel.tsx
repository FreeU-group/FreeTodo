"use client";

import { BellRing, LayoutGrid, LifeBuoy, Radar, Settings, Sparkles, Wrench, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useConfig } from "@/lib/query";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";
import {
	AudioAsrConfigSection,
	AudioConfigSection,
	AutomationTasksSection,
	AutoTodoDetectionSection,
	CookiesConfigSection,
	CrawlerConfigSection,
	// DifyConfigSection,
	DockDisplayModeSection,
	JournalSettingsSection,
	KdlConfigSection,
	LlmConfigSection,
	NotificationPermissionSection,
	NotificationPopupSection,
	OnboardingSection,
	PanelSwitchesSection,
	PERCEPTION_JOB_IDS,
	RecorderConfigSection,
	SchedulerSection,
	SensorNodesSection,
	type SettingsCategory,
	type SettingsCategoryId,
	SettingsCategoryPanel,
	SettingsSearchAction,
	SettingsSearchProvider,
	SettingsSection,
	TavilyConfigSection,
	VersionInfoSection,
} from "./components";
import { useSettingsSearchMatchStats } from "./hooks/useSettingsSearchMatchStats";

const SETTINGS_CATEGORY_IDS: SettingsCategoryId[] = [
	"ai",
	"workspace",
	"automation",
	"sensing",
	"proactive",
	"developer",
	"help",
];

/**
 * 设置面板组件
 * 用于配置系统各项功能
 */
export function SettingsPanel() {
	const tPage = useTranslations("page");
	const tSettings = useTranslations("page.settings");

	// 使用 TanStack Query 获取配置
	const { data: config, isLoading: configLoading } = useConfig();

	// 获取面板启用状态
	const isFeatureEnabled = useUiStore((state) => state.isFeatureEnabled);
	const isAudioPanelEnabled = isFeatureEnabled("audio");

	const categories: SettingsCategory[] = [
		{
			id: "ai",
			label: tSettings("categoryAiTitle"),
			description: tSettings("categoryAiDescription"),
			icon: Sparkles,
		},
		{
			id: "workspace",
			label: tSettings("categoryWorkspaceTitle"),
			description: tSettings("categoryWorkspaceDescription"),
			icon: LayoutGrid,
		},
		{
			id: "automation",
			label: tSettings("categoryAutomationTitle"),
			description: tSettings("categoryAutomationDescription"),
			icon: Zap,
		},
		{
			id: "sensing",
			label: tSettings("categorySensingTitle"),
			description: tSettings("categorySensingDescription"),
			icon: Radar,
		},
		{
			id: "proactive",
			label: tSettings("categoryProactiveTitle"),
			description: tSettings("categoryProactiveDescription"),
			icon: BellRing,
		},
		{
			id: "developer",
			label: tSettings("categoryDeveloperTitle"),
			description: tSettings("categoryDeveloperDescription"),
			icon: Wrench,
		},
		{
			id: "help",
			label: tSettings("categoryHelpTitle"),
			description: tSettings("categoryHelpDescription"),
			icon: LifeBuoy,
		},
	];

	const [activeCategory, setActiveCategory] =
		useState<SettingsCategoryId>("workspace");
	const contentRef = useRef<HTMLDivElement | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const isSearchActive = searchQuery.trim().length > 0;

	const loading = configLoading;

	const { handleCategoryMatchChange, showNoResults } =
		useSettingsSearchMatchStats({
			categoriesCount: categories.length,
			isSearchActive,
		});

	useEffect(() => {
		const handleSetCategory = (
			event: CustomEvent<{ category?: SettingsCategoryId }>,
		) => {
			const nextCategory = event.detail?.category;
			if (nextCategory && SETTINGS_CATEGORY_IDS.includes(nextCategory)) {
				setActiveCategory(nextCategory);
			}
		};

		window.addEventListener(
			"settings:set-category",
			handleSetCategory as EventListener,
		);
		return () => {
			window.removeEventListener(
				"settings:set-category",
				handleSetCategory as EventListener,
			);
		};
	}, []);

	const renderCategoryContent = (categoryId: SettingsCategoryId) => {
		switch (categoryId) {
			case "workspace":
				return (
					<>
						<DockDisplayModeSection loading={loading} />
						<PanelSwitchesSection loading={loading} />
						<NotificationPermissionSection loading={loading} />
						<NotificationPopupSection loading={loading} />
					</>
				);
			case "automation":
				return (
					<>
						<JournalSettingsSection />
						<AutomationTasksSection loading={loading} />
					</>
				);
			case "ai":
				return (
					<>
						<LlmConfigSection config={config} loading={loading} />
						<TavilyConfigSection config={config} loading={loading} />
					</>
				);
			case "sensing":
				return (
					<>
						<SensorNodesSection config={config} loading={loading} />
						<RecorderConfigSection config={config} loading={loading} />
						<SchedulerSection
							loading={loading}
							includeJobIds={PERCEPTION_JOB_IDS}
							titleOverride={tSettings("perceptionSchedulerTitle")}
							descriptionOverride={tSettings("perceptionSchedulerDescription")}
							compact
						/>
					</>
				);
			case "proactive":
				return (
					<>
						<AutoTodoDetectionSection config={config} loading={loading} />
					</>
				);
			case "developer":
				return (
					<>
						{/* <DifyConfigSection config={config} loading={loading} /> */}
						<SchedulerSection
							loading={loading}
							excludeJobIds={PERCEPTION_JOB_IDS}
						/>
						{isAudioPanelEnabled && (
							<>
								<AudioConfigSection config={config} loading={loading} />
								<AudioAsrConfigSection config={config} loading={loading} />
							</>
						)}
						<CrawlerConfigSection loading={loading} />
						<CookiesConfigSection loading={loading} />
						<KdlConfigSection loading={loading} />
					</>
				);
			case "help":
				return (
					<>
						<OnboardingSection loading={loading} />
						<SettingsSection
							title={tSettings("aboutTitle")}
							description={tSettings("aboutDescription")}
						>
							<VersionInfoSection />
						</SettingsSection>
					</>
				);
			default:
				return null;
		}
	};

	useEffect(() => {
		if (!activeCategory) return;
		contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, [activeCategory]);

	useEffect(() => {
		if (isSearchActive) {
			contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [isSearchActive]);

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader
				icon={Settings}
				title={tPage("settingsLabel")}
				actions={
					<SettingsSearchAction
						value={searchQuery}
						onChange={setSearchQuery}
					/>
				}
			/>

		{/* 设置内容区域 */}
		<SettingsSearchProvider query={searchQuery}>
			<div
				data-tour="settings-content"
				ref={contentRef}
				className="flex-1 overflow-y-auto"
			>
					{!isSearchActive && (
						<div className="sticky top-0 z-10 border-b border-border/70 bg-background/90 px-4 py-4 backdrop-blur">
							<div
								role="tablist"
								aria-label={tPage("settingsLabel")}
								className="flex flex-wrap items-center gap-2 pb-1"
							>
								{categories.map((category) => {
									const isActive = category.id === activeCategory;
									const Icon = category.icon;

									return (
										<button
											key={category.id}
											type="button"
											role="tab"
											id={`settings-category-tab-${category.id}`}
											aria-selected={isActive}
											aria-controls={`settings-category-panel-${category.id}`}
											onClick={() => setActiveCategory(category.id)}
											className={cn(
												"flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												isActive
													? "border-primary bg-primary text-primary-foreground shadow-sm"
													: "border-transparent bg-muted/40 text-foreground hover:bg-muted/70",
											)}
										>
											<Icon className="h-4 w-4" />
											<span>{category.label}</span>
										</button>
									);
								})}
						</div>
					</div>
					)}

					<div className="space-y-6 px-4 py-6">
						{showNoResults && (
							<div className="flex min-h-50 items-center justify-center">
								<div className="text-center">
									<p className="text-sm font-medium text-foreground">
										{tSettings("searchNoResultsTitle")}
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{tSettings("searchNoResultsHint")}
									</p>
								</div>
							</div>
						)}

						{categories.map((category) => (
							<SettingsCategoryPanel
								key={category.id}
								category={category}
								isSearchActive={isSearchActive}
								activeCategory={activeCategory}
								renderCategoryContent={renderCategoryContent}
								onMatchChange={handleCategoryMatchChange}
							/>
						))}
					</div>
				</div>
			</SettingsSearchProvider>
		</div>
	);
}

// 兼容默认导出，避免构建器找不到导出时报错
export default SettingsPanel;
