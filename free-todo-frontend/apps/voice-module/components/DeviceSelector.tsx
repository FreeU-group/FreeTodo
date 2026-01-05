/**
 * 设备选择器组件
 * 用于选择录音设备（麦克风）
 */

import { ChevronDown, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
// 临时定义 AudioDevice 类型（参考代码没有这个功能）
export interface AudioDevice {
	deviceId: string;
	label: string;
}

interface DeviceSelectorProps {
	devices: AudioDevice[];
	selectedDeviceId: string | null;
	onDeviceChange: (deviceId: string) => void;
	isLoading?: boolean;
}

export function DeviceSelector({
	devices,
	selectedDeviceId,
	onDeviceChange,
	isLoading = false,
}: DeviceSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [popupPosition, setPopupPosition] = useState<{
		top: number;
		left: number;
		width: number;
	} | null>(null);

	// 点击外部关闭下拉菜单
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (
				buttonRef.current &&
				!buttonRef.current.contains(target) &&
				!target.closest("[data-device-selector-popup]")
			) {
				setIsOpen(false);
				setPopupPosition(null);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	const selectedDevice =
		devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				ref={buttonRef}
				onClick={() => {
					if (buttonRef.current) {
						const rect = buttonRef.current.getBoundingClientRect();
						setPopupPosition({
							top: rect.bottom + window.scrollY + 8,
							left: rect.left + window.scrollX,
							width: rect.width,
						});
					}
					setIsOpen(!isOpen);
				}}
				disabled={isLoading || devices.length === 0}
				className={cn(
					"flex items-center gap-2 px-3 py-2 rounded-lg transition-all",
					"bg-muted/50 hover:bg-muted border border-border/50",
					"text-sm text-foreground",
					"disabled:opacity-50 disabled:cursor-not-allowed",
				)}
			>
				<Mic className="w-4 h-4" />
				<span className="max-w-[200px] truncate">
					{isLoading ? "加载中..." : selectedDevice?.label || "选择设备"}
				</span>
				<ChevronDown
					className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")}
				/>
			</button>

			{/* 下拉菜单 - 使用Portal渲染到body，避免z-index问题 */}
			{isOpen &&
				devices.length > 0 &&
				popupPosition &&
				typeof window !== "undefined" &&
				createPortal(
					<div
						data-device-selector-popup
						className="fixed z-[9999] bg-background border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto"
						style={{
							top: `${popupPosition.top}px`,
							left: `${popupPosition.left}px`,
							width: `${popupPosition.width}px`,
							minWidth: "250px",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						{devices.map((device) => (
							<button
								key={device.deviceId}
								onClick={() => {
									onDeviceChange(device.deviceId);
									setIsOpen(false);
									setPopupPosition(null);
								}}
								className={cn(
									"w-full px-4 py-3 text-left text-sm transition-colors",
									"hover:bg-muted/50",
									selectedDeviceId === device.deviceId &&
										"bg-primary/10 text-primary",
								)}
							>
								<div className="flex items-center gap-2">
									<Mic className="w-4 h-4 shrink-0" />
									<span className="truncate">{device.label}</span>
								</div>
							</button>
						))}
					</div>,
					document.body,
				)}
		</div>
	);
}
