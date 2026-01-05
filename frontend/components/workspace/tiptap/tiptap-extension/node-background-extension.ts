import type { NodeWithPos } from "@tiptap/core"
import { Extension } from "@tiptap/core"
import type { EditorState, Transaction } from "@tiptap/pm/state"
import { getSelectedNodesOfType } from "@/lib/tiptap-utils"
import { updateNodesAttr } from "@/lib/tiptap-utils"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    nodeBackground: {
      setNodeBackgroundColor: (backgroundColor: string) => ReturnType
      unsetNodeBackgroundColor: () => ReturnType
      toggleNodeBackgroundColor: (backgroundColor: string) => ReturnType
    }
  }
}

export interface NodeBackgroundOptions {
  /**
   * Node types that should support background colors
   * @default ["paragraph", "heading", "blockquote", "taskList", "bulletList", "orderedList", "tableCell", "tableHeader"]
   */
  types: string[]
  /**
   * Use inline style instead of data attribute
   * @default true
   */
  useStyle?: boolean
}

/**
 * Determines the target color for toggle operations
 */
function getToggleColor(
  targets: NodeWithPos[],
  inputColor: string
): string | null {
  if (targets.length === 0) return null

  for (const target of targets) {
    const currentColor = target.node.attrs?.backgroundColor ?? null
    if (currentColor !== inputColor) {
      return inputColor
    }
  }

  return null
}

export const NodeBackground = Extension.create<NodeBackgroundOptions>({
  name: "nodeBackground",

  addOptions() {
    return {
      types: [
        "paragraph",
        "heading",
        "blockquote",
        "taskList",
        "bulletList",
        "orderedList",
        "tableCell",
        "tableHeader",
      ],
      useStyle: true,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          backgroundColor: {
            default: null as string | null,

            parseHTML: (element: HTMLElement) => {
              const styleColor = element.style?.backgroundColor
              if (styleColor) return styleColor

              const dataColor = element.getAttribute("data-background-color")
              return dataColor || null
            },

            renderHTML: (attributes) => {
              const color = attributes.backgroundColor as string | null
              if (!color) return {}

              if (this.options.useStyle) {
                return {
                  style: `background-color: ${color}`,
                }
              } else {
                return {
                  "data-background-color": color,
                }
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    /**
     * Generic command executor for background color operations
     */
    const executeBackgroundCommand = (
      getTargetColor: (
        targets: NodeWithPos[],
        inputColor?: string
      ) => string | null
    ) => {
      return (inputColor?: string) =>
        ({ state, tr }: { state: EditorState; tr: Transaction }) => {
          const targets = getSelectedNodesOfType(
            state.selection,
            this.options.types
          )

          if (targets.length === 0) return false

          const targetColor = getTargetColor(targets, inputColor)

          return updateNodesAttr(tr, targets, "backgroundColor", targetColor)
        }
    }

    return {
      /**
       * Set background color to specific value
       */
      setNodeBackgroundColor: executeBackgroundCommand(
        (_, inputColor) => inputColor || null
      ),

      /**
       * Remove background color
       */
      unsetNodeBackgroundColor: executeBackgroundCommand(() => null),

      /**
       * Toggle background color (set if different/missing, unset if all have it)
       */
      toggleNodeBackgroundColor: executeBackgroundCommand(
        (targets, inputColor) => getToggleColor(targets, inputColor || "")
      ),
    }
  },
})
