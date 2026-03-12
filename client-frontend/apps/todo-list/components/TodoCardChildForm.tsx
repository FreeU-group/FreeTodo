import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";

interface TodoCardChildFormProps {
	childName: string;
	childInputRef: React.RefObject<HTMLInputElement | null>;
	onChange: (value: string) => void;
	onSubmit: (e?: React.FormEvent) => void;
	onCancel: () => void;
}

export function TodoCardChildForm({
	childName,
	childInputRef,
	onChange,
	onSubmit,
	onCancel,
}: TodoCardChildFormProps) {
	const tTodoDetail = useTranslations("todoDetail");

	return (
		<form
			onSubmit={onSubmit}
			onMouseDown={(e) => e.stopPropagation()}
			className="mt-2 space-y-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-2"
		>
			<input
				ref={childInputRef}
				type="text"
				value={childName}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					// 阻止所有键盘事件冒泡到父元素，避免空格等键被父元素拦截
					e.stopPropagation();
					if (e.key === "Enter" && !e.nativeEvent.isComposing) {
						// 只在非输入法组合状态下处理回车键，避免干扰中文输入法
						e.preventDefault(); // 阻止表单提交，避免重复创建
						onSubmit();
						return;
					}
					if (e.key === "Escape") {
						onCancel();
					}
				}}
				placeholder={tTodoDetail("addChildPlaceholder")}
				className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			/>
			<div className="flex items-center justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
				>
					{tTodoDetail("cancel")}
				</button>
				<button
					type="submit"
					className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
				>
					<Plus className="h-4 w-4" />
					{tTodoDetail("add")}
				</button>
			</div>
		</form>
	);
}
