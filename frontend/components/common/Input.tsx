import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// 基础 Input 组件 - 符合 shadcn/ui 标准
export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(
	({ className, type = "text", ...props }, ref) => {
		return (
			<input
				type={type}
				ref={ref}
				className={cn(
					"flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		);
	},
);

Input.displayName = "Input";

// FormField 组件 - 带 label 和 error 的表单字段
export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
	({ className, label, error, type = "text", id, ...props }, ref) => {
		const inputId = id ?? (props.name ? String(props.name) : undefined);

		return (
			<div className="w-full space-y-2">
				{label && (
					<label
						htmlFor={inputId}
						className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
					>
						{label}
					</label>
				)}
				<Input
					type={type}
					ref={ref}
					id={inputId}
					className={cn(
						error && "border-destructive focus-visible:ring-destructive",
						className,
					)}
					{...props}
				/>
				{error && (
					<p className="text-sm font-medium text-destructive">{error}</p>
				)}
			</div>
		);
	},
);

FormField.displayName = "FormField";

export default Input;
