import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ActivitySummaryProps {
	summary?: string | null;
}

const markdownComponents: Components = {
	// 自定义标题样式
	h1: ({ node: _node, ...props }) => (
		<h1
			className="text-lg font-semibold text-foreground mt-4 mb-2"
			{...props}
		/>
	),
	h2: ({ node: _node, ...props }) => (
		<h2
			className="text-base font-semibold text-foreground mt-3 mb-2"
			{...props}
		/>
	),
	h3: ({ node: _node, ...props }) => (
		<h3
			className="text-sm font-semibold text-foreground mt-3 mb-1"
			{...props}
		/>
	),
	// 自定义段落样式
	p: ({ node: _node, ...props }) => (
		<p className="text-sm text-foreground leading-relaxed my-2" {...props} />
	),
	// 自定义列表样式
	ul: ({ node: _node, ...props }) => (
		<ul
			className="list-disc list-inside text-sm text-foreground my-2 space-y-1"
			{...props}
		/>
	),
	ol: ({ node: _node, ...props }) => (
		<ol
			className="list-decimal list-inside text-sm text-foreground my-2 space-y-1"
			{...props}
		/>
	),
	li: ({ node: _node, ...props }) => (
		<li className="text-sm text-foreground" {...props} />
	),
	// 自定义粗体和斜体
	strong: ({ node: _node, ...props }) => (
		<strong className="font-semibold text-foreground" {...props} />
	),
	em: ({ node: _node, ...props }) => (
		<em className="italic text-foreground" {...props} />
	),
	// 自定义代码块
	code: ({ node: _node, className, children, ...props }) => {
		const isInline = !className;
		return isInline ? (
			<code
				className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground"
				{...props}
			>
				{children}
			</code>
		) : (
			<code className={className} {...props}>
				{children}
			</code>
		);
	},
	pre: ({ node: _node, ...props }) => (
		<pre
			className="rounded-lg bg-muted p-3 overflow-x-auto text-xs my-2"
			{...props}
		/>
	),
	// 自定义链接
	a: ({ node: _node, ...props }) => (
		<a
			className="text-primary underline underline-offset-2 hover:text-primary/80"
			target="_blank"
			rel="noopener noreferrer"
			{...props}
		/>
	),
};

export function ActivitySummary({ summary }: ActivitySummaryProps) {
	if (!summary) {
		return (
			<div className="rounded-lg border border-dashed border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
				No summary yet. Select an activity to view details.
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0 rounded-lg border border-border bg-secondary p-4">
			<h4 className="text-sm font-semibold text-foreground mb-3 shrink-0">
				Summary
			</h4>
			<div
				className="markdown-content overflow-y-auto flex-1 min-h-0 pr-2"
				style={{ scrollbarWidth: "thin" }}
			>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={markdownComponents}
				>
					{summary}
				</ReactMarkdown>
			</div>
		</div>
	);
}
