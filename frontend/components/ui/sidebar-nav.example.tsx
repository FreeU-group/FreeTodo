/**
 * Shadcn 风格侧边栏导航组件使用示例
 *
 * 这个文件展示了如何使用新的 shadcn 标准侧边栏组件
 */

"use client";

import {
	BarChart2,
	Bell,
	Calendar,
	FileText,
	Home,
	MessageSquare,
	Settings,
	Users,
} from "lucide-react";
import { useState } from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarNav,
} from "./sidebar-nav";

// ============================================
// 示例 1: 基础用法
// ============================================

export function BasicSidebarExample() {
	const [activeMenu, setActiveMenu] = useState("home");

	const menuItems = [
		{ id: "home", label: "首页", icon: Home },
		{ id: "events", label: "事件管理", icon: Calendar },
		{ id: "analytics", label: "行为分析", icon: BarChart2 },
		{ id: "settings", label: "设置", icon: Settings },
	];

	return (
		<Sidebar className="w-56">
			<SidebarContent>
				<SidebarNav
					items={menuItems}
					activeItem={activeMenu}
					onItemClick={setActiveMenu}
				/>
			</SidebarContent>
		</Sidebar>
	);
}

// ============================================
// 示例 2: 带 Badge 的菜单
// ============================================

export function SidebarWithBadges() {
	const [activeMenu, setActiveMenu] = useState("home");

	const menuItems = [
		{ id: "home", label: "首页", icon: Home },
		{ id: "messages", label: "消息", icon: MessageSquare, badge: 5 },
		{ id: "notifications", label: "通知", icon: Bell, badge: "NEW" },
		{ id: "users", label: "用户管理", icon: Users, badge: 12 },
	];

	return (
		<Sidebar className="w-64">
			<SidebarContent>
				<SidebarNav
					items={menuItems}
					activeItem={activeMenu}
					onItemClick={setActiveMenu}
				/>
			</SidebarContent>
		</Sidebar>
	);
}

// ============================================
// 示例 3: 完整布局（带头部和底部）
// ============================================

export function FullSidebarExample() {
	const [activeMenu, setActiveMenu] = useState("events");

	const menuItems = [
		{ id: "events", label: "事件管理", icon: Calendar },
		{ id: "analytics", label: "行为分析", icon: BarChart2 },
		{ id: "plan", label: "工作计划", icon: FileText },
	];

	return (
		<Sidebar className="w-64">
			{/* 头部区域 */}
			<SidebarHeader>
				<div className="flex items-center gap-3">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<Home className="h-4 w-4" />
					</div>
					<div>
						<h2 className="text-sm font-semibold">LifeTrace</h2>
						<p className="text-xs text-muted-foreground">智能生活记录系统</p>
					</div>
				</div>
			</SidebarHeader>

			{/* 内容区域 */}
			<SidebarContent>
				<div className="space-y-4">
					{/* 主导航 */}
					<div>
						<p className="mb-2 px-3 text-xs font-semibold text-muted-foreground">
							主要功能
						</p>
						<SidebarNav
							items={menuItems}
							activeItem={activeMenu}
							onItemClick={setActiveMenu}
						/>
					</div>

					{/* 其他菜单组 */}
					<div>
						<p className="mb-2 px-3 text-xs font-semibold text-muted-foreground">
							其他
						</p>
						<SidebarNav
							items={[{ id: "settings", label: "设置", icon: Settings }]}
							activeItem={activeMenu}
							onItemClick={setActiveMenu}
						/>
					</div>
				</div>
			</SidebarContent>

			{/* 底部区域 */}
			<SidebarFooter>
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
						<span className="text-xs font-medium">AI</span>
					</div>
					<div className="flex-1 text-xs">
						<p className="font-medium">AI 助手</p>
						<p className="text-muted-foreground">在线</p>
					</div>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

// ============================================
// 示例 4: 禁用状态
// ============================================

export function SidebarWithDisabledItems() {
	const [activeMenu, setActiveMenu] = useState("home");

	const menuItems = [
		{ id: "home", label: "首页", icon: Home },
		{ id: "events", label: "事件管理", icon: Calendar },
		{ id: "analytics", label: "行为分析", icon: BarChart2, disabled: true },
		{ id: "plan", label: "工作计划", icon: FileText, disabled: true },
	];

	return (
		<Sidebar className="w-56">
			<SidebarContent>
				<SidebarNav
					items={menuItems}
					activeItem={activeMenu}
					onItemClick={setActiveMenu}
				/>
				<div className="mt-4 px-3">
					<p className="text-xs text-muted-foreground">某些功能暂未开放</p>
				</div>
			</SidebarContent>
		</Sidebar>
	);
}

// ============================================
// 示例 5: 实际应用（LifeTrace）
// ============================================

export function LifeTraceSidebar() {
	const [activeMenu, setActiveMenu] = useState<"events" | "analytics" | "plan">(
		"events",
	);

	const menuItems = [
		{ id: "events", label: "事件管理", icon: Calendar },
		{ id: "analytics", label: "行为分析", icon: BarChart2 },
		{ id: "plan", label: "工作计划", icon: FileText },
	];

	const handleMenuClick = (id: string) => {
		setActiveMenu(id as "events" | "analytics" | "plan");
		// 这里可以添加路由跳转逻辑
		console.log("切换到:", id);
	};

	return (
		<Sidebar className="w-56 flex-shrink-0 h-full">
			<SidebarContent>
				<SidebarNav
					items={menuItems}
					activeItem={activeMenu}
					onItemClick={handleMenuClick}
				/>
			</SidebarContent>
		</Sidebar>
	);
}

// ============================================
// 示例 6: 响应式布局
// ============================================

export function ResponsiveSidebar() {
	const [activeMenu, setActiveMenu] = useState("home");
	const [isCollapsed, setIsCollapsed] = useState(false);

	const menuItems = [
		{ id: "home", label: "首页", icon: Home },
		{ id: "events", label: "事件管理", icon: Calendar },
		{ id: "analytics", label: "行为分析", icon: BarChart2 },
	];

	return (
		<Sidebar className={isCollapsed ? "w-16" : "w-56"}>
			<SidebarHeader>
				<button
					onClick={() => setIsCollapsed(!isCollapsed)}
					className="flex w-full items-center justify-between rounded-lg p-2 hover:bg-accent"
				>
					{!isCollapsed && <span className="text-sm font-semibold">菜单</span>}
					<svg
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
				</button>
			</SidebarHeader>

			<SidebarContent>
				<SidebarNav
					items={menuItems}
					activeItem={activeMenu}
					onItemClick={setActiveMenu}
				/>
			</SidebarContent>
		</Sidebar>
	);
}

// ============================================
// 使用说明
// ============================================

/**
 * 键盘导航:
 * - Tab: 在菜单项之间移动
 * - Enter / Space: 激活当前菜单项
 *
 * 可访问性:
 * - 所有菜单项都有适当的 ARIA 标签
 * - 当前激活的菜单项会被标记为 aria-current="page"
 * - 支持屏幕阅读器
 *
 * 主题:
 * - 自动适配深色/浅色主题
 * - 使用 CSS 变量，可轻松自定义
 *
 * 自定义样式:
 * - 所有组件都接受 className 属性
 * - 使用 Tailwind CSS 类名
 */
