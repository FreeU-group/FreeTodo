"use client";

import { create } from "zustand";

// 爬取结果类型
export interface CrawlResult {
	note_id: string;
	type: string;
	title: string;
	desc: string;
	nickname: string;
	avatar: string;
	liked_count: string;
	collected_count: string;
	comment_count: string;
	share_count?: string;
	note_url: string;
	tag_list: string;
	image_list?: string;
	video_url?: string;
}

interface CrawlerDetailStore {
	// 当前选中的内容
	selectedItem: CrawlResult | null;
	// 设置选中的内容
	setSelectedItem: (item: CrawlResult | null) => void;
	// 清除选中的内容
	clearSelectedItem: () => void;
}

export const useCrawlerDetailStore = create<CrawlerDetailStore>((set) => ({
	selectedItem: null,
	setSelectedItem: (item) => set({ selectedItem: item }),
	clearSelectedItem: () => set({ selectedItem: null }),
}));
