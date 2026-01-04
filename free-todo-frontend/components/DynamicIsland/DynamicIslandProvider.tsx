"use client";

import { DynamicIsland } from './DynamicIsland';
import { IslandMode } from './types';
import { useDynamicIslandStore } from '@/lib/store/dynamic-island-store';

/**
 * 检测是否在 Electron 环境中
 */
function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as any).electronAPI ||
    (window as any).require?.('electron') ||
    navigator.userAgent.includes('Electron')
  );
}

export function DynamicIslandProvider() {
  const { mode, isEnabled, setMode } = useDynamicIslandStore();
  
  // 浏览器模式下不显示灵动岛
  if (!isElectronEnvironment() || !isEnabled) {
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

