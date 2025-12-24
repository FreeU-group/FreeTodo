"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface DetailTitleProps {
	name: string;
	onNameChange?: (newName: string) => void;
}

export function DetailTitle({ name, onNameChange }: DetailTitleProps) {
	const t = useTranslations("todoDetail");
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(name);
	const [isComposing, setIsComposing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// 当进入编辑模式时，聚焦输入框
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	// 同步外部 name 的变化
	useEffect(() => {
		setEditValue(name);
	}, [name]);

	const handleStartEdit = () => {
		setIsEditing(true);
		setEditValue(name);
	};

	const handleSave = () => {
		const trimmedValue = editValue.trim();
		if (trimmedValue && trimmedValue !== name) {
			onNameChange?.(trimmedValue);
		} else {
			setEditValue(name);
		}
		setIsEditing(false);
	};

	const handleCancel = () => {
		setEditValue(name);
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		// 如果正在使用输入法，不处理回车键（让输入法完成输入）
		if (e.key === "Enter" && !isComposing) {
			e.preventDefault();
			handleSave();
		} else if (e.key === "Escape") {
			e.preventDefault();
			handleCancel();
		}
	};

	return (
		<div className="mb-4 flex items-center justify-between gap-3">
			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={handleSave}
					onKeyDown={handleKeyDown}
					onCompositionStart={() => setIsComposing(true)}
					onCompositionEnd={() => setIsComposing(false)}
					className="flex-1 text-xl text-foreground bg-transparent border-b-2 border-primary focus:outline-none"
				/>
			) : (
				<button
					type="button"
					onClick={handleStartEdit}
					aria-label={t("editTitle")}
					className="text-xl text-foreground cursor-pointer hover:text-primary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-sm text-left flex-1"
				>
					{name}
				</button>
			)}
		</div>
	);
}
