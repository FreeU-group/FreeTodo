import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
	title: "FreeTodo - 快速截图",
	description: "点击截图并提取待办事项",
};

interface FloatingLayoutProps {
	children: React.ReactNode;
}

/**
 * 悬浮窗独立布局
 * 不包含主应用的导航栏、侧边栏等组件
 */
export default function FloatingLayout({ children }: FloatingLayoutProps) {
	return (
		<html lang="zh" className="dark" suppressHydrationWarning>
			<body
				className="min-h-screen bg-transparent overflow-hidden"
				style={{
					// 使整个窗口可拖动
					WebkitAppRegion: "drag",
				} as React.CSSProperties}
				suppressHydrationWarning
			>
				{children}
			</body>
		</html>
	);
}
