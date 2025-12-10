// 截图类型
export interface Screenshot {
	id: number;
	file_path: string;
	app_name: string;
	window_title: string;
	created_at: string;
	text_content?: string;
	width: number;
	height: number;
	ocr_result?: {
		text_content: string;
	};
}

// 事件类型
export interface Event {
	id: number;
	app_name: string;
	window_title: string;
	start_time: string;
	end_time?: string;
	screenshot_count: number;
	first_screenshot_id?: number;
	screenshots?: Screenshot[];
	ai_summary?: string;
}
