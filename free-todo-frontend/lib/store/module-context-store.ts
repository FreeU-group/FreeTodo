/**
 * 模块上下文 Store
 * 用于跟踪当前活跃的模块，以便聊天组件根据模块加载对应的提示词和上下文
 */

import { create } from "zustand";

export type ModuleType = "voice" | "event" | "project" | "todo" | null;

interface ModuleContextState {
	currentModule: ModuleType;
	setCurrentModule: (module: ModuleType) => void;

	// 音频模块的转录内容（用于作为聊天上下文）
	voiceTranscripts: Array<{
		timestamp: Date;
		optimizedText?: string;
		rawText: string;
	}>;
	setVoiceTranscripts: (
		transcripts: Array<{
			timestamp: Date;
			optimizedText?: string;
			rawText: string;
		}>,
	) => void;
}

export const useModuleContextStore = create<ModuleContextState>((set) => ({
	currentModule: null,
	setCurrentModule: (module) => set({ currentModule: module }),

	voiceTranscripts: [],
	setVoiceTranscripts: (transcripts) => set({ voiceTranscripts: transcripts }),
}));
