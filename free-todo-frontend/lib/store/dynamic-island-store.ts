import { create } from 'zustand';
import { IslandMode } from '@/components/DynamicIsland';

interface DynamicIslandState {
  mode: IslandMode;
  isEnabled: boolean;
  setMode: (mode: IslandMode) => void;
  toggleEnabled: () => void;
}

export const useDynamicIslandStore = create<DynamicIslandState>((set) => ({
  mode: IslandMode.FLOAT,
  isEnabled: true, // 默认启用
  setMode: (mode) => set({ mode }),
  toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
}));

