import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Card - 符合 shadcn/ui 标准
interface CardProps extends HTMLAttributes<HTMLDivElement> {}

const Card = forwardRef<HTMLDivElement, CardProps>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					"rounded-lg border border-border bg-card text-card-foreground shadow-sm",
					className,
				)}
				{...props}
			/>
		);
	},
);

Card.displayName = "Card";

// CardHeader - 符合 shadcn/ui 标准
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn("flex flex-col space-y-1.5 p-6", className)}
				{...props}
			/>
		);
	},
);

CardHeader.displayName = "CardHeader";

// CardTitle - 符合 shadcn/ui 标准
interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
	({ className, ...props }, ref) => {
		return (
			<h3
				ref={ref}
				className={cn(
					"text-2xl font-semibold leading-none tracking-tight",
					className,
				)}
				{...props}
			/>
		);
	},
);

CardTitle.displayName = "CardTitle";

// CardDescription - 符合 shadcn/ui 标准（新增）
interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
	({ className, ...props }, ref) => {
		return (
			<p
				ref={ref}
				className={cn("text-sm text-muted-foreground", className)}
				{...props}
			/>
		);
	},
);

CardDescription.displayName = "CardDescription";

// CardContent - 符合 shadcn/ui 标准
interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
	({ className, ...props }, ref) => {
		return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
	},
);

CardContent.displayName = "CardContent";

// CardFooter - 符合 shadcn/ui 标准（新增）
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn("flex items-center p-6 pt-0", className)}
				{...props}
			/>
		);
	},
);

CardFooter.displayName = "CardFooter";

export {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
};
