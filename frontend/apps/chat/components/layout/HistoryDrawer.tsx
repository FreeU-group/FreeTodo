import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSessionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

type HistoryDrawerProps = {
	historyLoading: boolean;
	historyError: string | null;
	sessions: ChatSessionSummary[];
	conversationId: string | null;
	labels: {
		noHistory: string;
		loading: string;
		chatHistory: string;
	};
	onSelectSession: (id: string) => void;
	className?: string;
	listClassName?: string;
};

export function HistoryDrawer({
	historyLoading,
	historyError,
	sessions,
	conversationId,
	labels,
	onSelectSession,
	className,
	listClassName,
}: HistoryDrawerProps) {
	const [displayTitles, setDisplayTitles] = useState<Record<string, string>>({});
	const previousTitlesRef = useRef<Map<string, string>>(new Map());
	const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	const getSessionKey = useCallback(
		(session: ChatSessionSummary, index: number) =>
			session.sessionId || `session-${index}`,
		[],
	);

	const startTypewriter = useCallback((sessionKey: string, text: string) => {
		const existingTimer = typingTimersRef.current.get(sessionKey);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		let currentIndex = 0;
		setDisplayTitles((prev) => ({ ...prev, [sessionKey]: "" }));

		const step = () => {
			currentIndex += 1;
			setDisplayTitles((prev) => ({
				...prev,
				[sessionKey]: text.slice(0, currentIndex),
			}));

			if (currentIndex < text.length) {
				const timer = setTimeout(step, 40);
				typingTimersRef.current.set(sessionKey, timer);
			} else {
				typingTimersRef.current.delete(sessionKey);
			}
		};

		const timer = setTimeout(step, 40);
		typingTimersRef.current.set(sessionKey, timer);
	}, []);

	useEffect(() => {
		const activeKeys = new Set<string>();

		sessions.forEach((session, index) => {
			const sessionKey = getSessionKey(session, index);
			activeKeys.add(sessionKey);

			const nextTitle = (session.title || labels.chatHistory).trim();
			const prevTitle = previousTitlesRef.current.get(sessionKey);

			if (!prevTitle) {
				previousTitlesRef.current.set(sessionKey, nextTitle);
				setDisplayTitles((prev) => ({
					...prev,
					[sessionKey]: nextTitle,
				}));
				return;
			}

			if (prevTitle === nextTitle) {
				return;
			}

			previousTitlesRef.current.set(sessionKey, nextTitle);

			if (nextTitle === labels.chatHistory) {
				setDisplayTitles((prev) => ({
					...prev,
					[sessionKey]: nextTitle,
				}));
				return;
			}

			startTypewriter(sessionKey, nextTitle);
		});

		for (const sessionKey of Array.from(previousTitlesRef.current.keys())) {
			if (!activeKeys.has(sessionKey)) {
				previousTitlesRef.current.delete(sessionKey);
				const timer = typingTimersRef.current.get(sessionKey);
				if (timer) {
					clearTimeout(timer);
				}
				typingTimersRef.current.delete(sessionKey);
				setDisplayTitles((prev) => {
					if (!(sessionKey in prev)) return prev;
					const next = { ...prev };
					delete next[sessionKey];
					return next;
				});
			}
		}
	}, [getSessionKey, labels.chatHistory, sessions, startTypewriter]);

	useEffect(() => {
		return () => {
			for (const timer of typingTimersRef.current.values()) {
				clearTimeout(timer);
			}
			typingTimersRef.current.clear();
		};
	}, []);

	return (
		<div
			className={cn("border-b border-border bg-muted/40 px-4 py-3", className)}
		>
			{historyLoading && (
				<div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					{labels.loading}
				</div>
			)}
			{historyError && (
				<p className="text-xs text-destructive">{historyError}</p>
			)}
			{!historyError && (
				<div
					className={cn(
						"max-h-72 space-y-2 overflow-y-auto pr-1",
						listClassName,
					)}
				>
					{!historyLoading && sessions.length === 0 ? (
						<p className="text-xs text-muted-foreground">{labels.noHistory}</p>
					) : (
						sessions.map((session, index) => {
							const sessionKey = getSessionKey(session, index);
							const displayTitle =
								displayTitles[sessionKey] ??
								session.title ??
								labels.chatHistory;

							return (
								<button
									key={sessionKey}
									type="button"
									onClick={() => onSelectSession(session.sessionId)}
									disabled={historyLoading}
									className={cn(
										"w-full rounded-(--radius) border border-border bg-background px-3 py-2 text-left text-sm",
										"transition-colors hover:bg-foreground/5",
										"disabled:cursor-not-allowed disabled:opacity-60",
										session.sessionId === conversationId
											? "ring-2 ring-ring"
											: "",
									)}
								>
									<span className="block truncate font-medium text-foreground">
										{displayTitle}
									</span>
								</button>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}
