"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
	AtSign,
	Bot,
	ChevronDown,
	Loader2,
	MessageSquareMore,
	Paperclip,
	Send,
	Sparkles,
	User,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Translation } from "@/lib/i18n";

interface ChatMessage {
	id: string;
	role: "user" | "bot";
	text: string;
	timestamp: string;
}

type ChatPanelCopy = Translation["workspace"]["chatPanel"];

type ChatBotProps = {
	copy: ChatPanelCopy;
	className?: string;
	onAiEditRequest?: (instruction: string) => void;
	isAiEditing?: boolean;
	currentFileName?: string;
	onCollapse?: () => void;
	selectedContext?: string;
	onAttachFile?: () => void;
	attachedFiles?: Array<{ name: string; path: string }>;
};

const createId = () =>
	typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);

const contextOptions = [
	{ id: "workspace", label: "Workspace summary", hint: "Latest editor focus" },
	{ id: "events", label: "Recent events", hint: "Timeline insights" },
	{ id: "tasks", label: "Open tasks", hint: "Pending todos" }
];


const MessageAvatar = ({ role }: { role: ChatMessage["role"] }) => (
	<div
		className={cn(
			"flex h-9 w-9 flex-none items-center justify-center rounded-full border text-xs font-semibold",
			role === "bot" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-foreground"
		)}
	>
		{role === "bot" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
	</div>
);


export function ChatBot({ copy, className, onAiEditRequest, isAiEditing, currentFileName, onCollapse, selectedContext, onAttachFile, attachedFiles }: ChatBotProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [composerValue, setComposerValue] = useState("");
	const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
	const [showSelectedContext, setShowSelectedContext] = useState(true);

	const pendingReplyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const isSendDisabled = composerValue.trim().length === 0 || isThinking;

	useEffect(() => {
		return () => {
			if (pendingReplyTimeout.current) {
				clearTimeout(pendingReplyTimeout.current);
			}
		};
	}, []);

	useEffect(() => {
		scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isThinking]);

	const handleContextToggle = (id: string) => {
		setSelectedContexts((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
		);
	};


	const handleSendMessage = () => {
		if (isSendDisabled) {
			return;
		}

		const trimmed = composerValue.trim();
		
		// Handle /edit command for AI editing
		if (trimmed.startsWith('/edit') && onAiEditRequest) {
			const instruction = trimmed.replace('/edit', '').trim() || 'Improve this document';
			onAiEditRequest(instruction);
			setComposerValue("");
			return;
		}
		
		const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

		const userMessage: ChatMessage = {
			id: createId(),
			role: "user",
			text: trimmed,
			timestamp
		};

		setMessages((prev) => [...prev, userMessage]);
		setComposerValue("");
		setIsThinking(true);

		pendingReplyTimeout.current = setTimeout(() => {
			setMessages((prev) => [
				...prev,
				{
					id: createId(),
					role: "bot",
					text: `${copy.thinking} ${trimmed}`.trim(),
					timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
				}
			]);
			setIsThinking(false);
		}, 800);
	};

	const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	};

	const formattedPlaceholder = useMemo(
		() => copy.inputPlaceholder || "Ask, search, or make anything...",
		[copy.inputPlaceholder]
	);

  return (
    <Card className={cn("flex max-h-full flex-col border-border/70 bg-card/90 shadow-xl", className)}>
			<CardHeader className="gap-4 border-b border-border/70 pb-6">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="rounded-2xl bg-primary/10 p-2 text-primary">
							<MessageSquareMore className="h-5 w-5" />
						</div>
						<div>
							<CardTitle className="text-lg font-semibold">{copy.title}</CardTitle>
							<CardDescription>{copy.description}</CardDescription>
						</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {onCollapse && (
                      <Button onClick={onCollapse} variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronDown className="h-4 w-4 rotate-270" />
                      </Button>
                    )}
                  </div>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{selectedContexts.length > 0 && (
						<span className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1">
							<AtSign className="h-3.5 w-3.5" />
							{selectedContexts.length} context{selectedContexts.length > 1 ? "s" : ""} active
						</span>
					)}
					{isAiEditing && (
						<span className="inline-flex items-center gap-2 rounded-full border border-primary/70 bg-primary/10 px-3 py-1 text-primary">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							AI editing {currentFileName}...
						</span>
					)}
				</div>
      </CardHeader>

      <CardContent className="flex min-h-[80vh] flex-col gap-5">
        {/* 对话历史部分 */}
        <section className="flex flex-1 flex-col rounded-3xl border border-border/60 bg-card/70">
					<ScrollArea className="flex-1 px-6 py-4 max-h-screen">
						<div className="space-y-5">
							{messages.length === 0 && !isThinking ? (
								<div className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-6 text-center text-sm text-muted-foreground">
									{copy.empty}
								</div>
							) : (
								messages.map((message) => (
									<article key={message.id} className="flex items-start gap-3">
										<MessageAvatar role={message.role} />
										<div className="flex flex-1 flex-col gap-1 rounded-3xl border border-border/50 bg-background/80 p-4 shadow-sm">
											<div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
												<span className="inline-flex items-center gap-1">
													{message.role === "bot" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
													{message.role === "bot" ? "Bot" : "You"}
												</span>
												<Separator orientation="vertical" className="h-4" />
												<span>{message.timestamp}</span>
											</div>
											<p className="text-sm leading-relaxed text-foreground">{message.text}</p>
										</div>
									</article>
								))
							)}

							{isThinking && (
								<article className="flex items-start gap-3">
									<MessageAvatar role="bot" />
									<div className="flex flex-1 flex-col gap-2 rounded-3xl border border-dashed border-primary/50 bg-primary/5 p-4 text-sm text-primary">
										<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
											<Sparkles className="h-3.5 w-3.5" />
											{copy.thinking}
										</div>
										<p className="text-sm text-primary/90">{formattedPlaceholder}</p>
									</div>
								</article>
							)}

							<div ref={scrollAnchorRef} />
						</div>
					</ScrollArea>
				</section>

				{/* Context Display Section */}
				<div className="space-y-2">
					{selectedContext && showSelectedContext && (
						<div className="px-4 py-2 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
							<div className="flex items-center justify-between gap-2 mb-1">
								<div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
									<Sparkles className="h-3 w-3" />
									<span className="font-medium">Selected Text:</span>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setShowSelectedContext(false)}
									className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30"
								>
									<X className="h-3 w-3" />
								</Button>
							</div>
							<div className="text-xs text-muted-foreground bg-white dark:bg-gray-900 p-2 rounded border border-blue-200 dark:border-blue-800 max-h-20 overflow-y-auto">
								{selectedContext}
							</div>
						</div>
					)}

					{attachedFiles && attachedFiles.length > 0 && (
						<div className="px-4 py-2 border rounded-lg bg-purple-50 dark:bg-purple-950/20">
							<div className="flex items-center gap-2 mb-2 text-xs text-purple-600 dark:text-purple-400">
								<Paperclip className="h-3 w-3" />
								<span className="font-medium">Attached Files ({attachedFiles.length}):</span>
							</div>
							<div className="flex flex-wrap gap-2">
								{attachedFiles.map((file, index) => (
									<div
										key={index}
										className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white dark:bg-gray-900 rounded border border-purple-200 dark:border-purple-800"
									>
										<span className="truncate max-w-[150px]">{file.name}</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<section className="flex flex-col rounded-3xl border border-border/70 bg-background/70">


					<Textarea
						value={composerValue}
						onChange={(event) => setComposerValue(event.target.value)}
						onKeyDown={handleComposerKeyDown}
						placeholder={formattedPlaceholder}
						className="rounded-none border-0 bg-transparent px-6 py-5 text-base"
					/>

					<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
						<div className="flex items-center gap-2">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="sm" className="rounded-full border border-dashed">
										<AtSign className="mr-2 h-4 w-4" />
										Contexts
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-64">
									<DropdownMenuLabel>Quick context</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{contextOptions.map((option) => (
										<DropdownMenuItem key={option.id} onClick={() => handleContextToggle(option.id)}>
											{option.label}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
              <Button 
								variant="ghost" 
								size="icon" 
								className="h-10 w-10 rounded-full border relative"
                onClick={onAttachFile}
								disabled={!onAttachFile}
							>
								<Paperclip className="h-4 w-4" />
								{attachedFiles && attachedFiles.length > 0 && (
									<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
										{attachedFiles.length}
									</span>
								)}
							</Button>
							{onAiEditRequest && (
								<Button
									onClick={() => onAiEditRequest('Improve this document')}
									disabled={isAiEditing}
									variant="ghost"
									size="sm"
									className="rounded-full border border-dashed"
								>
									{isAiEditing ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											AI处理中...
										</>
									) : (
										<>
											<Sparkles className="mr-2 h-4 w-4" />
											AI编辑
										</>
									)}
								</Button>
							)}
						</div>

						<Button onClick={handleSendMessage} disabled={isSendDisabled} className="rounded-full px-6 shadow-lg">
							{isThinking ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Thinking
								</>
							) : (
								<>
									<Send className="mr-2 h-4 w-4" />
									{copy.send}
								</>
							)}
						</Button>
					</div>
				</section>
			</CardContent>
		</Card>
	);
}

