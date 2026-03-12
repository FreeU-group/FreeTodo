import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

// 获取版本信息
const packageJson = require("./package.json");
const APP_VERSION = packageJson.version;

// 获取 Git Commit Hash（取前 8 位）
let GIT_COMMIT = "unknown";
try {
	GIT_COMMIT = execSync("git rev-parse HEAD").toString().trim().slice(0, 8);
} catch {
	console.warn("无法获取 Git commit hash");
}

// 判断是 build 版还是 dev 版
const BUILD_TYPE = process.env.NODE_ENV === "production" ? "build" : "dev";

// Client-side streaming (NEXT_PUBLIC_*) vs server-side rewrite (API_REWRITE_URL)
// NEXT_PUBLIC_API_URL is baked into client JS and used by getStreamApiBaseUrl().
// API_REWRITE_URL is server-only and used for Next.js rewrites (can be localhost).
const CLIENT_API_URL =
	process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
const REWRITE_API_URL =
	process.env.API_REWRITE_URL || CLIENT_API_URL;
const apiUrl = new URL(CLIENT_API_URL);

const nextConfig: NextConfig = {
	output: "standalone",
	reactStrictMode: true,
	typedRoutes: true,
	// 注入版本信息到客户端环境变量
	env: {
		NEXT_PUBLIC_APP_VERSION: APP_VERSION,
		NEXT_PUBLIC_GIT_COMMIT: GIT_COMMIT,
		NEXT_PUBLIC_BUILD_TYPE: BUILD_TYPE,
	},
	// 增加代理超时时间到 120 秒，避免 LLM 调用超时
	experimental: {
		proxyTimeout: 120000, // 120 秒
	},
	// 在 Electron 环境中禁用 SSR，避免窗口显示问题
	// 注意：这会影响 SEO，但对于 Electron 应用来说不是问题
	...(process.env.ELECTRON === "true"
		? {
				// 可以在这里添加 Electron 特定的配置
			}
		: {}),
	async rewrites() {
		return [
			{
				source: "/api/:path*",
				destination: `${REWRITE_API_URL}/api/:path*`,
			},
			{
				source: "/assets/:path*",
				destination: `${REWRITE_API_URL}/assets/:path*`,
			},
		];
	},
	images: {
		remotePatterns: [
			{
				protocol: apiUrl.protocol.replace(":", "") as "http" | "https",
				hostname: apiUrl.hostname,
				port: apiUrl.port || undefined,
				pathname: "/api/**",
			},
		],
	},
};

export default withNextIntl(nextConfig);
