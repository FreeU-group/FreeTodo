import type { PersistOptions } from "zustand/middleware";
import { persist } from "zustand/middleware";
import type { UseBoundStore } from "zustand/react";
import { create } from "zustand/react";
import type { StateCreator, StoreApi } from "zustand/vanilla";

type PersistApi<T, PersistedState> = {
	persist: {
		setOptions: (
			options: Partial<PersistOptions<T, PersistedState>>,
		) => void;
		clearStorage: () => void;
		rehydrate: () => Promise<void> | void;
		hasHydrated: () => boolean;
		onHydrate: (fn: (state: T) => void) => () => void;
		onFinishHydration: (fn: (state: T) => void) => () => void;
		getOptions: () => Partial<PersistOptions<T, PersistedState>>;
	};
};

export type PersistedBoundStore<T, PersistedState = T> = UseBoundStore<
	StoreApi<T>
> &
	PersistApi<T, PersistedState>;

/**
 * Work around local Zustand v5 type inference issues around `persist(...)`.
 * Runtime behavior still uses the official persist middleware unchanged.
 */
export function createPersistedStore<T, PersistedState = T>(
	initializer: StateCreator<T, [], []>,
	options: PersistOptions<T, PersistedState>,
): PersistedBoundStore<T, PersistedState> {
	return create<T>()(
		persist(
			initializer as never,
			options,
		) as unknown as StateCreator<T, [], []>,
	) as PersistedBoundStore<T, PersistedState>;
}
