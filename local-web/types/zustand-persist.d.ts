// Zustand 5 persist middleware module augmentation fix for TypeScript 5.9+
//
// The `declare module '../vanilla'` in zustand/middleware/persist.d.ts uses a
// relative specifier that TS 5.9 no longer resolves correctly under
// `moduleResolution: "bundler"`.  Re-declaring the augmentation with the full
// package path restores `StoreMutatorIdentifier` so that
// `create<T>()(persist(...))` type-checks again.

import type { PersistOptions } from "zustand/middleware";

type PersistListener<S> = (state: S) => void;

type StorePersist<S, Ps, Pr> = S extends {
	getState: () => infer T;
	setState: {
		(...args: infer Sa1): infer Sr1;
		(...args: infer Sa2): infer Sr2;
	};
}
	? {
			setState(...args: Sa1): Sr1 | Pr;
			setState(...args: Sa2): Sr2 | Pr;
			persist: {
				setOptions: (options: Partial<PersistOptions<T, Ps, Pr>>) => void;
				clearStorage: () => void;
				rehydrate: () => Promise<void> | void;
				hasHydrated: () => boolean;
				onHydrate: (fn: PersistListener<T>) => () => void;
				onFinishHydration: (fn: PersistListener<T>) => () => void;
				getOptions: () => Partial<PersistOptions<T, Ps, Pr>>;
			};
		}
	: never;

type Write<T, U> = Omit<T, keyof U> & U;

declare module "zustand/vanilla" {
	interface StoreMutators<S, A> {
		"zustand/persist": Write<S, StorePersist<S, A, unknown>>;
	}
}
