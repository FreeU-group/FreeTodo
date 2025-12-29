import { useCallback } from "react";
import type { ParsedTodoTree } from "@/apps/chat/types";
import { planQuestionnaireStream, planSummaryStream } from "@/lib/api";
import type { Question } from "@/lib/store/breakdown-store";

interface GenerateQuestionsResponse {
	questions: Question[];
}

interface GenerateSummaryResponse {
	summary: string;
	subtasks: ParsedTodoTree[];
}

const findJson = (content: string): string | null => {
	// 1. 尝试匹配 ```json ... ```
	const fencedJson = content.match(/```json\s*([\s\S]*?)```/i);
	if (fencedJson?.[1]) {
		const json = fencedJson[1].trim();
		if (json) return json;
	}

	// 2. 尝试匹配 ``` ... ``` (可能是代码块但没有json标记)
	const fenced = content.match(/```\s*([\s\S]*?)```/);
	if (fenced?.[1]) {
		const json = fenced[1].trim();
		// 检查是否看起来像JSON
		if (
			json.startsWith("{") &&
			(json.includes("questions") || json.includes("summary"))
		) {
			return json;
		}
	}

	// 3. 尝试找到第一个完整的JSON对象（从第一个 { 到匹配的 }）
	// 使用括号匹配来找到完整的JSON对象
	let braceCount = 0;
	let startIdx = -1;
	let inString = false;
	let escapeNext = false;

	for (let i = 0; i < content.length; i++) {
		const char = content[i];

		if (escapeNext) {
			escapeNext = false;
			continue;
		}

		if (char === "\\") {
			escapeNext = true;
			continue;
		}

		if (char === '"' && !escapeNext) {
			inString = !inString;
			continue;
		}

		if (inString) continue;

		if (char === "{") {
			if (startIdx === -1) startIdx = i;
			braceCount++;
		} else if (char === "}") {
			braceCount--;
			if (braceCount === 0 && startIdx !== -1) {
				const json = content.substring(startIdx, i + 1);
				// 验证是否包含我们需要的字段
				if (json.includes("questions") || json.includes("summary")) {
					return json;
				}
				startIdx = -1;
			}
		}
	}

	return null;
};

// 尝试修复常见的JSON错误
const tryFixJson = (jsonText: string): string => {
	let fixed = jsonText.trim();

	// 移除可能的尾随逗号（在数组或对象末尾）
	fixed = fixed.replace(/,(\s*[}\]])/g, "$1");

	// 尝试修复数组中的尾随逗号
	fixed = fixed.replace(/,\s*]/g, "]");

	// 尝试修复对象中的尾随逗号
	fixed = fixed.replace(/,\s*}/g, "}");

	// 尝试修复未闭合的字符串（简单情况）
	// 注意：这个修复可能不完美，但可以处理一些常见情况

	return fixed;
};

