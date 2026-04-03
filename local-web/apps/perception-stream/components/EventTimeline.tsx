"use client";

import { useTranslations } from "next-intl";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import type { PerceptionEvent } from "@/lib/store/perception-stream-store";
import { EventCard } from "./EventCard";

const BOTTOM_THRESHOLD_PX = 40;
const EVENT_GAP_PX = 8;
const ESTIMATED_EVENT_HEIGHT_PX = 132;
const MIN_EVENT_HEIGHT_PX = 56;
const OVERSCAN_VIEWPORTS = 1;

function isNearBottom(el: HTMLDivElement): boolean {
	return el.scrollHeight - el.clientHeight - el.scrollTop <= BOTTOM_THRESHOLD_PX;
}

function findFirstVisibleIndex(
	startOffsets: number[],
	outerHeights: number[],
	targetStart: number,
): number {
	if (startOffsets.length === 0) return 0;
	let low = 0;
	let high = startOffsets.length - 1;
	let answer = startOffsets.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const end = (startOffsets[mid] ?? 0) + (outerHeights[mid] ?? 0);
		if (end >= targetStart) {
			answer = mid;
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}

	return answer;
}

function findLastVisibleIndex(startOffsets: number[], targetEnd: number): number {
	if (startOffsets.length === 0) return -1;
	let low = 0;
	let high = startOffsets.length - 1;
	let answer = 0;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		if ((startOffsets[mid] ?? 0) <= targetEnd) {
			answer = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return answer;
}

function MeasuredEventRow({
	event,
	paddingBottom,
	onHeightChange,
}: {
	event: PerceptionEvent;
	paddingBottom: number;
	onHeightChange: (eventId: string, height: number) => void;
}) {
	const rowRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const el = rowRef.current;
		if (!el) return;

		const measure = () => {
			const nextHeight = Math.max(
				MIN_EVENT_HEIGHT_PX,
				Math.ceil(el.getBoundingClientRect().height),
			);
			onHeightChange(event.event_id, nextHeight);
		};

		measure();

		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			measure();
		});
		observer.observe(el);

		return () => observer.disconnect();
	}, [event.event_id, onHeightChange]);

	return (
		<div style={{ paddingBottom }}>
			<div ref={rowRef}>
				<EventCard event={event} />
			</div>
		</div>
	);
}

