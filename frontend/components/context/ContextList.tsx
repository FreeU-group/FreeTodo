'use client';

import { Context } from '@/lib/types';
import ContextCard from './ContextCard';

interface ContextListProps {
  contexts: Context[];
  onAssociate?: (contextId: number) => void;
  onUnassociate?: (contextId: number) => void;
}

export default function ContextList({ contexts, onAssociate, onUnassociate }: ContextListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contexts.map((context) => (
        <ContextCard
          key={context.id}
          context={context}
          onAssociate={onAssociate}
          onUnassociate={onUnassociate}
        />
      ))}
    </div>
  );
}

