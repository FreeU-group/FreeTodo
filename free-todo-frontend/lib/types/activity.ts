import type { Event } from "@/lib/types/event";

// 基础活动类型，对齐后端 Activity 模型字段
export interface Activity {
	id: number;
	start_time: string;
	end_time: string;
	ai_title?: string | null;
	ai_summary?: string | null;
	event_count: number;
	created_at?: string;
	updated_at?: string;
}

// 带关联事件的活动详情（前端聚合）
export interface ActivityWithEvents extends Activity {
	event_ids?: number[];
	events?: Event[];
}