export function EventTimeline({ events }: { events: PerceptionEvent[] }) {
	const t = useTranslations("perceptionStream");
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollRafRef = useRef<number | null>(null);
	const autoScrollRafRef = useRef<number | null>(null);

	const [pinnedToBottom, setPinnedToBottom] = useState(true);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(0);
	const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(() => new Map());

	const latestEventId = events.length > 0 ? events[events.length - 1].event_id : null;

	const handleRowHeightChange = useCallback((eventId: string, nextHeight: number) => {
		setMeasuredHeights((prev) => {
			const prevHeight = prev.get(eventId);
			if (prevHeight === nextHeight) return prev;
			const next = new Map(prev);
			next.set(eventId, nextHeight);
			return next;
		});
	}, []);

	useEffect(() => {
		const activeIds = new Set(events.map((event) => event.event_id));
		setMeasuredHeights((prev) => {
			let removed = false;
			const next = new Map(prev);
			for (const cachedId of next.keys()) {
				if (!activeIds.has(cachedId)) {
					next.delete(cachedId);
					removed = true;
				}
			}
			return removed ? next : prev;
		});
	}, [events]);

	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		const syncMetrics = () => {
			const nextViewport = el.clientHeight;
			setViewportHeight((prev) => (prev === nextViewport ? prev : nextViewport));
			const nextScrollTop = el.scrollTop;
			setScrollTop((prev) => (prev === nextScrollTop ? prev : nextScrollTop));
		};

		syncMetrics();

		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			syncMetrics();
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const commitScrollState = useCallback(() => {
		scrollRafRef.current = null;
		const el = scrollRef.current;
		if (!el) return;

		const nextScrollTop = el.scrollTop;
		setScrollTop((prev) => (prev === nextScrollTop ? prev : nextScrollTop));
		const nextPinned = isNearBottom(el);
		setPinnedToBottom((prev) => (prev === nextPinned ? prev : nextPinned));
	}, []);

	const handleScroll = useCallback(() => {
		if (scrollRafRef.current !== null) return;
		scrollRafRef.current = window.requestAnimationFrame(commitScrollState);
	}, [commitScrollState]);

	useEffect(() => {
		if (!latestEventId || !pinnedToBottom) return;
		const el = scrollRef.current;
		if (!el) return;

		if (autoScrollRafRef.current !== null) {
			window.cancelAnimationFrame(autoScrollRafRef.current);
		}
		autoScrollRafRef.current = window.requestAnimationFrame(() => {
			autoScrollRafRef.current = null;
			el.scrollTop = el.scrollHeight;
			setScrollTop((prev) => (prev === el.scrollTop ? prev : el.scrollTop));
		});
	}, [latestEventId, pinnedToBottom]);

	useEffect(() => {
		return () => {
			if (scrollRafRef.current !== null) {
				window.cancelAnimationFrame(scrollRafRef.current);
			}
			if (autoScrollRafRef.current !== null) {
				window.cancelAnimationFrame(autoScrollRafRef.current);
			}
		};
	}, []);

	const layout = useMemo(() => {
		const startOffsets: number[] = [];
		const outerHeights: number[] = [];
		let totalHeight = 0;

		for (let index = 0; index < events.length; index += 1) {
			const event = events[index];
			startOffsets.push(totalHeight);
			const contentHeight = measuredHeights.get(event.event_id) ?? ESTIMATED_EVENT_HEIGHT_PX;
			const gap = index === events.length - 1 ? 0 : EVENT_GAP_PX;
			const outerHeight = contentHeight + gap;
			outerHeights.push(outerHeight);
			totalHeight += outerHeight;
		}

		return { startOffsets, outerHeights, totalHeight };
	}, [events, measuredHeights]);

	const range = useMemo(() => {
		if (events.length === 0) {
			return {
				startIndex: 0,
				endIndex: -1,
				topSpacerHeight: 0,
				bottomSpacerHeight: 0,
			};
		}

		const resolvedViewportHeight = viewportHeight > 0 ? viewportHeight : 600;
		const overscanPx = resolvedViewportHeight * OVERSCAN_VIEWPORTS;
		const targetStart = Math.max(0, scrollTop - overscanPx);
		const targetEnd = scrollTop + resolvedViewportHeight + overscanPx;

		const rawStart = findFirstVisibleIndex(
			layout.startOffsets,
			layout.outerHeights,
			targetStart,
		);
		const rawEnd = findLastVisibleIndex(layout.startOffsets, targetEnd);

		const startIndex = Math.max(0, Math.min(rawStart, events.length - 1));
		const endIndex = Math.max(startIndex, Math.min(rawEnd, events.length - 1));
		const topSpacerHeight = layout.startOffsets[startIndex] ?? 0;
		const endOffset =
			(layout.startOffsets[endIndex] ?? 0) + (layout.outerHeights[endIndex] ?? 0);
		const bottomSpacerHeight = Math.max(0, layout.totalHeight - endOffset);

		return {
			startIndex,
			endIndex,
			topSpacerHeight,
			bottomSpacerHeight,
		};
	}, [events.length, layout, scrollTop, viewportHeight]);

	const visibleEvents = useMemo(() => {
		if (range.endIndex < range.startIndex) return [];
		return events.slice(range.startIndex, range.endIndex + 1);
	}, [events, range.endIndex, range.startIndex]);

	if (events.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				{t("noEvents")}
			</div>
		);
	}

	const jumpToLatest = () => {
		const el = scrollRef.current;
		if (!el) return;
		if (autoScrollRafRef.current !== null) {
			window.cancelAnimationFrame(autoScrollRafRef.current);
		}
		autoScrollRafRef.current = window.requestAnimationFrame(() => {
			autoScrollRafRef.current = null;
			el.scrollTop = el.scrollHeight;
			setScrollTop(el.scrollTop);
			setPinnedToBottom(true);
		});
	};

	return (
		<div className="relative flex-1 overflow-hidden">
			<div ref={scrollRef} className="h-full overflow-y-auto" onScroll={handleScroll}>
				<div className="p-4">
					{range.topSpacerHeight > 0 ? (
						<div aria-hidden style={{ height: range.topSpacerHeight }} />
					) : null}

					{visibleEvents.map((event, index) => {
						const absoluteIndex = range.startIndex + index;
						const paddingBottom = absoluteIndex === events.length - 1 ? 0 : EVENT_GAP_PX;
						return (
							<MeasuredEventRow
								key={event.event_id}
								event={event}
								paddingBottom={paddingBottom}
								onHeightChange={handleRowHeightChange}
							/>
						);
					})}

					{range.bottomSpacerHeight > 0 ? (
						<div aria-hidden style={{ height: range.bottomSpacerHeight }} />
					) : null}
				</div>
			</div>

			{!pinnedToBottom && (
				<div className="absolute bottom-4 right-4">
					<Button type="button" variant="outline" size="sm" onClick={jumpToLatest}>
						{t("jumpToLatest")}
					</Button>
				</div>
			)}
		</div>
	);
}
