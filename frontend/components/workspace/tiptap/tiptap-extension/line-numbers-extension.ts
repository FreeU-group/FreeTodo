import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface LogicalLine {
  index: number;
  pos: number;
  nodeType: string;
}

export interface LineNumbersOptions {
  countedNodeTypes: string[];
}

declare module '@tiptap/core' {
  interface Extensions {
    lineNumbers?: LineNumbersExtension;
  }
}

export const LineNumbers = Extension.create<LineNumbersOptions>({
  name: 'lineNumbers',

  addOptions() {
    return {
      countedNodeTypes: [
        'paragraph',
        'heading',
        'codeBlock',
        'bulletList',
        'orderedList',
        'taskItem',
        'blockquote',
      ],
    };
  },

  onCreate() {
    // nothing yet – React gutter will pull data via helper
  },
});

/**
 * Utility to compute logical lines from the current editor state.
 * Consumers (React gutter) can call this with the current editor.
 */
export function getLogicalLines(editor: Editor, countedNodeTypes?: string[]): LogicalLine[] {
  const { state } = editor;
  const { doc } = state;
  const types = new Set(countedNodeTypes ?? editor.extensionManager.extensions
    .find(ext => ext.name === 'lineNumbers')
     
    ?.options.countedNodeTypes as string[] | undefined ?? []);

  const lines: LogicalLine[] = [];
  let index = 1;

  doc.descendants((node: PMNode, pos: number) => {
    const typeName = node.type.name;

    // Handle list items: treat each taskItem/paragraph inside as a line
    if (typeName === 'bulletList' || typeName === 'orderedList') {
      return true; // continue into children
    }

    if (typeName === 'listItem' || typeName === 'taskItem') {
      // Use the position of the first child block as the line anchor
      const firstChild = node.firstChild;
      if (firstChild) {
        lines.push({
          index: index++,
          pos: pos + 1, // +1 to move inside the listItem node
          nodeType: firstChild.type.name,
        });
      }
      return false; // don't descend further, already counted
    }

    if (types.has(typeName) && node.isBlock) {
      lines.push({ index: index++, pos, nodeType: typeName });
      return false; // don't need to go deeper for this block
    }

    return true;
  });

  return lines;
}


