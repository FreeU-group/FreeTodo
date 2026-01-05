/**
 * Toast 通知统一配置
 *
 * 使用 sonner 库提供统一的 toast 通知样式和配置
 */

import { toast as sonnerToast } from "sonner";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";

/**
 * Toast 配置选项
 */
interface ToastOptions {
	description?: string;
	duration?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
	success: {
		duration: 3000, // 成功消息 3 秒后消失
	},
	error: {
		duration: 4000, // 错误消息 4 秒后消失
	},
	warning: {
		duration: 4000, // 警告消息 4 秒后消失
	},
	info: {
		duration: 3000, // 信息消息 3 秒后消失
	},
};

/**
 * 获取翻译文本
 */
function getT() {
	const locale = useLocaleStore.getState().locale;
	return useTranslations(locale);
}

/**
 * 统一的 Toast 通知工具
 */
export const toast = {
	/**
	 * 成功通知
	 */
	success: (message: string, options?: ToastOptions) => {
		return sonnerToast.success(message, {
			duration: DEFAULT_CONFIG.success.duration,
			...options,
		});
	},

	/**
	 * 错误通知
	 */
	error: (message: string, options?: ToastOptions) => {
		return sonnerToast.error(message, {
			duration: DEFAULT_CONFIG.error.duration,
			...options,
		});
	},

	/**
	 * 警告通知
	 */
	warning: (message: string, options?: ToastOptions) => {
		return sonnerToast.warning(message, {
			duration: DEFAULT_CONFIG.warning.duration,
			...options,
		});
	},

	/**
	 * 信息通知
	 */
	info: (message: string, options?: ToastOptions) => {
		return sonnerToast.info(message, {
			duration: DEFAULT_CONFIG.info.duration,
			...options,
		});
	},

	/**
	 * 配置保存成功通知
	 */
	configSaved: () => {
		const t = getT();
		return toast.success(t.toast.configSaved, {
			description: t.toast.configSavedDesc,
			duration: DEFAULT_CONFIG.success.duration,
		});
	},

	/**
	 * 配置保存失败通知
	 */
	configSaveFailed: (error?: string) => {
		const t = getT();
		return toast.error(t.toast.configSaveFailed, {
			description: error || t.toast.configSaveFailedDesc,
			duration: DEFAULT_CONFIG.error.duration,
		});
	},

	/**
	 * 配置加载失败通知
	 */
	configLoadFailed: (error?: string) => {
		const t = getT();
		return toast.error(t.toast.configLoadFailed, {
			description: error || t.toast.configLoadFailedDesc,
			duration: DEFAULT_CONFIG.error.duration,
		});
	},

	/**
	 * 事件选择达到上限通知
	 */
	eventLimitReached: () => {
		const t = getT();
		return toast.warning(t.toast.eventLimitReached, {
			description: t.toast.eventLimitReachedDesc,
			duration: DEFAULT_CONFIG.warning.duration,
		});
	},
};
