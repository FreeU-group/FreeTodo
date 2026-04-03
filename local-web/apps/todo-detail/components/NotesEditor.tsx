"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SectionHeader } from "@/components/common/layout/SectionHeader";

interface NotesEditorProps {
	value: string;
	show: boolean;
	onToggle: () => void;
	onChange: (value: string) => void;
	onBlur?: () => void;
}

const NotesEditorBody = dynamic(
	() =>
		import("./NotesEditorBody").then((mod) => ({
			default: mod.NotesEditorBody,
		})),
	{
		ssr: false,
		loading: () => (
			<div className="px-2 py-2 text-xs text-muted-foreground">
				Loading editor...
			</div>
		),
	},
);

export function NotesEditor({
	value,
	show,
	onToggle,
	onChange,
	onBlur,
}: NotesEditorProps) {
	const t = useTranslations("todoDetail");
	const [isHovered, setIsHovered] = useState(false);

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
				<div className="prose prose-sm max-w-none">
					<NotesEditorBody
						value={value}
						placeholder={t("notesPlaceholder")}
						onChange={onChange}
						onBlur={onBlur}
					/>
				</div>
			)}
		</div>
	);
}
