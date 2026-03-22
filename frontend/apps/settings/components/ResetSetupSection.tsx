"use client";

import { RotateCcw } from "lucide-react";
import { useResetSetup } from "@/lib/query/setup";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface ResetSetupSectionProps {
	loading?: boolean;
}

/**
 * 重置初始化向导组件
 */
export function ResetSetupSection({ loading = false }: ResetSetupSectionProps) {
	const resetMutation = useResetSetup();

	const handleReset = async () => {
		if (
			!window.confirm(
				"确定要重置初始化向导吗？\n\n这会将当前的记忆数据（Memory）备份，并在下次启动时重新进入初始化流程。",
			)
		) {
			return;
		}

		try {
			await resetMutation.mutateAsync();
			toastSuccess("重置成功，请重启应用以重新初始化");
			// Optional: force reload after a short delay
			setTimeout(() => {
				if (typeof window !== "undefined") {
					window.location.reload();
				}
			}, 1500);
		} catch (error) {
			toastError("重置失败，请查看日志");
			console.error("Reset setup failed:", error);
		}
	};

	return (
		<SettingsSection title="重置初始化">
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					重新运行首次启动时的初始化向导。当前的记忆数据将被备份。
				</p>
				<button
					type="button"
					onClick={handleReset}
					disabled={loading || resetMutation.isPending}
					className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive ring-offset-background transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<RotateCcw className="h-4 w-4" />
					{resetMutation.isPending ? "正在重置..." : "重置初始化向导"}
				</button>
			</div>
		</SettingsSection>
	);
}
