import { useMemo } from "react";
import {
	type PerceptionEvent,
	usePerceptionStreamStore,
} from "@/lib/store/perception-stream-store";

export function useFilteredEvents(events: PerceptionEvent[]) {
	const filter = usePerceptionStreamStore((s) => s.filter);

	return useMemo(() => {
		return events.filter((e) => {
			if (filter.sources.size > 0 && !filter.sources.has(e.source)) return false;
			if (filter.modalities.size > 0 && !filter.modalities.has(e.modality)) return false;
			return true;
		});
	}, [events, filter]);
}
