"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SectionHeader } from "@/components/common/layout/SectionHeader";

interface BackgroundSectionProps {
	description?: string;
	show: boolean;
	onToggle: () => void;
	onDescriptionChange?: (description: string) => void;
}

export function BackgroundSection({
	description,
	show,
	onToggle,
	onDescriptionChange,
}: BackgroundSectionProps) {
	const t = useTranslations("todoDetail");
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(description || "");
	const [displayValue, setDisplayValue] = useState(description || "");
	const [isHovered, setIsHovered] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const justSavedRef = useRef<boolean>(false);

	useEffect(() => {
		if (!isEditing && !justSavedRef.current) {
			if (description !== displayValue) {
				setDisplayValue(description || "");
			}
		}
		if (justSavedRef.current) {
			justSavedRef.current = false;
		}
	}, [description, isEditing, displayValue]);

	const adjustTextareaHeight = useCallback(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = "auto";
			textarea.style.height = `${textarea.scrollHeight}px`;
		}
	}, []);

	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
			adjustTextareaHeight();
		}
	}, [isEditing, adjustTextareaHeight]);

	const handleStartEdit = () => {
		setEditValue(displayValue || "");
		setIsEditing(true);
	};

	const handleSave = async () => {
		const trimmedValue = editValue.trim();
		justSavedRef.current = true;
		setDisplayValue(trimmedValue);
		setIsEditing(false);

		if (onDescriptionChange) {
			try {
				await onDescriptionChange(trimmedValue);
			} catch (err) {
				setDisplayValue(description || "");
				justSavedRef.current = false;
				console.error("Failed to update background:", err);
			}
		}
	};

	const handleCancel = () => {
		setEditValue(displayValue || "");
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Escape") {
			handleCancel();
		} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleSave();
		}
	};

	const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		if (relatedTarget?.closest("[data-background-actions]")) {
			return;
		}
		handleSave();
	};

	return (
		<div
			role="group"
			className="mb-8"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<SectionHeader
				title={t("backgroundLabel")}
				show={show}
				onToggle={onToggle}
				headerClassName="mb-3"
				isHovered={isHovered}
			/>
			{show &&
				(isEditing ? (
					<div className="relative">
						<textarea
							ref={textareaRef}
							value={editValue}
							onChange={(e) => {
								setEditValue(e.target.value);
								adjustTextareaHeight();
							}}
							onKeyDown={handleKeyDown}
							onBlur={handleBlur}
							placeholder={t("backgroundPlaceholder")}
							className="w-full min-h-[80px] resize-none rounded-md border border-primary bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
						/>
						<div data-background-actions className="mt-2 flex justify-end gap-2">
							<button
								type="button"
								onClick={handleCancel}
								className="flex items-center gap-1 rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
							>
								<X className="h-3.5 w-3.5" />
								{t("cancel")}
							</button>
							<button
								type="button"
								onClick={handleSave}
								className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
							>
								<Check className="h-3.5 w-3.5" />
								{t("save")}
							</button>
						</div>
					</div>
				) : (
					<div
						role="button"
						tabIndex={0}
						onClick={handleStartEdit}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleStartEdit();
							}
						}}
						className="w-full text-left group cursor-pointer rounded-md border border-border bg-muted/20 px-4 py-3 hover:border-primary/50 hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
					>
						{displayValue ? (
							<div className="markdown-content">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{displayValue}
								</ReactMarkdown>
							</div>
						) : (
							<span className="text-sm text-muted-foreground">
								{t("backgroundEmptyPlaceholder")}
							</span>
						)}
					</div>
				))}
		</div>
	);
}
