/**
 * 倍速选择器组件（美化版）
 */

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SpeedSelectorProps {
	speed: number;
	onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SpeedSelector({ speed, onSpeedChange }: SpeedSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// 点击外部关闭下拉菜单
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	return (
		<div className="relative" ref={dropdownRef}>
			{/* 按钮 */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all",
					"bg-background hover:bg-muted/80 border border-border/60",
					"text-foreground shadow-sm hover:shadow-md",
					isOpen && "bg-muted border-border shadow-md",
				)}
			>
				<span className="font-semibold min-w-[2rem] text-center">{speed}x</span>
				<ChevronDown
					className={cn(
						"w-3.5 h-3.5 transition-transform text-muted-foreground",
						isOpen && "rotate-180",
					)}
				/>
			</button>

			{/* 下拉菜单 */}
			{isOpen && (
				<div className="absolute bottom-full left-0 mb-2 w-24 bg-background border border-border/60 rounded-lg shadow-xl z-[100] overflow-hidden backdrop-blur-sm">
					{SPEED_OPTIONS.map((option) => (
						<button
							key={option}
							onClick={() => {
								onSpeedChange(option);
								setIsOpen(false);
							}}
							className={cn(
								"w-full px-4 py-2.5 text-sm text-left transition-all",
								"hover:bg-muted/80",
								speed === option
									? "bg-primary text-primary-foreground font-semibold"
									: "text-foreground hover:text-foreground",
							)}
						>
							<span className="flex items-center justify-between">
								<span>{option}x</span>
								{speed === option && (
									<span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/60" />
								)}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
