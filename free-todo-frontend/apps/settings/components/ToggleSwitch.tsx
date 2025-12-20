"use client";

interface ToggleSwitchProps {
	id?: string;
	enabled: boolean;
	disabled?: boolean;
	onToggle: (enabled: boolean) => void;
	ariaLabel?: string;
}

/**
 * 通用开关组件
 */
export function ToggleSwitch({
	id,
	enabled,
	disabled = false,
	onToggle,
	ariaLabel,
}: ToggleSwitchProps) {
	return (
		<button
			type="button"
			id={id}
			disabled={disabled}
			onClick={() => onToggle(!enabled)}
			className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${enabled ? "bg-primary" : "bg-muted"}
      `}
			aria-label={ariaLabel}
		>
			<span
				className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? "translate-x-6" : "translate-x-1"}
        `}
			/>
		</button>
	);
}
