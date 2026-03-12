"use client";

import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import MarkdownIt from "markdown-it";
import { useEffect, useMemo, useRef } from "react";
import TurndownService from "turndown";

interface NotesEditorBodyProps {
	value: string;
	placeholder: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
}

export function NotesEditorBody({
	value,
	placeholder,
	onChange,
	onBlur,
}: NotesEditorBodyProps) {
	const lastValueRef = useRef(value);

	const markdownParser = useMemo(
		() => new MarkdownIt({ breaks: true, linkify: true }),
		[],
	);
	const turndown = useMemo(() => {
		const service = new TurndownService({
			codeBlockStyle: "fenced",
			emDelimiter: "*",
		});
		service.keep(["del"]);
		return service;
	}, []);

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit,
			Placeholder.configure({
				placeholder,
				emptyEditorClass: "text-muted-foreground",
			}),
		],
		content: value ? markdownParser.render(value) : "",
		onUpdate: ({ editor }: { editor: Editor }) => {
			const html = editor.getHTML();
			const markdown = turndown.turndown(html);
			lastValueRef.current = markdown;
			onChange(markdown);
		},
		onBlur: () => {
			onBlur?.();
		},
		editorProps: {
			attributes: {
				class:
					"min-h-[140px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary",
			},
		},
	});

	useEffect(() => {
		if (!editor) return;
		if (value === lastValueRef.current) return;
		editor.commands.setContent(value ? markdownParser.render(value) : "", {
			emitUpdate: false,
		});
		lastValueRef.current = value;
	}, [editor, markdownParser, value]);

	return <EditorContent editor={editor} />;
}
