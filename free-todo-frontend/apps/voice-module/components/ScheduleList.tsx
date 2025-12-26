/**
 * 日程列表组件
 * 展示提取到的日程安排
 */

import { Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleItem } from "../types";

interface ScheduleListProps {
  schedules: ScheduleItem[];
  onScheduleClick?: (schedule: ScheduleItem) => void;
  selectedDate: Date;
}

export function ScheduleList({
  schedules,
  onScheduleClick,
  selectedDate,
}: ScheduleListProps) {
  // 过滤当前日期的日程
  const filteredSchedules = schedules.filter(s => {
    const scheduleDate = new Date(s.scheduleTime);
    return scheduleDate.toDateString() === selectedDate.toDateString();
  });

  // 按时间排序
  const sortedSchedules = [...filteredSchedules].sort((a, b) => 
    a.scheduleTime.getTime() - b.scheduleTime.getTime()
  );

  if (sortedSchedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Calendar className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">暂无日程安排</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          提取到的日程将显示在这里
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">
          日程安排 ({sortedSchedules.length})
        </h3>
      </div>
      
      <div className="space-y-2">
        {sortedSchedules.map((schedule) => {
          const isPast = schedule.scheduleTime < new Date();
          
          return (
            <div
              key={schedule.id}
              onClick={() => onScheduleClick?.(schedule)}
              className={cn(
                "group relative p-4 rounded-lg border transition-all cursor-pointer",
                "hover:shadow-md hover:scale-[1.02]",
                isPast
                  ? "bg-muted/30 border-border/50 opacity-75"
                  : "bg-gradient-to-br from-amber-50/50 to-amber-100/30 dark:from-amber-900/20 dark:to-amber-800/10 border-amber-300/50 dark:border-amber-700/50",
                "hover:border-amber-400/70 dark:hover:border-amber-600/70"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                  isPast
                    ? "bg-muted/50"
                    : "bg-gradient-to-br from-amber-400 to-amber-500 dark:from-amber-600 dark:to-amber-700"
                )}>
                  <Clock className={cn(
                    "w-5 h-5",
                    isPast ? "text-muted-foreground" : "text-white"
                  )} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={cn(
                      "text-xs font-mono px-2 py-0.5 rounded",
                      isPast
                        ? "bg-muted/50 text-muted-foreground"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    )}>
                      {schedule.scheduleTime.toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isPast && (
                      <span className="text-xs text-muted-foreground/70 px-2 py-0.5 rounded bg-muted/30">
                        已过期
                      </span>
                    )}
                    {schedule.status === 'confirmed' && (
                      <span className="text-xs text-green-600 dark:text-green-400 px-2 py-0.5 rounded bg-green-500/10">
                        已确认
                      </span>
                    )}
                  </div>
                  
                  <p className={cn(
                    "text-sm font-medium leading-relaxed",
                    isPast ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {schedule.description}
                  </p>
                  
                  <div className="mt-2 text-xs text-muted-foreground/70">
                    {schedule.scheduleTime.toLocaleDateString("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
