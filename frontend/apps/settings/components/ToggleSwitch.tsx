"use client";

interface ToggleSwitchProps {
	id?: string;
	// 支持两种命名方式
	enabled?: boolean;
	checked?: boolean;
	disabled?: boolean;
	onToggle?: (enabled: boolean) => void;
	onCheckedChange?: (checked: boolean) => void;
	ariaLabel?: string;
	// 标签和描述
	label?: string;
	description?: string;
}

/**
 * 通用开关组件
 */
export function ToggleSwitch({
	id,
	enabled,
	checked,
	disabled = false,
	onToggle,
	onCheckedChange,
	ariaLabel,
	label,
	description,
}: ToggleSwitchProps) {
	// 兼容两种命名方式
	const isEnabled = checked ?? enabled ?? false;
	const handleToggle = (newValue: boolean) => {
		onCheckedChange?.(newValue);
		onToggle?.(newValue);
	};

	const switchButton = (
		<button
			type="button"
			id={id}
			disabled={disabled}
			onClick={() => handleToggle(!isEnabled)}
			className={`
        relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
        focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isEnabled ? "bg-primary" : "bg-muted"}
      `}
			aria-label={ariaLabel || label}
		>
			<span
				className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${isEnabled ? "translate-x-6" : "translate-x-1"}
        `}
			/>
		</button>
	);

	// 如果有标签或描述，包装在一个容器中
	if (label || description) {
		return (
			<div className="flex items-center justify-between gap-4">
				<div className="flex-1">
					{label && (
						<div className="text-sm font-medium text-foreground">{label}</div>
					)}
					{description && (
						<div className="text-xs text-muted-foreground mt-0.5">{description}</div>
					)}
				</div>
				{switchButton}
			</div>
		);
	}

	return switchButton;
}
