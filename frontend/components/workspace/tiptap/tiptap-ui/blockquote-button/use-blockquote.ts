"use client"

import { useCallback, useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { BlockquoteIcon } from "@/components/workspace/tiptap/tiptap-icons/blockquote-icon"

// --- UI Utils ---
import {
  findNodePosition,
  isNodeInSchema,
  isNodeTypeSelected,
  isValidPosition,
  selectionWithinConvertibleTypes,
} from "@/lib/tiptap-utils"

export const BLOCKQUOTE_SHORTCUT_KEY = "mod+shift+b"

/**
 * Configuration for the blockquote functionality
 */
export interface UseBlockquoteConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Whether the button should hide when blockquote is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful toggle.
   */
  onToggled?: () => void
}

/**
 * Checks if blockquote can be toggled in the current editor state
 */
export function canToggleBlockquote(
  editor: Editor | null,
  turnInto: boolean = true
): boolean {
  if (!editor || !editor.isEditable) return false
  if (
    !isNodeInSchema("blockquote", editor) ||
    isNodeTypeSelected(editor, ["image"])
  )
    return false

  if (!turnInto) {
    return editor.can().toggleWrap("blockquote")
  }

  // Ensure selection is in nodes we're allowed to convert
  if (
    !selectionWithinConvertibleTypes(editor, [
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "taskList",
      "blockquote",
      "codeBlock",
    ])
  )
    return false

  // Either we can wrap in blockquote directly on the selection,
  // or we can clear formatting/nodes to arrive at a blockquote.
  return editor.can().toggleWrap("blockquote") || editor.can().clearNodes()
}

/**
 * Toggles blockquote formatting for a specific node or the current selection
 */
export function toggleBlockquote(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canToggleBlockquote(editor)) return false

  try {
    const { state } = editor
    const { from, to } = state.selection

    // Handle empty selection - convert to NodeSelection
    if (state.selection.empty) {
      const pos = findNodePosition({
        editor,
        node: state.selection.$anchor.node(1),
      })?.pos
      if (!isValidPosition(pos)) return false

      const view = editor.view
      const tr = state.tr.setSelection(NodeSelection.create(state.doc, pos))
      view.dispatch(tr)
      
      const newState = view.state
      const selection = newState.selection

      let chain = editor.chain().focus()

      // Handle NodeSelection
      if (selection instanceof NodeSelection) {
        const firstChild = selection.node.firstChild?.firstChild
        const lastChild = selection.node.lastChild?.lastChild

        const nodeFrom = firstChild
          ? selection.from + firstChild.nodeSize
          : selection.from + 1

        const nodeTo = lastChild
          ? selection.to - lastChild.nodeSize
          : selection.to - 1

        const resolvedFrom = newState.doc.resolve(nodeFrom)
        const resolvedTo = newState.doc.resolve(nodeTo)

        chain = chain
          .setTextSelection(TextSelection.between(resolvedFrom, resolvedTo))
          .clearNodes()
      }

      const toggle = editor.isActive("blockquote")
        ? chain.lift("blockquote")
        : chain.wrapIn("blockquote")

      toggle.run()
      editor.chain().focus().selectTextblockEnd().run()

      return true
    }

    // Handle TextSelection - check if it spans multiple blocks
    if (state.selection instanceof TextSelection) {
      const $from = state.doc.resolve(from)
      const $to = state.doc.resolve(to)
      const range = $from.blockRange($to)

      // If selection spans multiple blocks, ensure all are included
      if (range) {
        const rangeFrom = range.start
        const rangeTo = range.end

        // Set selection to span all blocks
        editor
          .chain()
          .focus()
          .setTextSelection({ from: rangeFrom, to: rangeTo })
          .run()
      }
    }

    // Apply blockquote toggle to the entire selection
    const toggle = editor.isActive("blockquote")
      ? editor.chain().focus().lift("blockquote")
      : editor.chain().focus().wrapIn("blockquote")

    const success = toggle.run()

    if (success) {
      editor.chain().focus().selectTextblockEnd().run()
    }

    return success
  } catch {
    return false
  }
}

/**
 * Determines if the blockquote button should be shown
 */
export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = props

  if (!editor || !editor.isEditable) return false
  if (!isNodeInSchema("blockquote", editor)) return false

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canToggleBlockquote(editor)
  }

  return true
}

/**
 * Custom hook that provides blockquote functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage - no params needed
 * function MySimpleBlockquoteButton() {
 *   const { isVisible, handleToggle, isActive } = useBlockquote()
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleToggle}>Blockquote</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedBlockquoteButton() {
 *   const { isVisible, handleToggle, label, isActive } = useBlockquote({
 *     editor: myEditor,
 *     hideWhenUnavailable: true,
 *     onToggled: () => console.log('Blockquote toggled!')
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleToggle}
 *       aria-label={label}
 *       aria-pressed={isActive}
 *     >
 *       Toggle Blockquote
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useBlockquote(config?: UseBlockquoteConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onToggled,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState<boolean>(true)
  const canToggle = canToggleBlockquote(editor)
  const isActive = editor?.isActive("blockquote") || false

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowButton({ editor, hideWhenUnavailable }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  const handleToggle = useCallback(() => {
    if (!editor) return false

    const success = toggleBlockquote(editor)
    if (success) {
      onToggled?.()
    }
    return success
  }, [editor, onToggled])

  return {
    isVisible,
    isActive,
    handleToggle,
    canToggle,
    label: "Blockquote",
    shortcutKeys: BLOCKQUOTE_SHORTCUT_KEY,
    Icon: BlockquoteIcon,
  }
}
