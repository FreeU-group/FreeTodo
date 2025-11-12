'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Event, Task } from '@/lib/types';

interface SelectedEventsContextType {
  selectedEvents: Set<number>;
  setSelectedEvents: (events: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  selectedEventsData: Event[];
  setSelectedEventsData: (events: Event[] | ((prev: Event[]) => Event[])) => void;
  selectedTasks: Set<number>;
  setSelectedTasks: (tasks: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  selectedTasksData: Task[];
  setSelectedTasksData: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
}

const SelectedEventsContext = createContext<SelectedEventsContextType | undefined>(undefined);

export function SelectedEventsProvider({ children }: { children: ReactNode }) {
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
  const [selectedEventsData, setSelectedEventsData] = useState<Event[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [selectedTasksData, setSelectedTasksData] = useState<Task[]>([]);

  return (
    <SelectedEventsContext.Provider
      value={{
        selectedEvents,
        setSelectedEvents,
        selectedEventsData,
        setSelectedEventsData,
        selectedTasks,
        setSelectedTasks,
        selectedTasksData,
        setSelectedTasksData,
      }}
    >
      {children}
    </SelectedEventsContext.Provider>
  );
}

export function useSelectedEvents() {
  const context = useContext(SelectedEventsContext);
  if (context === undefined) {
    throw new Error('useSelectedEvents must be used within a SelectedEventsProvider');
  }
  return context;
}
