/**
 * 简单的Toast通知工具
 * 使用浏览器原生API实现简单的通知功能
 */

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
	duration?: number;
	type?: ToastType;
}

let toastContainer: HTMLDivElement | null = null;

function getToastContainer(): HTMLDivElement {
	if (!toastContainer && typeof document !== "undefined") {
		toastContainer = document.createElement("div");
		toastContainer.id = "toast-container";
		toastContainer.className =
			"fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none";
		document.body.appendChild(toastContainer);
	}
	if (!toastContainer) {
		throw new Error("Toast container not available");
	}
	return toastContainer;
}

function createToastElement(message: string, type: ToastType): HTMLDivElement {
	const toast = document.createElement("div");
	toast.className = `pointer-events-auto rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-top-2 ${
		type === "success"
			? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
			: type === "error"
				? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
				: type === "warning"
					? "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200"
					: "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20 dark:border-primary/40 dark:text-primary"
	}`;
	toast.textContent = message;
	return toast;
}

export function toast(message: string, options: ToastOptions = {}): void {
	if (typeof document === "undefined") {
		console.log(`[Toast ${options.type || "info"}]: ${message}`);
		return;
	}

	const { duration = 3000, type = "info" } = options;
	const container = getToastContainer();
	const toastElement = createToastElement(message, type);

	container.appendChild(toastElement);

	setTimeout(() => {
		toastElement.style.opacity = "0";
		toastElement.style.transform = "translateY(-10px)";
		setTimeout(() => {
			if (toastElement.parentNode) {
				toastElement.parentNode.removeChild(toastElement);
			}
		}, 200);
	}, duration);
}

export const toastSuccess = (
	message: string,
	options?: Omit<ToastOptions, "type">,
) => toast(message, { ...options, type: "success" });
export const toastError = (
	message: string,
	options?: Omit<ToastOptions, "type">,
) => toast(message, { ...options, type: "error" });
export const toastInfo = (
	message: string,
	options?: Omit<ToastOptions, "type">,
) => toast(message, { ...options, type: "info" });
export const toastWarning = (
	message: string,
	options?: Omit<ToastOptions, "type">,
) => toast(message, { ...options, type: "warning" });
