"use client";

import type { ReactNode } from "react";

interface SettingsSectionProps {
	title: string;
	description?: string;
	children: ReactNode;
}

/**
 * 设置区块容器组件
 */
export function SettingsSection({
	title,
	description,
	children,
}: SettingsSectionProps) {
	return (
		<div className="rounded-lg border border-border p-4">
			<div className="mb-4">
				<h3 className="mb-1 text-base font-semibold text-foreground">
					{title}
				</h3>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{children}
		</div>
	);
}
