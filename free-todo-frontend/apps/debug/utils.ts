/**
 * Debug Capture 调试面板工具函数
 */

/**
 * 格式化日期为 YYYY-MM-DD（使用本地时区）
 */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * 白名单应用列表
 * 这些应用支持从截图中提取待办事项
 */
export const WHITELIST_APPS = [
	"微信",
	"WeChat",
	"飞书",
	"Feishu",
	"Lark",
	"钉钉",
	"DingTalk",
] as const;

/**
 * 检查应用是否在白名单中
 * @param appName - 应用名称
 * @returns 是否在白名单中
 */
export function isWhitelistApp(appName: string | null | undefined): boolean {
	if (!appName) return false;
	const appLower = appName.toLowerCase();
	return WHITELIST_APPS.some((app) => appLower.includes(app.toLowerCase()));
}
