"use client";

import dynamic from "next/dynamic";
import { FrontendBoot } from "@/components/common/ui/FrontendBoot";

const HomePageClient = dynamic(() => import("./HomePageClient"), {
	ssr: false,
	loading: () => <FrontendBoot />,
});

export function HomePageEntry() {
	return <HomePageClient />;
}
