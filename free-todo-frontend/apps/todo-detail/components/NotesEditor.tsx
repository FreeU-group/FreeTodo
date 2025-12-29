"use client";

import { useTranslations } from "next-intl";
import { type ChangeEvent, useState } from "react";
import { SectionHeader } from "@/components/common/layout/SectionHeader";

interface NotesEditorProps {
	value: string;
	show: boolean;
	onToggle: () => void;
	onChange: (value: string) => void;
	onBlur?: () => void;
	notesRef: React.RefObject<HTMLTextAreaElement | null>;
	adjustHeight: () => void;
}

export function NotesEditor({
	value,
	show,
	onToggle,
	onChange,
	onBlur,
	notesRef,
	adjustHeight,
}: NotesEditorProps) {
	const t = useTranslations("todoDetail");
	const [isHovered, setIsHovered] = useState(false);
	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		onChange(event.target.value);
		requestAnimationFrame(adjustHeight);
	};

	const handleBlur = () => {
		onBlur?.();
	};

	return (
		<div
			role="group"
			className="mb-8"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<SectionHeader
				title={t("notesLabel")}
				show={show}
				onToggle={onToggle}
				headerClassName="mb-2"
				isHovered={isHovered}
			/>
			{show && (
				<textarea
					ref={notesRef}
					value={value}
					onChange={handleChange}
					onBlur={handleBlur}
					placeholder={t("notesPlaceholder")}
					className="w-full min-h-[120px] resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
				/>
			)}
		</div>
	);
}
