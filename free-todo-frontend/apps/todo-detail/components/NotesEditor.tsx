"use client";

import type { ChangeEvent } from "react";

interface NotesEditorProps {
	value: string;
	onChange: (value: string) => void;
	notesRef: React.RefObject<HTMLTextAreaElement | null>;
	adjustHeight: () => void;
}

export function NotesEditor({
	value,
	onChange,
	notesRef,
	adjustHeight,
}: NotesEditorProps) {
	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		onChange(event.target.value);
		requestAnimationFrame(adjustHeight);
	};

	return (
		<>
			<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Notes
			</h2>
			<textarea
				ref={notesRef}
				value={value}
				onChange={handleChange}
				placeholder="Insert your notes here"
				className="mb-8 w-full min-h-[120px] resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			/>
		</>
	);
}
