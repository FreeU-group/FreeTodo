"use client";

import { X } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type LayoutFormMode = "save" | "rename";

export interface LayoutFormState {
	mode: LayoutFormMode;
	name: string;
	targetId?: string;
}

export interface OverwriteConfirmState {
	mode: LayoutFormMode;
	name: string;
	targetId?: string;
}

type Translator = ReturnType<typeof useTranslations>;

interface LayoutSelectorDialogsProps {
	layoutForm: LayoutFormState | null;
	setLayoutForm: Dispatch<SetStateAction<LayoutFormState | null>>;
	formError: string | null;
	setFormError: (value: string | null) => void;
	onLayoutFormSubmit: () => void;
	nameInputRef: RefObject<HTMLInputElement | null>;
	overwriteConfirm: OverwriteConfirmState | null;
	onOverwriteConfirm: () => void;
	onOverwriteCancel: () => void;
	overwriteActionRef: RefObject<"confirm" | "cancel" | null>;
	deleteTargetName: string | null;
	onDeleteConfirm: () => void;
	onDeleteCancel: () => void;
	t: Translator;
}

export function LayoutSelectorDialogs({
	layoutForm,
	setLayoutForm,
	formError,
	setFormError,
	onLayoutFormSubmit,
	nameInputRef,
	overwriteConfirm,
	onOverwriteConfirm,
	onOverwriteCancel,
	overwriteActionRef,
	deleteTargetName,
	onDeleteConfirm,
	onDeleteCancel,
	t,
}: LayoutSelectorDialogsProps) {
	return (
		<>
			<Dialog
				open={Boolean(layoutForm)}
				onOpenChange={(open) => {
					if (!open) {
						setLayoutForm(null);
						setFormError(null);
					}
				}}
			>
				<DialogContent className="p-0">
					<div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
						<DialogHeader className="space-y-1">
							<DialogTitle>
								{layoutForm?.mode === "save"
									? t("saveLayoutTitle")
									: t("renameLayoutTitle")}
							</DialogTitle>
							<DialogDescription>
								{layoutForm?.mode === "save"
									? t("saveLayoutDescription")
									: t("renameLayoutDescription")}
							</DialogDescription>
						</DialogHeader>
						<DialogClose asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={t("close")}
							>
								<X className="h-4 w-4" />
							</Button>
						</DialogClose>
					</div>
					<div className="px-4 py-3">
						<input
							autoFocus
							className={cn(
								"w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none",
								"focus-visible:ring-2 focus-visible:ring-ring",
							)}
							placeholder={
								layoutForm?.mode === "save"
									? t("saveLayoutPlaceholder")
									: t("renameLayoutPlaceholder")
							}
							value={layoutForm?.name ?? ""}
							onChange={(event) => {
								setLayoutForm((prev) =>
									prev ? { ...prev, name: event.target.value } : prev,
								);
								if (formError) setFormError(null);
							}}
							ref={nameInputRef}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									onLayoutFormSubmit();
								}
							}}
						/>
						{formError && (
							<p className="mt-2 text-xs text-destructive">{formError}</p>
						)}
					</div>
					<DialogFooter className="border-t border-border px-4 py-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								setLayoutForm(null);
								setFormError(null);
							}}
						>
							{t("cancel")}
						</Button>
						<Button type="button" size="sm" onClick={onLayoutFormSubmit}>
							{t("confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={Boolean(overwriteConfirm)}
				onOpenChange={(open) => {
					if (!open) {
						if (overwriteActionRef.current) {
							overwriteActionRef.current = null;
							return;
						}
						onOverwriteCancel();
						overwriteActionRef.current = null;
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader className="border-b border-border px-4 py-3">
						<AlertDialogTitle>{t("overwriteConfirmTitle")}</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription className="px-4 py-3">
						{overwriteConfirm
							? t("overwriteConfirmDescription", {
									name: overwriteConfirm.name,
								})
							: null}
					</AlertDialogDescription>
					<AlertDialogFooter className="border-t border-border px-4 py-3 sm:flex-row sm:justify-end">
						<Button asChild variant="outline" size="sm">
							<AlertDialogCancel onClick={onOverwriteCancel}>
								{t("cancel")}
							</AlertDialogCancel>
						</Button>
						<Button asChild size="sm">
							<AlertDialogAction onClick={onOverwriteConfirm}>
								{t("confirm")}
							</AlertDialogAction>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={Boolean(deleteTargetName)}
				onOpenChange={(open) => {
					if (!open) {
						onDeleteCancel();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader className="border-b border-border px-4 py-3">
						<AlertDialogTitle>{t("deleteLayoutTitle")}</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription className="px-4 py-3">
						{deleteTargetName
							? t("deleteLayoutDescription", { name: deleteTargetName })
							: null}
					</AlertDialogDescription>
					<AlertDialogFooter className="border-t border-border px-4 py-3 sm:flex-row sm:justify-end">
						<Button asChild variant="outline" size="sm">
							<AlertDialogCancel onClick={onDeleteCancel}>
								{t("cancel")}
							</AlertDialogCancel>
						</Button>
						<Button asChild variant="destructive" size="sm">
							<AlertDialogAction onClick={onDeleteConfirm}>
								{t("deleteLayout")}
							</AlertDialogAction>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
