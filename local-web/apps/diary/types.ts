export interface JournalDraft {
	id: number | null;
	name: string;
	userNotes: string;
	contentObjective: string;
	contentAi: string;
	mood: string;
	energy: number | null;
	tags: string[];
	relatedTodoIds: number[];
	relatedActivityIds: number[];
	date: Date;
}
