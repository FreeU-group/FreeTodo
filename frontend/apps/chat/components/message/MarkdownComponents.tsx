import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

type MessageRole = "user" | "assistant";

/**
 * 创建 Markdown 组件配置
 * @param messageRole 消息角色，用于适配不同角色的样式
 */
export function createMarkdownComponents(
	messageRole: MessageRole,
): Partial<Components> {
	const isAssistant = messageRole === "assistant";

	return {
		h1: ({ children }) => (
			<h1
				className={cn(
					"text-lg font-bold mb-2 mt-0",
					isAssistant ? "text-foreground" : "text-primary-foreground",
				)}
			>
				{children}
			</h1>
		),
		h2: ({ children }) => (
			<h2
				className={cn(
					"text-base font-semibold mb-2 mt-3",
					isAssistant ? "text-foreground" : "text-primary-foreground",
				)}
			>
				{children}
			</h2>
		),
		h3: ({ children }) => (
			<h3
				className={cn(
					"text-sm font-semibold mb-1 mt-2",
					isAssistant ? "text-foreground" : "text-primary-foreground",
				)}
			>
				{children}
			</h3>
		),
		p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
		ul: ({ children }) => (
			<ul className="my-2 list-disc pl-5 space-y-0.5">{children}</ul>
		),
		ol: ({ children }) => (
			<ol className="my-2 list-decimal pl-5 space-y-0.5">{children}</ol>
		),
		li: ({ children }) => <li className="leading-relaxed">{children}</li>,
		strong: ({ children }) => (
			<strong className="font-semibold">{children}</strong>
		),
		code: ({ children }) => (
			<code
				className={cn(
					"px-1.5 py-0.5 rounded text-xs font-mono",
					isAssistant
						? "bg-background text-foreground"
						: "bg-primary-foreground/20 text-primary-foreground",
				)}
			>
				{children}
			</code>
		),
		pre: ({ children }) => (
			<pre
				className={cn(
					"rounded p-2 overflow-x-auto my-2 text-xs",
					isAssistant
						? "bg-background border border-border"
						: "bg-primary-foreground/20",
				)}
			>
				{children}
			</pre>
		),
		blockquote: ({ children }) => (
			<blockquote
				className={cn(
					"border-l-2 pl-3 my-2 italic",
					isAssistant
						? "border-border opacity-80"
						: "border-primary-foreground/50 opacity-90",
				)}
			>
				{children}
			</blockquote>
		),
		a: ({ href, children }) => {
			// 检查是否是内部锚点链接（来源引用）
			const isSourceLink = href?.startsWith("#source-") ?? false;
			return (
				<a
					href={href ?? "#"}
					onClick={
						isSourceLink && href
							? (e) => {
									e.preventDefault();
									const targetId = href.substring(1); // 移除 #
									const targetElement = document.getElementById(targetId);
									if (targetElement) {
										targetElement.scrollIntoView({
											behavior: "smooth",
											block: "center",
										});
										// 高亮目标元素
										targetElement.classList.add(
											"ring-2",
											"ring-primary",
											"ring-offset-2",
										);
										setTimeout(() => {
											targetElement.classList.remove(
												"ring-2",
												"ring-primary",
												"ring-offset-2",
											);
										}, 2000);
									}
								}
							: undefined
					}
					className={cn(
						isSourceLink
							? "text-primary font-medium hover:text-primary/80 no-underline"
							: "underline underline-offset-2",
						!isSourceLink && isAssistant
							? "hover:opacity-80"
							: "hover:opacity-90",
					)}
					style={
						isSourceLink
							? {
									verticalAlign: "super",
									fontSize: "0.75em",
									marginLeft: "0.1em",
								}
							: undefined
					}
					target={isSourceLink ? undefined : "_blank"}
					rel={isSourceLink ? undefined : "noopener noreferrer"}
				>
					{children}
				</a>
			);
		},
	};
}
