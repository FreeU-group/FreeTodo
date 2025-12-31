"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import {
	type Notification,
	useNotificationStore,
} from "@/lib/store/notification-store";

/**
 * Mock 通知数据生成器
 */
const MOCK_NOTIFICATIONS: Notification[] = [
	{
		id: "test-1",
		title: "新待办事项待确认",
		content: "完成项目报告",
		timestamp: new Date().toISOString(),
		source: "test",
	},
	{
		id: "test-2",
		title: "系统通知",
		content: "您有一个新的消息需要查看",
		timestamp: new Date().toISOString(),
		source: "test",
	},
	{
		id: "test-3",
		title: "提醒",
		content: "别忘了今天下午的会议",
		timestamp: new Date().toISOString(),
		source: "test",
	},
	{
		id: "test-draft-todo",
		title: "新待办事项待确认",
		content: "购买生日礼物",
		timestamp: new Date().toISOString(),
		source: "draft-todos",
		todoId: 999,
	},
];

/**
 * 通知测试按钮组件
 * 用于在开发环境中测试通知功能
 */
export function NotificationTestButton() {
	const [notificationIndex, setNotificationIndex] = useState(0);
	const { setNotification } = useNotificationStore();

	const handleTestNotification = () => {
		const notification = MOCK_NOTIFICATIONS[notificationIndex];
		if (notification) {
			// 确保每次测试都是新通知（通过添加时间戳到 ID）
			const uniqueNotification: Notification = {
				...notification,
				id: `${notification.id}-${Date.now()}`,
				timestamp: new Date().toISOString(),
			};
			setNotification(uniqueNotification);
			// 循环到下一个通知
			setNotificationIndex((prev) => (prev + 1) % MOCK_NOTIFICATIONS.length);
		}
	};

	const handleClearNotification = () => {
		setNotification(null);
	};

	return (
		<div className="flex items-center gap-2 p-2 border border-border rounded-lg bg-muted/30">
			<button
				type="button"
				onClick={handleTestNotification}
				className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
				aria-label="测试通知"
			>
				<Bell className="h-4 w-4" />
				<span>测试通知</span>
			</button>
			<button
				type="button"
				onClick={handleClearNotification}
				className="px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted transition-colors text-sm font-medium"
				aria-label="清除通知"
			>
				清除通知
			</button>
			<span className="text-xs text-muted-foreground">
				{MOCK_NOTIFICATIONS[notificationIndex]?.title}
			</span>
		</div>
	);
}
