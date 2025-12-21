"use client";

import { useEffect, useRef } from 'react';
import { ScheduleItem } from '../types';

interface ScheduleListProps {
  schedules: ScheduleItem[];
}

const ScheduleList: React.FC<ScheduleListProps> = ({ schedules }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部（显示最新的日程）
  useEffect(() => {
    if (schedules.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [schedules.length]);

  if (schedules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">暂无日程</p>
    );
  }

  return (
    <div className="space-y-2.5">
      {schedules.map((schedule) => (
        <div 
          key={schedule.id} 
          className="bg-card border border-amber-500/30 p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow hover:border-amber-500/50"
        >
          <div className="text-amber-600 dark:text-amber-400 font-mono text-sm font-semibold mb-1.5">
            {schedule.scheduleTime.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div className="text-foreground text-sm leading-relaxed">{schedule.description}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default ScheduleList;

