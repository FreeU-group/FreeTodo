import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ActivityStoreState {
	selectedActivityId: number | null;
	search: string;
	setSelectedActivityId: (id: number | null) => void;
	setSearch: (search: string) => void;
}

export const useActivityStore = create<ActivityStoreState>()(
	persist(
		(set) => ({
			selectedActivityId: null,
			search: "",
			setSelectedActivityId: (id) => set({ selectedActivityId: id }),
			setSearch: (search) => set({ search }),
		}),
		{
			name: "activity-config",
			storage: createJSONStorage(() => {
				return {
					getItem: (name: string): string | null => {
						if (typeof window === "undefined") return null;

						try {
							const stored = localStorage.getItem(name);
							if (!stored) return null;

							const parsed = JSON.parse(stored);
							const state = parsed.state || parsed;

							// 验证 selectedActivityId
							let selectedActivityId: number | null = null;
							if (
								state.selectedActivityId !== null &&
								state.selectedActivityId !== undefined
							) {
								const id =
									typeof state.selectedActivityId === "number"
										? state.selectedActivityId
										: Number.parseInt(String(state.selectedActivityId), 10);
								if (!Number.isNaN(id) && Number.isFinite(id) && id > 0) {
									selectedActivityId = id;
								}
							}

							// 验证 search
							const search: string =
								typeof state.search === "string" ? state.search : "";

							return JSON.stringify({
								state: {
									selectedActivityId,
									search,
								},
							});
						} catch (e) {
							console.error("Error loading activity config:", e);
							return null;
						}
					},
					setItem: (name: string, value: string): void => {
						if (typeof window === "undefined") return;

						try {
							localStorage.setItem(name, value);
						} catch (e) {
							console.error("Error saving activity config:", e);
						}
					},
					removeItem: (name: string): void => {
						if (typeof window === "undefined") return;
						localStorage.removeItem(name);
					},
				};
			}),
		},
	),
);
