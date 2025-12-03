import React, { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { getLogicalLines, type LogicalLine } from '../../tiptap-extension/line-numbers-extension';

interface LineNumberGutterProps {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface LineWithCoords extends LogicalLine {
  top: number;
}

export function LineNumberGutter({ editor, containerRef }: LineNumberGutterProps) {
  const [linesWithCoords, setLinesWithCoords] = useState<LineWithCoords[]>([]);

  const recompute = useMemo(
    () => () => {
      if (!editor || !containerRef.current) return;

      const view = editor.view;
      const containerRect = containerRef.current.getBoundingClientRect();

      const logicalLines = getLogicalLines(editor);

      const next: LineWithCoords[] = [];
      for (const line of logicalLines) {
        try {
          const coords = view.coordsAtPos(line.pos);
          const top = coords.top - containerRect.top + containerRef.current.scrollTop;
          next.push({ ...line, top });
        } catch {
          // ignore lines that can't be resolved (e.g. off-DOM during IME)
        }
      }

      setLinesWithCoords(next);
    },
    [editor, containerRef]
  );

  useEffect(() => {
    if (!editor) return;

    const updateHandler = () => {
      recompute();
    };

    editor.on('update', updateHandler);
    editor.on('selectionUpdate', updateHandler);

    // 初次挂载时异步触发行号计算，保证加载新文件后立即显示行号
    const frameId = window.requestAnimationFrame(() => {
      recompute();
    });

    return () => {
      editor.off('update', updateHandler);
      editor.off('selectionUpdate', updateHandler);
      window.cancelAnimationFrame(frameId);
    };
  }, [editor, recompute]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      recompute();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef, recompute]);

  // Active line highlight based on current selection
  const activeIndex = useMemo(() => {
    if (!editor) return null;
    const pos = editor.state.selection.from;
    let current: number | null = null;

    for (const line of linesWithCoords) {
      if (line.pos <= pos) {
        current = line.index;
      } else {
        break;
      }
    }

    return current;
  }, [editor, linesWithCoords]);

  return (
    <div className="absolute left-0 top-0 h-full pointer-events-none">
      {linesWithCoords.map((line, i) => {
        const nextTop = linesWithCoords[i + 1]?.top ?? line.top + 24; // fallback 行高约 24px
        const height = Math.max(nextTop - line.top, 16); // 保证最小高度，避免过小

        return (
          <div
            key={line.index}
            className={
              'tiptap-line-number pointer-events-none select-none text-xs text-muted-foreground text-right pr-2 flex items-center justify-center' +
              (activeIndex === line.index ? ' font-bold' : '')
            }
            style={{
              position: 'absolute',
              top: `${line.top}px`,
              height: `${height}px`,
              width: '2rem',
              // 使用中等透明度的横线帮助肉眼对齐（首行不画线）
              borderTop: line.index === 1 ? 'none' : '1px solid rgba(148, 163, 184, 0.4)', // slate-400 / 40%
            }}
          >
            {line.index}
          </div>
        );
      })}
    </div>
  );
}


