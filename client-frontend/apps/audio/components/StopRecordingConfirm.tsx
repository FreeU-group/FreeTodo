"use client";

interface StopRecordingConfirmProps {
	isOpen: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

export function StopRecordingConfirm({ isOpen, onCancel, onConfirm }: StopRecordingConfirmProps) {
	if (!isOpen) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
			<div className="bg-[oklch(var(--background))] border border-[oklch(var(--border))] rounded-lg shadow-lg w-[320px] p-4 space-y-4">
				<div className="text-base font-semibold text-[oklch(var(--foreground))]">停止录音？</div>
				<p className="text-sm text-[oklch(var(--muted-foreground))]">
					确定要停止当前录音吗？停止后将保存当前音频并结束实时转写。
				</p>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						className="px-3 py-1.5 rounded-md text-sm border border-[oklch(var(--border))] text-[oklch(var(--foreground))] hover:bg-[oklch(var(--muted))/50]"
						onClick={onCancel}
					>
						取消
					</button>
					<button
						type="button"
						className="px-3 py-1.5 rounded-md text-sm bg-[oklch(var(--primary))] text-white shadow hover:opacity-90"
						onClick={onConfirm}
					>
						停止
					</button>
				</div>
			</div>
		</div>
	);
}
