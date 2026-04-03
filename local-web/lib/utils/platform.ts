/**
 * Platform detection utilities
 *
 * Provides functions to detect the current runtime environment
 * (Tauri, Electron, or Web browser)
 */

/**
 * Check if running in Tauri environment
 */
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

/**
 * Check if running in Electron environment
 */
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' &&
    typeof (window as Window & { process?: { type?: string } }).process !== 'undefined' &&
    (window as Window & { process?: { type?: string } }).process?.type === 'renderer';
};

/**
 * Check if running in a desktop environment (Tauri or Electron)
 */
export const isDesktop = (): boolean => {
  return isTauri() || isElectron();
};

/**
 * Check if running in a web browser (not Tauri or Electron)
 */
export const isWeb = (): boolean => {
  return typeof window !== 'undefined' && !isDesktop();
};

/**
 * Get current platform type
 */
export type PlatformType = 'tauri' | 'electron' | 'web';

export const getPlatform = (): PlatformType => {
  if (isTauri()) return 'tauri';
  if (isElectron()) return 'electron';
  return 'web';
};

/**
 * Get operating system
 */
export type OSType = 'windows' | 'macos' | 'linux' | 'unknown';

export const getOS = (): OSType => {
  if (typeof window === 'undefined') return 'unknown';

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (userAgent.includes('win')) return 'windows';
  if (userAgent.includes('mac')) return 'macos';
  if (userAgent.includes('linux')) return 'linux';

  return 'unknown';
};

/**
 * Check if running on macOS
 */
export const isMacOS = (): boolean => getOS() === 'macos';

/**
 * Check if running on Windows
 */
export const isWindows = (): boolean => getOS() === 'windows';

/**
 * Check if running on Linux
 */
export const isLinux = (): boolean => getOS() === 'linux';
