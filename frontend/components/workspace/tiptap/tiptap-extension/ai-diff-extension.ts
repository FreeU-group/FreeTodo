import { Mark, mergeAttributes } from '@tiptap/core';

export interface AIDiffOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiDiff: {
      /**
       * Set AI diff delete mark (red background, strikethrough)
       */
      setAIDiffDelete: () => ReturnType;
      /**
       * Set AI diff insert mark (green background)
       */
      setAIDiffInsert: () => ReturnType;
      /**
       * Toggle AI diff delete mark
       */
      toggleAIDiffDelete: () => ReturnType;
      /**
       * Toggle AI diff insert mark
       */
      toggleAIDiffInsert: () => ReturnType;
      /**
       * Unset AI diff delete mark
       */
      unsetAIDiffDelete: () => ReturnType;
      /**
       * Unset AI diff insert mark
       */
      unsetAIDiffInsert: () => ReturnType;
      /**
       * Clear all AI diff marks
       */
      clearAIDiff: () => ReturnType;
    };
  }
}

/**
 * AI Diff Delete Mark Extension
 * Displays deleted text with red background and strikethrough
 */
export const AIDiffDelete = Mark.create<AIDiffOptions>({
  name: 'aiDiffDelete',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-ai-diff="delete"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-ai-diff': 'delete',
        class: 'ai-diff-delete',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAIDiffDelete:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleAIDiffDelete:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetAIDiffDelete:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

/**
 * AI Diff Insert Mark Extension
 * Displays inserted text with green background
 */
export const AIDiffInsert = Mark.create<AIDiffOptions>({
  name: 'aiDiffInsert',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-ai-diff="insert"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-ai-diff': 'insert',
        class: 'ai-diff-insert',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAIDiffInsert:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleAIDiffInsert:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetAIDiffInsert:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

/**
 * Combined command to clear all AI diff marks
 */
export const createClearAIDiffCommand = () => {
  return {
    clearAIDiff:
      () =>
      ({ commands, state }: any) => {
        const { from, to } = state.selection;
        return commands
          .setTextSelection({ from: 0, to: state.doc.content.size })
          .unsetMark('aiDiffDelete')
          .unsetMark('aiDiffInsert')
          .setTextSelection({ from, to });
      },
  };
};
