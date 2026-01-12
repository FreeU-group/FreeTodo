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

// 从环境变量读取 API 地址，如果读不到就使用 localhost:8100（Build 模式默认端口）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";
const apiUrl = new URL(API_BASE_URL);

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
				destination: `${API_BASE_URL}/api/:path*`,
			},
			{
				source: "/assets/:path*",
				destination: `${API_BASE_URL}/assets/:path*`,
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
