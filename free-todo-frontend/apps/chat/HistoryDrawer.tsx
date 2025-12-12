import { Loader2 } from "lucide-react";
import type { ChatSessionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

type HistoryDrawerProps = {
	historyLoading: boolean;
	historyError: string | null;
	sessions: ChatSessionSummary[];
	conversationId: string | null;
	formatMessageCount: (count?: number) => string;
	labels: {
		recentSessions: string;
		noHistory: string;
		loading: string;
		chatHistory: string;
	};
	onSelectSession: (id: string) => void;
};

export function HistoryDrawer({
	historyLoading,
	historyError,
	sessions,
	conversationId,
	formatMessageCount,
	labels,
	onSelectSession,
}: HistoryDrawerProps) {
	return (
		<div className="border-b border-border bg-muted/40 px-4 py-3">
			<div className="mb-2 flex items-center justify-between">
				<p className="text-sm font-medium text-foreground">
					{labels.recentSessions}
				</p>
				{historyLoading && (
					<span className="flex items-center gap-2 text-xs text-muted-foreground">
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						{labels.loading}
					</span>
				)}
			</div>
			{historyError && (
				<p className="text-xs text-destructive">{historyError}</p>
			)}
			{!historyError && (
				<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
					{!historyLoading && sessions.length === 0 ? (
						<p className="text-xs text-muted-foreground">{labels.noHistory}</p>
					) : (
						sessions.map((session) => (
							<button
								key={session.session_id}
								type="button"
								onClick={() => onSelectSession(session.session_id)}
								disabled={historyLoading}
								className={cn(
									"w-full rounded-(--radius) border border-border bg-background px-3 py-2 text-left text-sm",
									"transition-colors hover:bg-foreground/5",
									"disabled:cursor-not-allowed disabled:opacity-60",
									session.session_id === conversationId
										? "ring-2 ring-ring"
										: "",
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium text-foreground">
										{session.title || labels.chatHistory}
									</span>
									<span className="text-[11px] text-muted-foreground">
										{formatMessageCount(session.message_count)}
									</span>
								</div>
								<div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
									<span className="truncate">
										{session.last_active || session.session_id}
									</span>
									<span className="uppercase tracking-wide">
										{session.chat_type || "default"}
									</span>
								</div>
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}
