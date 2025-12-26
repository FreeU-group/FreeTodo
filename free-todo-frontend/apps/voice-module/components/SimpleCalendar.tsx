/**
 * 简单日历组件
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface SimpleCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onClose: () => void;
}

export function SimpleCalendar({ selectedDate, onDateSelect, onClose }: SimpleCalendarProps) {
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
          
          return (
            <button
              key={date.toISOString()}
              onClick={() => onDateSelect(date)}
              className={cn(
                "aspect-square rounded-md text-sm transition-colors",
                "hover:bg-muted",
                isTodayDate && "bg-primary/10 text-primary font-medium",
                isSelectedDate && "bg-primary text-primary-foreground font-medium",
                !isTodayDate && !isSelectedDate && "text-foreground"
              )}
            >
              {date.getDate()}
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

