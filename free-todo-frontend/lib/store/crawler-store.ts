"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CrawlerConfig {
	// 平台
	platform: string;
	// 爬取类型
	crawlerType: string;
	// 登录方式
	loginType: string;
	// 保存格式
	saveOption: string;
	// 无头模式
	headless: boolean;
	// 采集评论
	enableComments: boolean;
}

interface CrawlerStore extends CrawlerConfig {
	// 更新配置
	setPlatform: (platform: string) => void;
	setCrawlerType: (crawlerType: string) => void;
	setLoginType: (loginType: string) => void;
	setSaveOption: (saveOption: string) => void;
	setHeadless: (headless: boolean) => void;
	setEnableComments: (enableComments: boolean) => void;
}

export const useCrawlerStore = create<CrawlerStore>()(
	persist(
		(set) => ({
			// 默认值
			platform: "xhs",
			crawlerType: "search",
			loginType: "qrcode",
			saveOption: "json",
			headless: false,
			enableComments: true,

			// 更新方法
			setPlatform: (platform) => set({ platform }),
			setCrawlerType: (crawlerType) => set({ crawlerType }),
			setLoginType: (loginType) => set({ loginType }),
			setSaveOption: (saveOption) => set({ saveOption }),
			setHeadless: (headless) => set({ headless }),
			setEnableComments: (enableComments) => set({ enableComments }),
		}),
		{
			name: "crawler-config",
		}
	)
);
