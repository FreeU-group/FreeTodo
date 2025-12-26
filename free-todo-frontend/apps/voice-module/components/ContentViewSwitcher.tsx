/**
 * 内容视图切换组件
 * 支持三种视图：原文、概览（章节纪要）、智能纪要
 */

import { FileText, List, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContentViewType = "original" | "overview" | "summary";

interface ContentViewSwitcherProps {
  currentView: ContentViewType;
  onViewChange: (view: ContentViewType) => void;
}

const VIEW_OPTIONS: {
  id: ContentViewType;
  label: string;
  icon: typeof FileText;
  description: string;
}[] = [
  {
    id: "original",
    label: "原文",
    icon: FileText,
    description: "转录的原始文本",
  },
  {
    id: "overview",
    label: "概览",
    icon: List,
    description: "章节纪要",
  },
  {
    id: "summary",
    label: "智能纪要",
    icon: Sparkles,
    description: "段落总结",
  },
];

export function ContentViewSwitcher({
  currentView,
  onViewChange,
}: ContentViewSwitcherProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border border-border/50">
      {VIEW_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = currentView === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onViewChange(option.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
              "text-sm font-medium",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title={option.description}
          >
            <Icon className="w-4 h-4" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

