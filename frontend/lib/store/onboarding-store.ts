import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Onboarding state interface
 * Manages the user onboarding tour state
 */
interface OnboardingState {
	/** Whether the user has completed the onboarding tour */
	hasCompletedTour: boolean;
	/** Current step index (null if not in tour) */
	currentStep: number | null;
	/** Mark the tour as completed */
	completeTour: () => void;
	/** Reset the tour (for testing or re-onboarding) */
	resetTour: () => void;
	/** Set the current step */
	setCurrentStep: (step: number | null) => void;
}

const STORAGE_KEY = "onboarding";

/**
 * Custom storage for onboarding state
 * Persists hasCompletedTour to localStorage
 */
const onboardingStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				return JSON.stringify({
					state: {
						hasCompletedTour: parsed.state?.hasCompletedTour ?? false,
						currentStep: null, // Don't persist currentStep
					},
				});
			}
		} catch (e) {
			console.error("Error reading onboarding state:", e);
		}
		return JSON.stringify({
			state: { hasCompletedTour: false, currentStep: null },
		});
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			// Only persist hasCompletedTour, not currentStep
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					state: {
						hasCompletedTour: data.state?.hasCompletedTour ?? false,
					},
				}),
			);
		} catch (e) {
			console.error("Error saving onboarding state:", e);
		}
	},
	removeItem: () => {
		if (typeof window === "undefined") return;
		localStorage.removeItem(STORAGE_KEY);
	},
};

/**
 * Onboarding store hook
 * Manages the state of the user onboarding tour
 */
export const useOnboardingStore = create<OnboardingState>()(
	persist(
		(set) => ({
			hasCompletedTour: false,
			currentStep: null,

			completeTour: () => {
				set({ hasCompletedTour: true, currentStep: null });
			},

			resetTour: () => {
				set({ hasCompletedTour: false, currentStep: null });
			},

			setCurrentStep: (step: number | null) => {
				set({ currentStep: step });
			},
		}),
		{
			name: STORAGE_KEY,
			storage: createJSONStorage(() => onboardingStorage),
		},
	),
);
