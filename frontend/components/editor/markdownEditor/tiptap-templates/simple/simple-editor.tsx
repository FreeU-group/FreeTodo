"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"

// --- UI Primitives ---
import { Button } from "@/components/editor/markdownEditor/tiptap-ui-primitive/button"
import { Spacer } from "@/components/editor/markdownEditor/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/editor/markdownEditor/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/editor/markdownEditor/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/editor/markdownEditor/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/editor/markdownEditor/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/editor/markdownEditor/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/editor/markdownEditor/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/editor/markdownEditor/tiptap-node/list-node/list-node.scss"
import "@/components/editor/markdownEditor/tiptap-node/image-node/image-node.scss"
import "@/components/editor/markdownEditor/tiptap-node/heading-node/heading-node.scss"
import "@/components/editor/markdownEditor/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/editor/markdownEditor/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/editor/markdownEditor/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/editor/markdownEditor/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/editor/markdownEditor/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/editor/markdownEditor/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/editor/markdownEditor/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/editor/markdownEditor/tiptap-ui/link-popover"
import { MarkButton } from "@/components/editor/markdownEditor/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/editor/markdownEditor/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/editor/markdownEditor/tiptap-ui/undo-redo-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/editor/markdownEditor/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/editor/markdownEditor/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/editor/markdownEditor/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/tiptapHooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/tiptapHooks/use-window-size"
import { useCursorVisibility } from "@/hooks/tiptapHooks/use-cursor-visibility"

// --- Components ---
// import { ThemeToggle } from "@/components/editor/markdownEditor/tiptap-templates/simple/theme-toggle"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap/tiptap-utils"
import { cn } from "@/lib/utils"

// --- Styles ---
import "@/components/editor/markdownEditor/tiptap-templates/simple/simple-editor.scss"

import content from "@/components/editor/markdownEditor/tiptap-templates/simple/data/content.json"
import { marked } from "marked"
import TurndownService from "turndown"

marked.setOptions({ gfm: true, breaks: true })

export interface SimpleEditorProps {
  markdown?: string
  onMarkdownChange?: (markdown: string) => void
  onDirtyChange?: (dirty: boolean) => void
  readOnly?: boolean
  className?: string
  onSelectionChange?: (selectedText: string) => void
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} portal={isMobile} />
        <ListDropdownMenu
          types={["bulletList", "orderedList", "taskList"]}
          portal={isMobile}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        {/* <ThemeToggle /> */}
      </ToolbarGroup>
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button data-style="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor({
  markdown,
  onMarkdownChange,
  onDirtyChange,
  readOnly = false,
  className,
  onSelectionChange,
}: SimpleEditorProps = {}) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const toolbarRef = useRef<HTMLDivElement>(null)
  const lastSyncedMarkdown = useRef<string>("")
  const isApplyingExternalContent = useRef(false)

  const turndown = useMemo(() => {
    const instance = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    })
    instance.addRule("lineBreak", {
      filter: "br",
      replacement: () => "  \n",
    })
    return instance
  }, [])

  const markdownToHtml = useCallback((value: string | undefined) => {
    if (!value) return "<p></p>"
    const parsed = marked.parse(value)
    return typeof parsed === "string" ? parsed : "<p></p>"
  }, [])

  const htmlToMarkdown = useCallback(
    (value: string) => turndown.turndown(value || ""),
    [turndown]
  )

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        class: "simple-editor",
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error("Upload failed:", error),
      }),
    ],
    content,
  })

  const [toolbarHeight, setToolbarHeight] = useState(0)

  useEffect(() => {
    const element = toolbarRef.current
    if (!element) {
      return
    }

    const updateHeight = () => {
      const rect = element.getBoundingClientRect()
      setToolbarHeight(rect.height)
    }

    updateHeight()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        if (!entries.length) return
        setToolbarHeight(entries[0].contentRect.height)
      })
      observer.observe(element)
      return () => observer.disconnect()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateHeight)
      return () => window.removeEventListener("resize", updateHeight)
    }
  }, [])

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarHeight,
  })

  const activeMobileView = isMobile ? mobileView : "main"

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  // Track text selection
  useEffect(() => {
    if (!editor || !onSelectionChange) return

    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection
      if (from !== to) {
        const selectedText = editor.state.doc.textBetween(from, to, ' ')
        onSelectionChange(selectedText)
      } else {
        onSelectionChange('')
      }
    }

    editor.on('selectionUpdate', handleSelectionUpdate)

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor, onSelectionChange])

  useEffect(() => {
    if (!editor || markdown === undefined) return
    if (markdown === lastSyncedMarkdown.current) {
      return
    }
    isApplyingExternalContent.current = true
    editor.commands.setContent(markdownToHtml(markdown), { emitUpdate: false })
    lastSyncedMarkdown.current = markdown
    onDirtyChange?.(false)
    // Extend the lock to ensure editor update handler doesn't fire immediately
    const timer = setTimeout(() => {
      isApplyingExternalContent.current = false
    }, 50)
    return () => clearTimeout(timer)
  }, [editor, markdown, markdownToHtml, onDirtyChange])

  useEffect(() => {
    if (!editor) return
    const handler = () => {
      if (isApplyingExternalContent.current) {
        return
      }
      const html = editor.getHTML()
      const nextMarkdown = htmlToMarkdown(html)
      
      // Only mark as dirty if markdown actually changed
      if (nextMarkdown !== lastSyncedMarkdown.current) {
        lastSyncedMarkdown.current = nextMarkdown
        onMarkdownChange?.(nextMarkdown)
        onDirtyChange?.(true)
      }
    }
    editor.on("update", handler)
    return () => {
      editor.off("update", handler)
    }
  }, [editor, htmlToMarkdown, onDirtyChange, onMarkdownChange])

  return (
    <div className={cn("simple-editor-wrapper", className)}>
      <EditorContext.Provider value={{ editor }}>
        <div className="simple-editor-scroll">
          <Toolbar
            ref={toolbarRef}
            style={{
              ...(isMobile
                ? {
                    bottom: `calc(100% - ${height - rect.y}px)`,
                  }
                : {}),
            }}
          >
            {activeMobileView === "main" ? (
              <MainToolbarContent
                onHighlighterClick={() => isMobile && setMobileView("highlighter")}
                onLinkClick={() => isMobile && setMobileView("link")}
                isMobile={isMobile}
              />
            ) : (
              <MobileToolbarContent
                type={activeMobileView === "highlighter" ? "highlighter" : "link"}
                onBack={() => setMobileView("main")}
              />
            )}
          </Toolbar>

          <EditorContent
            editor={editor}
            role="presentation"
            className="simple-editor-content"
          />
        </div>
      </EditorContext.Provider>
    </div>
  )
}
