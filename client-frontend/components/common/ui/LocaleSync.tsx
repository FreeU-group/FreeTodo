"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";
import { useLocaleStore } from "@/lib/store/locale";

/**
 * 同步 locale 到 cookie
 * 确保在刷新前 cookie 已经被正确设置
 */
function syncLocaleToCookie(locale: string) {
	if (typeof document === "undefined") return;
	// 使用 document.cookie 设置（兼容所有浏览器）
	// biome-ignore lint/suspicious/noDocumentCookie: 需要直接设置 cookie 来同步语言
	document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

/**
 * 语言同步组件
 *
 * 解决首次访问时语言不一致的问题：
 * - 服务端渲染时，cookie 为空，使用默认语言 (en)
 * - 客户端 hydration 后，store 检测系统语言并设置 cookie
 * - 此时页面已经用默认语言渲染，需要刷新以应用正确的语言
 *
 * 此组件在 hydration 完成后检测不一致并自动刷新页面
 * 重要：必须等待 Zustand store hydration 完成后再执行，否则会读取到未 hydrate 的初始值
 */
export function LocaleSync() {
	const router = useRouter();
	// 服务端渲染时使用的 locale（来自 cookie 或默认值）
	const serverLocale = useLocale();
	// 客户端 store 中的 locale（可能是检测系统语言得到的）
	const storeLocale = useLocaleStore((state) => state.locale);
	// 等待 store hydration 完成
	const hasHydrated = useLocaleStore((state) => state._hasHydrated);
	const hasRefreshed = useRef(false);

	useEffect(() => {
		// 必须等待 hydration 完成，否则 storeLocale 可能是未 hydrate 的初始值
		if (!hasHydrated) return;

		// 只在第一次检测到不一致时刷新，避免无限刷新
		if (!hasRefreshed.current && serverLocale !== storeLocale) {
			hasRefreshed.current = true;
			// 确保 cookie 已设置为正确的 locale
			syncLocaleToCookie(storeLocale);
			// 使用 router.refresh() 重新获取服务端数据
			router.refresh();
		}
	}, [serverLocale, storeLocale, hasHydrated, router]);

	return null;
}
