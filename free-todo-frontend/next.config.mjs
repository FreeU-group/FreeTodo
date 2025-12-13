/** @type {import('next').NextConfig} */
// 从环境变量读取 API 地址，如果读不到就使用 localhost:8000
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const apiUrl = new URL(API_BASE_URL);

const nextConfig = {
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
				protocol: apiUrl.protocol.replace(":", ""),
				hostname: apiUrl.hostname,
				port: apiUrl.port || undefined,
				pathname: "/api/**",
			},
		],
	},
};

export default nextConfig;
