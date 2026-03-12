"use client";

import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	asChild?: boolean;
}

const baseClasses =
	"inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
	"disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
	default: "bg-primary text-primary-foreground hover:bg-primary/90",
	outline: "border border-input bg-background text-foreground hover:bg-muted",
	ghost: "text-foreground hover:bg-muted",
	destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const sizeClasses: Record<ButtonSize, string> = {
	default: "h-9 px-4 py-2",
	sm: "h-8 px-3 text-sm",
	lg: "h-10 px-6 text-base",
	icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant = "default",
			size = "default",
			asChild = false,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				ref={ref}
				className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
				{...props}
			/>
		);
	},
);

Button.displayName = "Button";
