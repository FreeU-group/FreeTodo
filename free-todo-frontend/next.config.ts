import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// 从环境变量读取 API 地址，如果读不到就使用 localhost:8000
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const apiUrl = new URL(API_BASE_URL);

const nextConfig: NextConfig = {
	output: "standalone",
	reactStrictMode: true,
	typedRoutes: true,
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