// 尝试从不完整的流式响应中解析问题数量和标题
const tryParseStreamingQuestions = (
	text: string,
): { count: number; title: string | null } => {
	// 尝试找到 questions 数组
	const questionsMatch = text.match(/"questions"\s*:\s*\[/);
	if (!questionsMatch) {
		return { count: 0, title: null };
	}

	const afterQuestions = text.substring(
		(questionsMatch.index ?? 0) + questionsMatch[0].length,
	);

	// 尝试提取所有问题标题
	const questionTitles: string[] = [];
	const questionMatches = afterQuestions.matchAll(
		/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
	);

	for (const match of questionMatches) {
		if (match[1]) {
			questionTitles.push(match[1].replace(/\\"/g, '"')); // 处理转义的引号
		}
	}

	const count = questionTitles.length;
	const title = count > 0 ? questionTitles[count - 1] : null;

	return { count, title };
};

export const useBreakdownService = () => {
	const generateQuestions = useCallback(
		async (
			todoName: string,
			todoId?: number,
			onStreaming?: (count: number, title: string | null) => void,
		): Promise<Question[]> => {
			let fullResponse = "";

			console.log(
				"[Breakdown] 发送问题生成请求，任务名称:",
				todoName,
				"任务ID:",
				todoId,
			);
			await planQuestionnaireStream(
				todoName,
				(chunk) => {
					fullResponse += chunk;
					// 实时解析问题数量和标题
					if (onStreaming) {
						const { count, title } = tryParseStreamingQuestions(fullResponse);
						if (count > 0 || title) {
							onStreaming(count, title);
						}
					}
				},
				todoId,
			);
			console.log("[Breakdown] 收到完整响应，长度:", fullResponse.length);
			console.log("[Breakdown] 完整响应内容:", fullResponse);

			const jsonText = findJson(fullResponse);
			if (!jsonText) {
				console.error(
					"[Breakdown] 无法从响应中提取JSON，响应内容:",
					fullResponse,
				);
				throw new Error(
					`未找到问题JSON，请重试。响应内容：${fullResponse.substring(0, 200)}`,
				);
			}
			console.log("[Breakdown] 提取的JSON文本:", jsonText);

			try {
				// 先尝试直接解析
				let parsed: GenerateQuestionsResponse;
				try {
					parsed = JSON.parse(jsonText) as GenerateQuestionsResponse;
				} catch (parseError) {
					// 如果解析失败，尝试修复JSON
					console.warn("[Breakdown] JSON解析失败，尝试修复:", parseError);
					console.warn(
						"[Breakdown] 原始JSON文本（前500字符）:",
						jsonText.substring(0, 500),
					);
					const fixedJson = tryFixJson(jsonText);
					console.log(
						"[Breakdown] 修复后的JSON（前500字符）:",
						fixedJson.substring(0, 500),
					);
					try {
						parsed = JSON.parse(fixedJson) as GenerateQuestionsResponse;
					} catch (fixError) {
						console.error("[Breakdown] 修复后仍然无法解析:", fixError);
						// 显示JSON文本的详细位置信息
						const errorMsg =
							fixError instanceof Error ? fixError.message : String(fixError);
						const positionMatch = errorMsg.match(/position (\d+)/);
						if (positionMatch) {
							const pos = Number.parseInt(positionMatch[1], 10);
							const start = Math.max(0, pos - 50);
							const end = Math.min(fixedJson.length, pos + 50);
							console.error(
								"[Breakdown] JSON错误位置附近的文本:",
								fixedJson.substring(start, end),
							);
							console.error(
								"[Breakdown] 错误位置:",
								pos,
								"字符:",
								fixedJson[pos],
							);
						}
						throw new Error(
							`JSON解析失败：${errorMsg}。请检查LLM返回的JSON格式。`,
						);
					}
				}

				if (!Array.isArray(parsed.questions)) {
					throw new Error("Invalid questions format");
				}

				// 验证和规范化问题
				const questions: Question[] = parsed.questions
					.map((q, index) => {
						if (
							!q ||
							typeof q.question !== "string" ||
							!Array.isArray(q.options)
						) {
							return null;
						}
						return {
							id: q.id || `q${index + 1}`,
							question: q.question.trim(),
							options: q.options
								.filter((opt): opt is string => typeof opt === "string")
								.map((opt) => opt.trim())
								.filter(Boolean),
							// type 字段可选，默认多选，不再从 LLM 响应中读取
						};
					})
					.filter((q): q is Question => q !== null && q.options.length > 0);

				if (questions.length === 0) {
					throw new Error("No valid questions generated");
				}

				return questions;
			} catch (err) {
				console.error("Failed to parse questions:", err);
				throw new Error("解析问题失败，请重试。");
			}
		},
		[],
	);

	const generateSummary = useCallback(
		async (
			todoName: string,
			answers: Record<string, string[]>,
			onStreaming?: (chunk: string) => void,
		): Promise<{ summary: string; subtasks: ParsedTodoTree[] }> => {
			let fullResponse = "";

			console.log(
				"[Breakdown] 发送总结生成请求，任务名称:",
				todoName,
				"回答数量:",
				Object.keys(answers).length,
			);
			await planSummaryStream(todoName, answers, (chunk) => {
				fullResponse += chunk;
				// 如果提供了流式回调，实时更新
				if (onStreaming) {
					onStreaming(fullResponse);
				}
			});
			console.log("[Breakdown] 收到完整响应，长度:", fullResponse.length);
			console.log("[Breakdown] 完整响应内容:", fullResponse);

			const jsonText = findJson(fullResponse);
			if (!jsonText) {
				console.error(
					"[Breakdown] 无法从响应中提取JSON，响应内容:",
					fullResponse,
				);
				throw new Error(
					`未找到总结JSON，请重试。响应内容：${fullResponse.substring(0, 200)}`,
				);
			}
			console.log("[Breakdown] 提取的JSON文本:", jsonText);

			try {
				// 先尝试直接解析
				let parsed: GenerateSummaryResponse;
				try {
					parsed = JSON.parse(jsonText) as GenerateSummaryResponse;
				} catch (parseError) {
					// 如果解析失败，尝试修复JSON
					console.warn("[Breakdown] JSON解析失败，尝试修复:", parseError);
					console.warn(
						"[Breakdown] 原始JSON文本（前500字符）:",
						jsonText.substring(0, 500),
					);
					const fixedJson = tryFixJson(jsonText);
					console.log(
						"[Breakdown] 修复后的JSON（前500字符）:",
						fixedJson.substring(0, 500),
					);
					try {
						parsed = JSON.parse(fixedJson) as GenerateSummaryResponse;
					} catch (fixError) {
						console.error("[Breakdown] 修复后仍然无法解析:", fixError);
						// 显示JSON文本的详细位置信息
						const errorMsg =
							fixError instanceof Error ? fixError.message : String(fixError);
						const positionMatch = errorMsg.match(/position (\d+)/);
						if (positionMatch) {
							const pos = Number.parseInt(positionMatch[1], 10);
							const start = Math.max(0, pos - 50);
							const end = Math.min(fixedJson.length, pos + 50);
							console.error(
								"[Breakdown] JSON错误位置附近的文本:",
								fixedJson.substring(start, end),
							);
							console.error(
								"[Breakdown] 错误位置:",
								pos,
								"字符:",
								fixedJson[pos],
							);
						}
						throw new Error(
							`JSON解析失败：${errorMsg}。请检查LLM返回的JSON格式。`,
						);
					}
				}

				if (
					typeof parsed.summary !== "string" ||
					!Array.isArray(parsed.subtasks)
				) {
					throw new Error("Invalid summary format");
				}

				// 验证和规范化子任务
				const normalizeTodo = (item: unknown): ParsedTodoTree | null => {
					if (!item || typeof (item as { name?: unknown }).name !== "string") {
						return null;
					}
					const rawName = (item as { name: string }).name.trim();
					if (!rawName) return null;

					const rawDescription = (item as { description?: unknown })
						.description;
					const description =
						typeof rawDescription === "string" && rawDescription.trim()
							? rawDescription.trim()
							: undefined;

					const rawOrder = (item as { order?: unknown }).order;
					const order =
						typeof rawOrder === "number" && !Number.isNaN(rawOrder)
							? rawOrder
							: undefined;

					const rawSubtasks = (item as { subtasks?: unknown }).subtasks;
					const subtasks = Array.isArray(rawSubtasks)
						? rawSubtasks
								.map((task: unknown) => normalizeTodo(task))
								.filter((task): task is ParsedTodoTree => Boolean(task))
						: undefined;

					return {
						name: rawName,
						description,
						order,
						subtasks,
					};
				};

				const subtasks: ParsedTodoTree[] = parsed.subtasks
					.map((item: unknown) => normalizeTodo(item))
					.filter(
						(item: ParsedTodoTree | null | undefined): item is ParsedTodoTree =>
							Boolean(item),
					);

				return {
					summary: parsed.summary.trim(),
					subtasks,
				};
			} catch (err) {
				console.error("Failed to parse summary:", err);
				throw new Error("解析总结失败，请重试。");
			}
		},
		[],
	);

	return {
		generateQuestions,
		generateSummary,
	};
};
