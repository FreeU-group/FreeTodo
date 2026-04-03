import type { StoreApi } from "zustand";
import { LAYOUT_PRESETS } from "./layout-presets";
import type { UiStoreState } from "./types";
import { clampWidth } from "./utils";

type SetState = StoreApi<UiStoreState>["setState"];
type GetState = StoreApi<UiStoreState>["getState"];

export const createLayoutActions = (set: SetState, get: GetState) => ({
	applyLayout: (layoutId: string) => {
		const customLayouts = get().customLayouts;
		const layout =
			LAYOUT_PRESETS.find((preset) => preset.id === layoutId) ||
			customLayouts.find((preset) => preset.id === layoutId);
		if (!layout) return;

		set({
			panelFeatureMap: { ...layout.panelFeatureMap },
			isPanelAOpen: layout.isPanelAOpen,
			isPanelBOpen: layout.isPanelBOpen,
			isPanelCOpen: layout.isPanelCOpen,
			...(layout.panelAWidth !== undefined && {
				panelAWidth: layout.panelAWidth,
			}),
			...(layout.panelCWidth !== undefined && {
				panelCWidth: layout.panelCWidth,
			}),
		});
	},

	saveCustomLayout: (name: string, options?: { overwrite?: boolean }) => {
		const trimmedName = name.trim();
		if (!trimmedName) return false;

		const state = get();
		const nameKey = trimmedName.toLocaleLowerCase();
		const existingIndex = state.customLayouts.findIndex(
			(layout) => layout.name.toLocaleLowerCase() === nameKey,
		);
		const shouldOverwrite = options?.overwrite ?? false;
		if (existingIndex >= 0 && !shouldOverwrite) return false;

		const existing = state.customLayouts[existingIndex];
		const layoutId = existing?.id ?? `custom:${encodeURIComponent(trimmedName)}`;

		const newLayout = {
			id: layoutId,
			name: trimmedName,
			panelFeatureMap: { ...state.panelFeatureMap },
			isPanelAOpen: state.isPanelAOpen,
			isPanelBOpen: state.isPanelBOpen,
			isPanelCOpen: state.isPanelCOpen,
			panelAWidth: clampWidth(state.panelAWidth),
			panelCWidth: clampWidth(state.panelCWidth),
		};

		const nextLayouts = [...state.customLayouts];
		if (existingIndex >= 0) {
			nextLayouts[existingIndex] = newLayout;
		} else {
			nextLayouts.push(newLayout);
		}

		set({ customLayouts: nextLayouts });
		return true;
	},

	renameCustomLayout: (
		layoutId: string,
		name: string,
		options?: { overwrite?: boolean },
	) => {
		const trimmedName = name.trim();
		if (!trimmedName) return false;

		const state = get();
		const nameKey = trimmedName.toLocaleLowerCase();
		const shouldOverwrite = options?.overwrite ?? false;

		const target = state.customLayouts.find((layout) => layout.id === layoutId);
		if (!target) return false;

		const nextLayouts: typeof state.customLayouts = [];
		for (const layout of state.customLayouts) {
			const layoutNameKey = layout.name.toLocaleLowerCase();
			if (layout.id === layoutId) {
				nextLayouts.push({ ...layout, name: trimmedName });
				continue;
			}

			if (layoutNameKey === nameKey) {
				if (!shouldOverwrite) return false;
				continue;
			}

			nextLayouts.push(layout);
		}

		set({ customLayouts: nextLayouts });
		return true;
	},

	deleteCustomLayout: (layoutId: string) =>
		set((state) => ({
			customLayouts: state.customLayouts.filter(
				(layout) => layout.id !== layoutId,
			),
		})),
});
