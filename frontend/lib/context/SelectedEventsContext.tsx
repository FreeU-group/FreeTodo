"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { Event } from "@/lib/types";

interface SelectedEventsContextType {
	selectedEvents: Set<number>;
	setSelectedEvents: (
		events: Set<number> | ((prev: Set<number>) => Set<number>),
	) => void;
	selectedEventsData: Event[];
	setSelectedEventsData: (
		events: Event[] | ((prev: Event[]) => Event[]),
	) => void;
}

const SelectedEventsContext = createContext<
	SelectedEventsContextType | undefined
>(undefined);

export function SelectedEventsProvider({ children }: { children: ReactNode }) {
	const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
	const [selectedEventsData, setSelectedEventsData] = useState<Event[]>([]);

	return (
		<SelectedEventsContext.Provider
			value={{
				selectedEvents,
				setSelectedEvents,
				selectedEventsData,
				setSelectedEventsData,
			}}
		>
			{children}
		</SelectedEventsContext.Provider>
	);
}

export function useSelectedEvents() {
	const context = useContext(SelectedEventsContext);
	if (context === undefined) {
		throw new Error(
			"useSelectedEvents must be used within a SelectedEventsProvider",
		);
	}
	return context;
}
