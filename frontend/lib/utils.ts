import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 格式化日期时间
export function formatDateTime(date: string | Date, format = 'YYYY-MM-DD HH:mm:ss'): string {
  return dayjs(date).format(format);
}

// 格式化相对时间
export function formatRelativeTime(date: string | Date, timeTranslations?: any): string {
  const now = dayjs();
  const target = dayjs(date);
  const diff = now.diff(target, 'second');

  // 如果没有提供翻译，使用中文默认值（向后兼容）
  if (!timeTranslations) {
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    return target.format('YYYY-MM-DD HH:mm');
  }

  // 使用提供的翻译
  if (diff < 60) return timeTranslations.justNow;
  if (diff < 3600) return timeTranslations.minutesAgo.replace('{count}', Math.floor(diff / 60).toString());
  if (diff < 86400) return timeTranslations.hoursAgo.replace('{count}', Math.floor(diff / 3600).toString());
  if (diff < 604800) return timeTranslations.daysAgo.replace('{count}', Math.floor(diff / 86400).toString());

  return target.format('YYYY-MM-DD HH:mm');
}

// 计算时长（秒）
export function calculateDuration(startTime: string, endTime: string): number {
  const start = dayjs(startTime);
  const end = dayjs(endTime);
  const seconds = end.diff(start, 'second');
  // 不足1秒算1秒，使用进一法
  return Math.max(1, seconds);
}

// 格式化时长
export function formatDuration(seconds: number, timeTranslations?: any): string {
  // 不足1秒算1秒
  if (seconds < 1) {
    seconds = 1;
  }

  // 计算各个时间单位
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // 如果没有提供翻译，使用中文默认值（向后兼容）
  if (!timeTranslations) {
    const parts = [];
    if (days > 0) parts.push(`${days} 天`);
    if (hours > 0) parts.push(`${hours} 小时`);
    if (minutes > 0) parts.push(`${minutes} 分钟`);
    if (secs > 0) parts.push(`${secs} 秒`);
    return parts.length > 0 ? parts.join(' ') : '1 秒';
  }

  // 使用提供的翻译
  const parts = [];
  if (days > 0) parts.push(`${days} ${timeTranslations.days}`);
  if (hours > 0) parts.push(`${hours} ${timeTranslations.hours}`);
  if (minutes > 0) parts.push(`${minutes} ${timeTranslations.minutes}`);
  if (secs > 0) parts.push(`${secs} ${timeTranslations.seconds}`);

  // 如果所有单位都是0（理论上不会发生，因为最小是1秒），返回"1 秒"
  return parts.length > 0 ? parts.join(' ') : `1 ${timeTranslations.seconds}`;
}

// 截断文本
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 防抖函数
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
