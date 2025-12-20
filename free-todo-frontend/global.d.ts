import type messages from "./messages/zh.json";

type Messages = typeof messages;

declare global {
	// Use type safe message keys with `auto-complete`
	interface IntlMessages extends Messages {}

	// Cookie Store API 类型声明
	interface CookieStoreSetOptions {
		name: string;
		value: string;
		expires?: number | Date;
		maxAge?: number;
		domain?: string;
		path?: string;
		sameSite?: "strict" | "lax" | "none";
		secure?: boolean;
		partitioned?: boolean;
	}

	interface CookieStoreApi {
		set(options: CookieStoreSetOptions): Promise<void>;
		set(name: string, value: string): Promise<void>;
		get(name: string): Promise<{ name: string; value: string } | null>;
		delete(name: string): Promise<void>;
	}

	interface Window {
		cookieStore?: CookieStoreApi;
	}
}
