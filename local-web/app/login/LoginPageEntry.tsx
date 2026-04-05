"use client";

import dynamic from "next/dynamic";

const LoginPageClient = dynamic(() => import("./LoginPageClient"), {
	ssr: false,
	loading: () => (
		<div className="flex min-h-screen items-center justify-center bg-background" />
	),
});

export function LoginPageEntry() {
	return <LoginPageClient />;
}
