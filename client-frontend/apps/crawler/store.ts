/**
 * 爬虫状态管理
 */
import { create } from "zustand";
import type { CrawlerPlatform, CrawlerStatus, CrawlerTask, CrawlerType, CrawlResultItem } from "./types";

// API 基础 URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

// localStorage key for viewed items
const VIEWED_ITEMS_KEY = "crawler_viewed_items";
// localStorage key for daily summary cache
const DAILY_SUMMARY_KEY = "crawler_daily_summary";
const DAILY_SUMMARY_DATE_KEY = "crawler_daily_summary_date";

// Helper functions for localStorage
const loadViewedItems = (): Set<string> => {
	if (typeof window === "undefined") return new Set();
	try {
		const stored = localStorage.getItem(VIEWED_ITEMS_KEY);
		if (stored) {
			return new Set(JSON.parse(stored));
		}
	} catch (e) {
		console.error("Failed to load viewed items from localStorage:", e);
	}
	return new Set();
};

const saveViewedItems = (items: Set<string>): void => {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(VIEWED_ITEMS_KEY, JSON.stringify([...items]));
	} catch (e) {
		console.error("Failed to save viewed items to localStorage:", e);
	}
};

// Helper functions for daily summary cache
const loadDailySummaryCache = (): { summary: string; date: string | null } => {
	if (typeof window === "undefined") return { summary: "", date: null };
	try {
		const summary = localStorage.getItem(DAILY_SUMMARY_KEY) || "";
		const date = localStorage.getItem(DAILY_SUMMARY_DATE_KEY);
		// 检查是否是当天的缓存
		const today = new Date().toISOString().split("T")[0];
		if (date === today && summary && !summary.startsWith("## 获取总结失败")) {
			return { summary, date };
		}
		return { summary: "", date: null };
	} catch (e) {
		console.error("Failed to load daily summary from localStorage:", e);
	}
	return { summary: "", date: null };
};

const saveDailySummaryCache = (summary: string, date: string): void => {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(DAILY_SUMMARY_KEY, summary);
		localStorage.setItem(DAILY_SUMMARY_DATE_KEY, date);
	} catch (e) {
		console.error("Failed to save daily summary to localStorage:", e);
	}
};

// ---------------------------------------------------------------------------
// 插件安装进度
// ---------------------------------------------------------------------------
interface PluginInstallProgress {
	step: string;        // downloading | extracting | installing_deps | complete | error
	percent: number;     // 0-100
	message: string;
}

interface CrawlerStore {
	// 插件状态
	pluginInstalled: boolean;
	pluginAvailable: boolean;
	pluginMode: "plugin" | "dev" | "none";  // 当前运行模式
	pluginChecked: boolean;                  // 是否已完成首次检查
	pluginInstalling: boolean;
	pluginInstallProgress: PluginInstallProgress;

	// 当前状态
	status: CrawlerStatus;
	platforms: CrawlerPlatform[];  // 多平台支持
	crawlerType: CrawlerType;
	keywords: string;

	// 爬取结果
	results: CrawlResultItem[];
	totalCount: number;

	// 当前任务
	currentTask: CrawlerTask | null;

	// 选中的结果项（用于详情面板）
	selectedResult: CrawlResultItem | null;

	// 配置是否已同步到后端
	configSynced: boolean;

	// 今日总结相关
	dailySummary: string;
	dailySummaryLoading: boolean;
	showDailySummary: boolean;
	dailySummaryCacheDate: string | null;  // 缓存的日期（格式：YYYY-MM-DD）

	// 视频下载相关
	videoDownloadProgress: {
		isDownloading: boolean;
		current: number;
		total: number;
		currentTitle: string;
		successCount: number;
		failedCount: number;
		message: string;
	};

	// 关键词提取相关
	extractedKeywords: string[];
	excludedKeywords: string[];  // 用户不感兴趣的关键词
	extractingKeywords: boolean;

	// 已查看的内容
	viewedItems: Set<string>;

	// 插件操作
	checkPluginStatus: () => Promise<void>;
	installPlugin: (downloadUrl?: string) => Promise<void>;
	uninstallPlugin: () => Promise<void>;

