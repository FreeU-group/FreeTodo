"use client";

import { ImageOff, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface DiaryIllustrationProps {
	dateStr: string;
	exists: boolean;
	generating: boolean;
	onGenerate: () => void;
}

export function DiaryIllustration({
	dateStr,
	exists,
	generating,
	onGenerate,
}: DiaryIllustrationProps) {
	const t = useTranslations("journalPanel");

	if (exists) {
		return (
			<div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border bg-muted/10">
				<div className="relative w-full">
					<Image
						src={`/api/diary-illustration/image/${dateStr}`}
						alt={t("illustrationAlt")}
						width={800}
						height={800}
						className="w-full object-cover"
						unoptimized
					/>
					<div className="absolute bottom-2 right-2">
						<button
							type="button"
							onClick={onGenerate}
							disabled={generating}
							className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-50"
						>
							{generating ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Sparkles className="h-3 w-3" />
							)}
							{t("regenerate")}
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border bg-muted/10">
			<div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
				<ImageOff className="h-8 w-8 text-muted-foreground/30" />
				<p className="text-xs text-muted-foreground">{t("noIllustration")}</p>
				<button
					type="button"
					onClick={onGenerate}
					disabled={generating}
					className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
				>
					{generating ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Sparkles className="h-3.5 w-3.5" />
					)}
					{t("generateIllustration")}
				</button>
			</div>
		</div>
	);
}
