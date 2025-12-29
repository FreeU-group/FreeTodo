"use client";

import { DynamicIsland } from './DynamicIsland';
import { IslandMode } from './types';
import { useDynamicIslandStore } from '@/lib/store/dynamic-island-store';

export function DynamicIslandProvider() {
  const { mode, isEnabled, setMode } = useDynamicIslandStore();
  
  if (!isEnabled) {
    return null;
  }
  
  return (
    <DynamicIsland 
      mode={mode}
      onModeChange={setMode}
      onClose={() => {
        setMode(IslandMode.FLOAT);
      }}
    />
  );
}

