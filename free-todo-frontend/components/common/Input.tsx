"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export default function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ring-offset-background",
        className,
      )}
      {...props}
    />
  );
}

interface FormFieldProps extends InputProps {
  label: string;
}

export function FormField({ label, className, ...props }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input className={className} {...props} />
    </label>
  );
}


