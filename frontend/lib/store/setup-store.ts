import { create } from "zustand";

export interface SetupState {
	currentStep: number;
	totalSteps: number;
	/** Data collected across steps */
	apiKey: string;
	apiBaseUrl: string;
	apiModel: string;
	scanDirectory: string;
	userName: string;
	agentName: string;

	setStep: (step: number) => void;
	nextStep: () => void;
	prevStep: () => void;
	setApiKey: (v: string) => void;
	setApiBaseUrl: (v: string) => void;
	setApiModel: (v: string) => void;
	setScanDirectory: (v: string) => void;
	setUserName: (v: string) => void;
	setAgentName: (v: string) => void;
}

export const useSetupStore = create<SetupState>()((set) => ({
	currentStep: 0,
	totalSteps: 6,
	apiKey: "",
	apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
	apiModel: "qwen-plus",
	scanDirectory: "",
	userName: "",
	agentName: "Free U",

	setStep: (step) => set({ currentStep: step }),
	nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, s.totalSteps - 1) })),
	prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
	setApiKey: (v) => set({ apiKey: v }),
	setApiBaseUrl: (v) => set({ apiBaseUrl: v }),
	setApiModel: (v) => set({ apiModel: v }),
	setScanDirectory: (v) => set({ scanDirectory: v }),
	setUserName: (v) => set({ userName: v }),
	setAgentName: (v) => set({ agentName: v }),
}));
