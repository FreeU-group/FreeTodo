import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
	const proxyBaseUrl =
		process.env.API_REWRITE_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
	const targetUrl = `${proxyBaseUrl.replace(/\/$/, "")}/ready`;

	try {
		const response = await fetch(targetUrl, {
			cache: "no-store",
			headers: {
				accept: "application/json",
			},
		});
		const contentType = response.headers.get("content-type") || "application/json";
		const body = await response.text();

		return new NextResponse(body, {
			status: response.status,
			headers: {
				"content-type": contentType,
				"cache-control": "no-store",
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			},
			{
				status: 503,
				headers: {
					"cache-control": "no-store",
				},
			},
		);
	}
}