	// Actions
	setStatus: (status: CrawlerStatus) => void;
	setPlatforms: (platforms: CrawlerPlatform[]) => void;
	togglePlatform: (platform: CrawlerPlatform) => void;  // 切换单个平台选中状态
	setCrawlerType: (type: CrawlerType) => void;
	setKeywords: (keywords: string) => void;
	setResults: (results: CrawlResultItem[]) => void;
	addResults: (results: CrawlResultItem[]) => void;
	setSelectedResult: (result: CrawlResultItem | null) => void;
	setCurrentTask: (task: CrawlerTask | null) => void;
	clearResults: () => void;

	// 后端 API 操作
	syncKeywordsToBackend: (keywords: string) => Promise<void>;
	syncConfigToBackend: () => Promise<void>;
	loadConfigFromBackend: () => Promise<void>;

	// 爬虫操作
	startCrawler: () => Promise<void>;
	stopCrawler: () => Promise<void>;
	refreshResults: () => Promise<void>;

	// 获取爬虫状态
	fetchCrawlerStatus: () => Promise<void>;

	// 今日总结操作
	fetchDailySummary: () => Promise<void>;
	refreshDailySummary: () => Promise<void>;  // 强制刷新今日总结
	setShowDailySummary: (show: boolean) => void;
	closeDailySummary: () => void;
	loadAllPlatformResults: () => Promise<void>;  // 加载所有平台的今日数据

	// 视频下载操作
	downloadTodayVideos: () => Promise<void>;

	// 关键词提取操作
	extractKeywords: (text: string) => Promise<void>;
	setExtractedKeywords: (keywords: string[]) => void;
	setExcludedKeywords: (keywords: string[]) => void;
	clearExtractedKeywords: () => void;

	// 已查看内容操作
	markAsViewed: (id: string) => void;
	isViewed: (id: string) => boolean;
}

// ---------------------------------------------------------------------------
// 启动宽限期保护：防止 fetchCrawlerStatus 轮询在爬虫刚启动时
// 将状态从 running 覆盖回 idle（后端需要几秒才能真正启动进程）
// ---------------------------------------------------------------------------
let _lastCrawlerStartTime = 0;
const CRAWLER_START_GRACE_PERIOD_MS = 15_000; // 启动后 15 秒内不允许降级

// 加载缓存的 AI 总结
const cachedSummary = loadDailySummaryCache();

