/**
 * 简单日历组件
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface SimpleCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onClose?: () => void;
  audioDates?: Date[];
  audioCounts?: Map<string, number>;
}

export function SimpleCalendar({ selectedDate, onDateSelect, onClose, audioDates = [], audioCounts }: SimpleCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    // 填充前面的空位
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // 填充月份中的日期
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  }, [currentMonth]);

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    onDateSelect(today);
  };

  const isToday = (date: Date | null): boolean => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date | null): boolean => {
    if (!date) return false;
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear();
  };

  const hasAudio = (date: Date | null): boolean => {
    if (!date || !audioDates) return false;
    return audioDates.some((d: Date) => 
      d.getDate() === date.getDate() &&
      d.getMonth() === date.getMonth() &&
      d.getFullYear() === date.getFullYear()
    );
  };

  const getAudioCount = (date: Date | null): number => {
    if (!date) return 0;
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return audioCounts?.get(dateKey) || 0;
  };

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="w-full">
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPreviousMonth}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {currentMonth.getFullYear()}年 {monthNames[currentMonth.getMonth()]}
          </span>
        </div>
        <button
          onClick={goToNextMonth}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1">
        {monthDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }
          
          const isTodayDate = isToday(date);
          const isSelectedDate = isSelected(date);
          const audioCount = getAudioCount(date);
          
          return (
            <button
              key={date.toISOString()}
              onClick={() => onDateSelect(date)}
              className={cn(
                "aspect-square rounded-md text-sm transition-colors relative",
                "hover:bg-muted",
                isTodayDate && "bg-primary/10 text-primary font-medium",
                isSelectedDate && "bg-primary text-primary-foreground font-medium",
                !isTodayDate && !isSelectedDate && "text-foreground"
              )}
            >
              <span>{date.getDate()}</span>
              {audioCount > 0 && (
                <span className={cn(
                  "absolute top-0.5 right-0.5 text-[10px] font-bold leading-none px-1 py-0.5 rounded-full min-w-[16px] text-center",
                  isSelectedDate 
                    ? "bg-white text-primary border border-primary/30" 
                    : "bg-primary text-white border border-primary/50"
                )}>
                  {audioCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 今天按钮 */}
      <div className="mt-4 pt-4 border-t border-border">
        <button
          onClick={goToToday}
          className="w-full px-3 py-2 text-sm rounded-md bg-muted/50 hover:bg-muted transition-colors text-foreground"
        >
          今天
        </button>
      </div>
    </div>
  );
}

