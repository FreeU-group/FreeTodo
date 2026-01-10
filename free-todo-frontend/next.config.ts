import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

// 从环境变量读取 API 地址，如果读不到就使用 localhost:8001
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const apiUrl = new URL(API_BASE_URL);

const nextConfig: NextConfig = {
	output: "standalone",
	reactStrictMode: true,
	typedRoutes: true,
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