export const useCrawlerStore = create<CrawlerStore>((set, get) => ({
	// 插件初始状态
	pluginInstalled: false,
	pluginAvailable: false,
	pluginMode: "none",
	pluginChecked: false,
	pluginInstalling: false,
	pluginInstallProgress: { step: "", percent: 0, message: "" },

	// 初始状态
	status: "idle",
	platforms: ["xhs"],  // 默认选中小红书
	crawlerType: "search",
	keywords: "",
	results: [],
	totalCount: 0,
	currentTask: null,
	selectedResult: null,
	configSynced: false,
	dailySummary: cachedSummary.summary,
	dailySummaryLoading: false,
	showDailySummary: false,
	dailySummaryCacheDate: cachedSummary.date,
	videoDownloadProgress: {
		isDownloading: false,
		current: 0,
		total: 0,
		currentTitle: "",
		successCount: 0,
		failedCount: 0,
		message: "",
	},
	extractedKeywords: [],
	excludedKeywords: [],
	extractingKeywords: false,
	viewedItems: loadViewedItems(),

	// ======================== 插件操作 ========================

	// 检查插件安装状态
	checkPluginStatus: async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/plugins/media-crawler/status`);
			if (response.ok) {
				const data = await response.json();
				set({
					pluginInstalled: data.installed ?? false,
					pluginAvailable: data.available ?? false,
					pluginMode: data.mode ?? "none",
					pluginChecked: true,
				});
				console.log("[Crawler] 插件状态:", data);
			} else {
				// 后端 plugin 路由不存在时（旧版后端），默认按开发模式处理
				set({ pluginAvailable: true, pluginMode: "dev", pluginChecked: true });
			}
		} catch (error) {
			console.warn("[Crawler] 检查插件状态失败，默认按可用处理:", error);
			set({ pluginAvailable: true, pluginMode: "dev", pluginChecked: true });
		}
	},

	// 安装插件（流式读取安装进度）
	installPlugin: async (downloadUrl?: string) => {
		set({
			pluginInstalling: true,
			pluginInstallProgress: { step: "downloading", percent: 0, message: "正在准备下载..." },
		});

		try {
			const body: Record<string, string> = {};
			if (downloadUrl) body.download_url = downloadUrl;

			const response = await fetch(`${API_BASE_URL}/api/plugins/media-crawler/install`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.detail || `安装请求失败: HTTP ${response.status}`);
			}

			// 读取 NDJSON 流式进度
			const reader = response.body?.getReader();
			if (!reader) throw new Error("无法读取安装进度流");

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const progress = JSON.parse(line);
						// 后端字段名是 stage，不是 step
						const step = progress.stage || progress.step || "";
						const message = progress.message || "";
						const stagePercent = progress.percent ?? 0;

						// 将各阶段的局部百分比映射为总进度百分比
						// 下载: 0-50%, 解压: 50-70%, 安装依赖: 70-95%, 完成: 100%
						let percent = 0;
						if (step === "downloading") {
							percent = Math.round(stagePercent * 0.5); // 0-50%
						} else if (step === "extracting") {
							percent = 50 + Math.round(stagePercent * 0.2); // 50-70%
						} else if (step === "installing_deps") {
							percent = 70 + Math.round(stagePercent * 0.25); // 70-95%
						} else if (step === "warning") {
							percent = 95;
						} else if (step === "complete") {
							percent = 100;
						} else if (step === "error") {
							percent = 0;
						}

						set({
							pluginInstallProgress: { step, percent, message },
						});

						if (step === "error") {
							throw new Error(message);
						}
					} catch (parseErr) {
						if (parseErr instanceof SyntaxError) {
							console.warn("[Crawler] 解析安装进度失败:", line);
						} else {
							throw parseErr;
						}
					}
				}
			}

			// 安装完成后刷新状态
			await get().checkPluginStatus();
			set({ pluginInstalling: false });
			console.log("[Crawler] 插件安装完成");
		} catch (error) {
			console.error("[Crawler] 安装插件失败:", error);
			set({
				pluginInstalling: false,
				pluginInstallProgress: {
					step: "error",
					percent: 0,
					message: `安装失败: ${error instanceof Error ? error.message : String(error)}`,
				},
			});
		}
	},

	// 卸载插件
	uninstallPlugin: async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/plugins/media-crawler/uninstall`, {
				method: "POST",
			});
			if (response.ok) {
				console.log("[Crawler] 插件已卸载");
			}
			// 刷新插件状态
			await get().checkPluginStatus();
		} catch (error) {
			console.error("[Crawler] 卸载插件失败:", error);
		}
	},

	// ======================== 原有 Actions ========================
	setStatus: (status) => set({ status }),
	setPlatforms: (platforms) => {
		set({ platforms });
		// 同步到后端
		get().syncConfigToBackend();
	},
	togglePlatform: (platform) => {
		const { platforms } = get();
		let newPlatforms: CrawlerPlatform[];

		if (platforms.includes(platform)) {
			// 如果已选中，则取消选中（但至少保留一个）
			if (platforms.length > 1) {
				newPlatforms = platforms.filter(p => p !== platform);
			} else {
				// 至少保留一个平台
				return;
			}
		} else {
			// 如果未选中，则添加
			newPlatforms = [...platforms, platform];
		}

		set({ platforms: newPlatforms });
		// 同步到后端
		get().syncConfigToBackend();
	},
	setCrawlerType: (type) => {
		set({ crawlerType: type });
		// 同步到后端
		get().syncConfigToBackend();
	},
	setKeywords: (keywords) => set({ keywords }),
	setResults: (results) => set({ results, totalCount: results.length }),
	addResults: (newResults) => set((state) => ({
		results: [...state.results, ...newResults],
		totalCount: state.totalCount + newResults.length,
	})),
	setSelectedResult: (result) => set({ selectedResult: result }),
	setCurrentTask: (task) => set({ currentTask: task }),
	clearResults: () => set({ results: [], totalCount: 0 }),

	// 同步关键词到后端
	syncKeywordsToBackend: async (keywords: string) => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/config/keywords`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ keywords }),
			});
			if (response.ok) {
				console.log("[Crawler] 关键词已同步到后端:", keywords);
			}
		} catch (error) {
			console.error("[Crawler] 同步关键词失败:", error);
		}
	},

	// 同步所有配置到后端
	syncConfigToBackend: async () => {
		const { platforms, crawlerType } = get();
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/config`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					platform: platforms[0],  // 兼容旧接口，发送第一个平台
					platforms,  // 新增：发送所有选中的平台
					crawler_type: crawlerType,
				}),
			});
			if (response.ok) {
				set({ configSynced: true });
				console.log("[Crawler] 配置已同步到后端");
			}
		} catch (error) {
			console.error("[Crawler] 同步配置失败:", error);
		}
	},

	// 从后端加载配置
	loadConfigFromBackend: async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/config`);
			if (response.ok) {
				const config = await response.json();
				// 兼容处理：如果后端返回 platforms 数组则使用，否则使用单个 platform
				const platforms = config.platforms || (config.platform ? [config.platform] : ["xhs"]);
				set({
					keywords: config.keywords || "",
					platforms,
					crawlerType: config.crawler_type || "search",
					configSynced: true,
				});
				console.log("[Crawler] 已从后端加载配置:", config);
			}
		} catch (error) {
			console.error("[Crawler] 加载配置失败:", error);
		}
	},

	// 获取爬虫状态
	fetchCrawlerStatus: async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/status`);
			if (response.ok) {
				const data = await response.json();
				// 循环爬取模式下，即使单次爬取完成（crawler_running=false），
				// 只要循环任务还在运行（loop_mode=true），就认为是 running 状态
				const newStatus = (data.crawler_running || data.loop_mode) ? "running" : "idle";

				// 宽限期保护：如果爬虫刚刚启动，后端可能还没来得及拉起进程，
				// 此时不要把前端已设置的 running 状态覆盖回 idle
				const currentStatus = get().status;
				const isInGracePeriod =
					Date.now() - _lastCrawlerStartTime < CRAWLER_START_GRACE_PERIOD_MS;
				if (isInGracePeriod && currentStatus === "running" && newStatus === "idle") {
					console.log("[Crawler] 启动宽限期内，跳过 idle 状态降级");
					// 仍然同步插件状态，但跳过 status 字段
					if (data.plugin_installed !== undefined) {
						set({
							pluginInstalled: data.plugin_installed,
							pluginAvailable: data.plugin_available ?? false,
							pluginMode: data.plugin_mode ?? "none",
							pluginChecked: true,
						} as Partial<CrawlerStore> as CrawlerStore);
					}
					return;
				}

				// 同步插件状态（后端 /api/crawler/status 现在也会返回插件字段）
				const pluginUpdate: Partial<CrawlerStore> = { status: newStatus };
				if (data.plugin_installed !== undefined) {
					pluginUpdate.pluginInstalled = data.plugin_installed;
					pluginUpdate.pluginAvailable = data.plugin_available ?? false;
					pluginUpdate.pluginMode = data.plugin_mode ?? "none";
					pluginUpdate.pluginChecked = true;
				}
				set(pluginUpdate as CrawlerStore);
			}
		} catch (error) {
			console.error("[Crawler] 获取状态失败:", error);
		}
	},

	// 启动爬虫（调用后端 API，支持多平台循环爬取）
	startCrawler: async () => {
		const { keywords, platforms, crawlerType, syncKeywordsToBackend, extractedKeywords, excludedKeywords } = get();

		// 优先使用提取的关键词，如果没有则使用输入框中的关键词
		const finalKeywords = extractedKeywords.length > 0
			? extractedKeywords.join(",")
			: keywords.trim();

		if (!finalKeywords) {
			console.warn("[Crawler] 关键词为空，无法启动爬虫");
			return;
		}

		if (platforms.length === 0) {
			console.warn("[Crawler] 未选择平台，无法启动爬虫");
			return;
		}

		// 先同步关键词到配置文件
		await syncKeywordsToBackend(finalKeywords);

		// 注意：不清除提取的关键词，以便用户可以看到当前爬取使用的关键词
		// clearExtractedKeywords();

		// 创建任务（使用第一个平台）
		const task: CrawlerTask = {
			id: `task-${Date.now()}`,
			platform: platforms[0],
			type: crawlerType,
			keywords: finalKeywords,
			status: "running",
			progress: 0,
			totalCount: 0,
			crawledCount: 0,
			startTime: new Date().toISOString(),
		};

		// 记录启动时间，防止轮询在宽限期内将状态降级
		_lastCrawlerStartTime = Date.now();
		set({ status: "running", currentTask: task, results: [], totalCount: 0 });

		try {
			// 调用后端 API 启动循环爬虫（传递多平台和排除关键词）
			const response = await fetch(`${API_BASE_URL}/api/crawler/start`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					platforms,  // 传递多平台数组
					crawler_type: crawlerType,
					excluded_keywords: excludedKeywords,  // 传递排除关键词
				}),
			});

			const data = await response.json();

			if (data.success) {
				console.log("[Crawler] 循环爬虫启动成功:", data);
				// 启动状态轮询（循环爬取模式下持续轮询，定期刷新结果）
				let lastRefreshTime = Date.now();
				const REFRESH_INTERVAL = 30000;  // 每30秒自动刷新一次结果

				const pollStatus = async () => {
					const currentStatus = get().status;
					if (currentStatus !== "running") return;

					try {
						const statusResponse = await fetch(`${API_BASE_URL}/api/crawler/status`);
						if (statusResponse.ok) {
							const statusData = await statusResponse.json();

							// 循环爬取模式：只有当 loop_mode 为 false 且爬虫不在运行时才认为完成
							const isLoopMode = statusData.loop_mode;
							const isCrawlerRunning = statusData.crawler_running;

							if (!isLoopMode && !isCrawlerRunning && get().status === "running") {
								// 循环爬取已停止（用户手动停止或发生错误）
								set((state) => ({
									status: "idle",
									currentTask: state.currentTask ? {
										...state.currentTask,
										status: "idle",
										progress: 100,
										endTime: new Date().toISOString(),
									} : null,
								}));
								// 最终刷新结果
								console.log("[Crawler] 循环爬取已停止，刷新最终结果");
								get().refreshResults();
								return;
							}

							// 循环爬取模式下，定期刷新结果
							if (isLoopMode && Date.now() - lastRefreshTime > REFRESH_INTERVAL) {
								console.log("[Crawler] 循环爬取中，定期刷新结果...");
								get().refreshResults();
								lastRefreshTime = Date.now();
							}
						}
					} catch (error) {
						console.error("[Crawler] 轮询状态失败:", error);
					}

					// 继续轮询
					setTimeout(pollStatus, 3000);
				};

				// 开始轮询
				setTimeout(pollStatus, 5000);
			} else {
				console.error("[Crawler] 爬虫启动失败:", data.error);
				set((state) => ({
					status: "error",
					currentTask: state.currentTask ? {
						...state.currentTask,
						status: "error",
						error: data.error,
					} : null,
				}));
			}
		} catch (error) {
			console.error("[Crawler] 启动爬虫请求失败:", error);
			set((state) => ({
				status: "error",
				currentTask: state.currentTask ? {
					...state.currentTask,
					status: "error",
					error: String(error),
				} : null,
			}));
		}
	},

	// 停止爬虫
	stopCrawler: async () => {
		// 清除启动宽限期，允许状态立即降级为 idle
		_lastCrawlerStartTime = 0;
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/stop`, {
				method: "POST",
			});

			const data = await response.json();

			if (data.success) {
				console.log("[Crawler] 爬虫已停止");
			}
		} catch (error) {
			console.error("[Crawler] 停止爬虫失败:", error);
		}

		set((state) => ({
			status: "idle",
			currentTask: state.currentTask ? {
				...state.currentTask,
				status: "paused",
			} : null,
		}));
	},

	refreshResults: async () => {
		const { platforms, showDailySummary } = get();

		// 如果热点速递面板正在显示，不刷新结果（避免覆盖所有平台的数据）
		if (showDailySummary) {
			console.log("[Crawler] 热点速递模式，跳过刷新结果");
			return;
		}

		// 注意：不修改 status 状态，status 只反映实际的爬虫运行状态
		// 由 fetchCrawlerStatus 从后端获取真实状态

		try {
			// 获取所有选中平台的结果
			const allResults: CrawlResultItem[] = [];

			for (const platform of platforms) {
				const response = await fetch(
					`${API_BASE_URL}/api/crawler/results?platform=${platform}&limit=100&include_comments=true`
				);

				if (response.ok) {
					const data = await response.json();
					if (data.success && data.results) {
						allResults.push(...data.results);
						console.log(`[Crawler] 平台 ${platform} 加载 ${data.results.length} 条结果`);
					}
				}
			}

			// 按时间排序（最新的在前）
			allResults.sort((a, b) => {
				const timeA = new Date(a.time || 0).getTime();
				const timeB = new Date(b.time || 0).getTime();
				return timeB - timeA;
			});

			set({
				results: allResults,
				totalCount: allResults.length,
			});
			console.log(`[Crawler] 已加载 ${allResults.length} 条爬取结果（${platforms.length} 个平台）`);
		} catch (error) {
			console.error("[Crawler] 刷新结果失败:", error);
		}
	},

	// 今日总结操作（带缓存：当天重复点击直接显示缓存）
	fetchDailySummary: async () => {
		const { dailySummary, dailySummaryCacheDate, refreshDailySummary, loadAllPlatformResults } = get();

		// 获取今天的日期（格式：YYYY-MM-DD）
		const today = new Date().toISOString().split("T")[0];

		// 如果已有当天的缓存，直接显示，但仍需加载所有平台数据
		if (dailySummaryCacheDate === today && dailySummary && !dailySummary.startsWith("## 获取总结失败")) {
			console.log("[Crawler] 使用缓存的今日总结");
			set({
				showDailySummary: true,
				selectedResult: null,
			});
			// 仍然需要加载所有平台的数据用于热点速递显示
			await loadAllPlatformResults();
			console.log("[Crawler] 已加载所有平台数据（使用缓存摘要）");
			return;
		}

		// 没有缓存或不是当天的，调用刷新函数生成新的总结
		await refreshDailySummary();
	},

	// 强制刷新今日总结（忽略缓存）
	refreshDailySummary: async () => {
		const { downloadTodayVideos, loadAllPlatformResults } = get();
		const today = new Date().toISOString().split("T")[0];

		set({
			dailySummaryLoading: true,
			dailySummary: "## 正在加载所有平台数据...\n\n请稍候，正在获取今日所有平台的爬取内容...",
			showDailySummary: true,
			selectedResult: null,  // 清除选中的结果，显示总结面板
		});

		try {
			// 首先加载所有平台的数据（用于热点速递显示）
			await loadAllPlatformResults();
			console.log("[Crawler] 已加载所有平台数据");

			// 下载今日视频（不阻塞，在后台进行）
			downloadTodayVideos().then(() => {
				console.log("[Crawler] 视频下载任务完成");
			}).catch((err) => {
				console.error("[Crawler] 视频下载失败:", err);
			});

			// 稍等一下再开始生成总结
			await new Promise(resolve => setTimeout(resolve, 300));

			set({ dailySummary: "" });  // 清空提示，准备显示总结

			const response = await fetch(`${API_BASE_URL}/api/crawler/daily-summary`);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error("无法读取响应流");
			}

			const decoder = new TextDecoder();
			let summary = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				summary += chunk;

				// 实时更新总结内容
				set({ dailySummary: summary });
			}

			// 保存缓存日期（内存 + localStorage）
			set({ dailySummaryCacheDate: today });
			saveDailySummaryCache(summary, today);
			console.log("[Crawler] 今日总结生成完成，已缓存到 localStorage");
		} catch (error) {
			console.error("[Crawler] 获取今日总结失败:", error);
			set({ dailySummary: `## 获取总结失败\n\n${error}` });
		} finally {
			set({ dailySummaryLoading: false });
		}
	},

	setShowDailySummary: (show: boolean) => {
		set({ showDailySummary: show });
		if (show) {
			set({ selectedResult: null });
		}
	},

	closeDailySummary: () => {
		// 关闭时不清空内容，保留缓存以便下次快速显示
		set({ showDailySummary: false });
	},

	// 加载所有平台的今日数据（用于热点速递）
	loadAllPlatformResults: async () => {
		// 所有支持的平台
		const allPlatforms: CrawlerPlatform[] = ["xhs", "douyin", "bilibili", "weibo", "kuaishou", "zhihu", "tieba"];

		try {
			const allResults: CrawlResultItem[] = [];

			// 并行请求所有平台的数据
			const promises = allPlatforms.map(async (platform) => {
				try {
					const response = await fetch(
						`${API_BASE_URL}/api/crawler/results?platform=${platform}&limit=100&include_comments=true`
					);

					if (response.ok) {
						const data = await response.json();
						if (data.success && data.results) {
							return data.results as CrawlResultItem[];
						}
					}
				} catch (error) {
					console.warn(`[Crawler] 加载平台 ${platform} 数据失败:`, error);
				}
				return [];
			});

			const resultsArrays = await Promise.all(promises);

			// 合并所有结果
			for (const results of resultsArrays) {
				allResults.push(...results);
			}

			// 按互动量排序（点赞 + 评论*2 + 收藏*1.5）
			allResults.sort((a, b) => {
				const scoreA = (a.likedCount || 0) + (a.commentCount || 0) * 2 + (a.collectedCount || 0) * 1.5;
				const scoreB = (b.likedCount || 0) + (b.commentCount || 0) * 2 + (b.collectedCount || 0) * 1.5;
				return scoreB - scoreA;
			});

			set({
				results: allResults,
				totalCount: allResults.length,
			});

			console.log(`[Crawler] 已加载所有平台数据，共 ${allResults.length} 条`);
		} catch (error) {
			console.error("[Crawler] 加载所有平台数据失败:", error);
		}
	},

	// 下载今日视频
	downloadTodayVideos: async () => {
		set({
			videoDownloadProgress: {
				isDownloading: true,
				current: 0,
				total: 0,
				currentTitle: "准备下载...",
				successCount: 0,
				failedCount: 0,
				message: "正在获取今日视频列表...",
			},
		});

		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/download-today-videos`, {
				method: "POST",
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error("无法读取响应流");
			}

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// 按行处理 NDJSON
				const lines = buffer.split("\n");
				buffer = lines.pop() || ""; // 保留最后一个不完整的行

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const data = JSON.parse(line);

						if (data.type === "start") {
							set((state) => ({
								videoDownloadProgress: {
									...state.videoDownloadProgress,
									total: data.total,
									message: data.message,
								},
							}));
						} else if (data.type === "progress") {
							set((state) => ({
								videoDownloadProgress: {
									...state.videoDownloadProgress,
									current: data.current,
									currentTitle: data.title,
									message: `正在下载: ${data.title}`,
								},
							}));
						} else if (data.type === "complete") {
							set((state) => ({
								videoDownloadProgress: {
									...state.videoDownloadProgress,
									isDownloading: false,
									successCount: data.success,
									failedCount: data.failed,
									message: data.message,
								},
							}));
						}
					} catch (parseError) {
						console.warn("[Crawler] 解析下载进度失败:", parseError);
					}
				}
			}

			console.log("[Crawler] 今日视频下载完成");
		} catch (error) {
			console.error("[Crawler] 下载今日视频失败:", error);
			set((state) => ({
				videoDownloadProgress: {
					...state.videoDownloadProgress,
					isDownloading: false,
					message: `下载失败: ${error}`,
				},
			}));
		}
	},

	// 关键词提取方法
	extractKeywords: async (text: string) => {
		if (!text.trim()) {
			set({ extractedKeywords: [], excludedKeywords: [], extractingKeywords: false });
			return;
		}

		set({ extractingKeywords: true });

		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/extract-keywords`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text }),
			});

			if (response.ok) {
				const data = await response.json();
				set({
					extractedKeywords: data.keywords || [],
					excludedKeywords: data.excluded_keywords || [],
					extractingKeywords: false
				});
				console.log("[Crawler] 提取关键词成功:", data.keywords, "排除:", data.excluded_keywords);
			} else {
				// LLM 服务可能暂时不可用，静默处理，不影响用户使用
				console.log("[Crawler] 关键词提取服务暂时不可用，将使用原始输入");
				set({ extractingKeywords: false });
			}
		} catch {
			// 网络错误或超时，静默处理
			console.log("[Crawler] 关键词提取请求失败，将使用原始输入");
			set({ extractingKeywords: false });
		}
	},

	setExtractedKeywords: (keywords: string[]) => set({ extractedKeywords: keywords }),

	setExcludedKeywords: (keywords: string[]) => set({ excludedKeywords: keywords }),

	clearExtractedKeywords: () => set({ extractedKeywords: [], excludedKeywords: [], extractingKeywords: false }),

	// 已查看内容操作
	markAsViewed: (id: string) => {
		const { viewedItems } = get();
		const newViewedItems = new Set(viewedItems);
		newViewedItems.add(id);
		saveViewedItems(newViewedItems);
		set({ viewedItems: newViewedItems });
	},

	isViewed: (id: string) => {
		const { viewedItems } = get();
		return viewedItems.has(id);
	},
}));
