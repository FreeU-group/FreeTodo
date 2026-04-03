import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { WebSearchSources } from "./utils/messageContentUtils";

type MessageSourcesProps = {
	sources: WebSearchSources;
	messageId: string;
};

export function MessageSources({ sources, messageId }: MessageSourcesProps) {
	const t = useTranslations("chat");

	if (sources.length === 0) {
		return null;
	}

	return (
		<div
			id={`sources-${messageId}`}
			className="mt-4 pt-4 border-t border-border/50 scroll-mt-4"
		>
			<div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
				{t("sources") || "Sources"}
			</div>
			<ul className="space-y-2">
				{sources.map((source, idx) => {
					const sourceId = `source-${messageId}-${idx}`;
					return (
						<li
							key={sourceId}
							id={sourceId}
							className="flex items-start gap-2 scroll-mt-4 transition-all duration-200"
						>
							<span className="text-xs text-muted-foreground mt-0.5">
								{idx + 1}.
							</span>
							<a
								href={source.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-primary hover:underline flex items-center gap-1 flex-1"
							>
								<span>{source.title}</span>
								<ExternalLink className="h-3 w-3" />
							</a>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
