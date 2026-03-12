"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PasswordInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
	className?: string;
}

export function PasswordInput({ className, ...props }: PasswordInputProps) {
	const [visible, setVisible] = useState(false);

	return (
		<div className="relative flex items-center">
			<input
				{...props}
				type={visible ? "text" : "password"}
				className={cn(
					"w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
					className,
				)}
			/>
			<button
				type="button"
				tabIndex={-1}
				onClick={() => setVisible((v) => !v)}
				className="absolute right-2.5 text-muted-foreground hover:text-foreground transition-colors"
				aria-label={visible ? "隐藏" : "显示"}
			>
				{visible ? (
					<EyeOff className="h-4 w-4" />
				) : (
					<Eye className="h-4 w-4" />
				)}
			</button>
		</div>
	);
}
