import { useCallback, useEffect, useRef } from "react";

export function useNotesAutosize(deps: unknown[]) {
	const notesRef = useRef<HTMLTextAreaElement | null>(null);

	const adjustNotesHeight = useCallback(() => {
		const el = notesRef.current;
		if (!el) return;

		el.style.height = "auto";

		const BOTTOM_DOCK_ESTIMATED_HEIGHT = 84;
		const SAFE_GAP = 16;
		const MIN_HEIGHT = 120;

		const availableHeight =
			typeof window !== "undefined"
				? Math.max(
						MIN_HEIGHT,
						window.innerHeight -
							el.getBoundingClientRect().top -
							(BOTTOM_DOCK_ESTIMATED_HEIGHT + SAFE_GAP),
					)
				: el.scrollHeight;

		const nextHeight = Math.min(el.scrollHeight, availableHeight);
		el.style.height = `${nextHeight}px`;
	}, []);

	useEffect(() => {
		adjustNotesHeight();
		const handleResize = () => adjustNotesHeight();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [adjustNotesHeight, ...deps]);

	return { notesRef, adjustNotesHeight };
}
