"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { TimelineState, AudioSegment, ScheduleItem } from '../types';

interface WaveformTimelineProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
  timeline: TimelineState;
  audioSegments: AudioSegment[];
  schedules: ScheduleItem[];
  onSeek: (time: Date) => void;
  onTimelineChange: (startTime: Date, duration: number) => void;
  onZoomChange: (zoomLevel: number) => void;
}

const WaveformTimeline: React.FC<WaveformTimelineProps> = ({ 
  analyser, 
  isRecording, 
  timeline,
  audioSegments,
  schedules,
  onSeek,
  onTimelineChange,
  onZoomChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0 });
  
  const currentTime = new Date();

  // 获取时间间隔（根据视图时长）
  const getTimeInterval = useCallback((duration: number): number => {
    if (duration <= 60 * 60 * 1000) return 5 * 60 * 1000; // 5分钟
    if (duration <= 6 * 60 * 60 * 1000) return 30 * 60 * 1000; // 30分钟
    return 2 * 60 * 60 * 1000; // 2小时
  }, []);

  // 计算时间到像素的转换
  const pixelsPerSecond = useCallback(() => {
    if (!containerRef.current) return 1;
    const containerWidth = containerRef.current.clientWidth;
    return containerWidth / (timeline.viewDuration / 1000);
  }, [timeline.viewDuration]);

  // 时间到像素位置
  const timeToPixel = useCallback((time: Date): number => {
    const pps = pixelsPerSecond();
    const timeDiff = time.getTime() - timeline.viewStartTime.getTime();
    return (timeDiff / 1000) * pps;
  }, [timeline.viewStartTime, pixelsPerSecond]);

  // 像素位置到时间
  const pixelToTime = useCallback((pixel: number): Date => {
    const pps = pixelsPerSecond();
    const timeDiff = (pixel / pps) * 1000;
    return new Date(timeline.viewStartTime.getTime() + timeDiff);
  }, [timeline.viewStartTime, pixelsPerSecond]);

  // 绘制波形
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      if (canvas.parentElement) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const draw = () => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      
      ctx.clearRect(0, 0, width, height);
      
      const pps = pixelsPerSecond();
      const centerY = height / 2;
      
      // 1. 绘制时间刻度（增大字体，提高清晰度）
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.font = 'bold 13px monospace'; // 增大字体，加粗
      ctx.fillStyle = '#cbd5e1'; // 更亮的颜色
      ctx.textBaseline = 'top';
      
      const startTime = timeline.viewStartTime.getTime();
      const duration = timeline.viewDuration;
      const interval = getTimeInterval(duration);
      
      for (let t = startTime; t < startTime + duration; t += interval) {
        const x = timeToPixel(new Date(t));
        if (x >= 0 && x <= width) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          
          // 时间标签（增大字体，添加背景以提高可读性）
          const timeLabel = format(new Date(t), 'HH:mm:ss', { locale: zhCN });
          const textWidth = ctx.measureText(timeLabel).width;
          
          // 绘制半透明背景
          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'; // 深色半透明背景
          ctx.fillRect(x + 4, 2, textWidth + 6, 16);
          
          // 绘制文字
          ctx.fillStyle = '#e2e8f0'; // 亮色文字
          ctx.fillText(timeLabel, x + 7, 4);
        }
      }
      
      // 2. 绘制已保存的音频片段
      audioSegments.forEach(segment => {
        const startX = timeToPixel(segment.startTime);
        const endX = timeToPixel(segment.endTime);
        const segmentWidth = endX - startX;
        
        if (endX < 0 || startX > width) return;
        
        let color = '#334155';
        if (segment.uploadStatus === 'uploaded') color = '#22c55e';
        else if (segment.uploadStatus === 'failed') color = '#ef4444';
        else if (segment.uploadStatus === 'uploading') color = '#f59e0b';
        
        ctx.fillStyle = color;
        ctx.fillRect(Math.max(0, startX), centerY - 3, Math.min(segmentWidth, width - Math.max(0, startX)), 6);
      });
      
      // 3. 绘制日程标记（增大标记和文字，避免重叠）
      schedules.forEach((schedule, index) => {
        const x = timeToPixel(schedule.scheduleTime);
        if (x >= 0 && x <= width) {
          // 计算垂直位置，避免重叠（每个标记错开，从更下方开始，避免与时间标签重叠）
          const verticalOffset = 35 + (index % 3) * 22; // 从35px开始，每3个标记循环，错开22px
          
          // 绘制标记点（增大）
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(x, verticalOffset, 6, 0, Math.PI * 2); // 增大半径到6px
          ctx.fill();
          
          // 绘制外圈（增强可见性）
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, verticalOffset, 6, 0, Math.PI * 2);
          ctx.stroke();
          
          // 绘制连接线
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, verticalOffset + 6);
          ctx.lineTo(x, centerY - 3);
          ctx.stroke();
          
          // 绘制文字背景（提高可读性）
          const description = schedule.description.length > 20 
            ? schedule.description.substring(0, 20) + '...' 
            : schedule.description;
          ctx.font = 'bold 12px sans-serif'; // 增大字体到12px，加粗
          const textWidth = ctx.measureText(description).width;
          
          // 半透明背景（增大内边距）
          ctx.fillStyle = 'rgba(251, 191, 36, 0.95)'; // 橙色半透明背景
          ctx.fillRect(x + 10, verticalOffset - 10, textWidth + 12, 20);
          
          // 绘制边框
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 10, verticalOffset - 10, textWidth + 12, 20);
          
          // 绘制文字
          ctx.fillStyle = '#78350f'; // 深色文字
          ctx.fillText(description, x + 16, verticalOffset - 3);
        }
      });
      
      // 4. 绘制当前时间指示器（增大，更清晰）
      const currentX = timeToPixel(currentTime);
      if (currentX >= 0 && currentX <= width) {
        // 绘制垂直线
        ctx.beginPath();
        ctx.moveTo(currentX, 0);
        ctx.lineTo(currentX, height);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5; // 加粗
        ctx.stroke();
        
        // 绘制顶部指示器（三角形）
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(currentX, 0);
        ctx.lineTo(currentX - 6, 10);
        ctx.lineTo(currentX + 6, 10);
        ctx.closePath();
        ctx.fill();
        
        // 绘制时间标签（增大字体，添加背景）
        ctx.font = 'bold 13px monospace'; // 增大字体
        const timeLabel = format(currentTime, 'HH:mm:ss', { locale: zhCN });
        const textWidth = ctx.measureText(timeLabel).width;
        const labelX = Math.min(currentX + 8, width - textWidth - 10);
        
        // 半透明背景
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'; // 红色半透明背景
        ctx.fillRect(labelX - 4, 2, textWidth + 8, 18);
        
        // 绘制文字
        ctx.fillStyle = '#ffffff'; // 白色文字
        ctx.fillText(timeLabel, labelX, 5);
      }
      
      // 5. 实时录音波形
      if (isRecording && analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        
        const recordingX = timeToPixel(currentTime);
        const visibleStart = Math.max(0, recordingX - 200);
        const visibleEnd = Math.min(width, recordingX + 200);
        
        if (recordingX >= -200 && recordingX <= width + 200) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          
          const barWidth = 2;
          const gap = 1;
          const totalBars = Math.floor((visibleEnd - visibleStart) / (barWidth + gap));
          const step = Math.max(1, Math.floor(dataArray.length / totalBars));
          
          let firstPoint = true;
          for (let i = 0; i < totalBars; i++) {
            const index = i * step;
            const amplitude = (dataArray[index] - 128) / 128;
            const x = visibleStart + i * (barWidth + gap);
            
            if (x >= 0 && x <= width) {
              if (firstPoint) {
                ctx.moveTo(x, centerY + amplitude * height * 0.3);
                firstPoint = false;
              } else {
                ctx.lineTo(x, centerY + amplitude * height * 0.3);
              }
            }
          }
          
          ctx.stroke();
        }
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [timeline, audioSegments, schedules, currentTime, isRecording, analyser, timeToPixel, pixelsPerSecond, getTimeInterval]);

  // 处理点击跳转
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRecording) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x);
    
    onSeek(time);
  };

  // 处理滚动
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    setScrollLeft(scrollLeft);
    
    const pps = pixelsPerSecond();
    const timeOffset = (scrollLeft / pps) * 1000;
    const newStartTime = new Date(timeline.viewStartTime.getTime() - timeOffset);
    
    onTimelineChange(newStartTime, timeline.viewDuration);
  };

  // 处理拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      scrollLeft: scrollLeft,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const newScrollLeft = dragStart.scrollLeft - deltaX;
    
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = newScrollLeft;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 处理缩放
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      
      const zoomLevels = [1, 2, 3];
      const currentIndex = zoomLevels.indexOf(timeline.zoomLevel);
      
      if (e.deltaY < 0 && currentIndex > 0) {
        onZoomChange(zoomLevels[currentIndex - 1]);
      } else if (e.deltaY > 0 && currentIndex < zoomLevels.length - 1) {
        onZoomChange(zoomLevels[currentIndex + 1]);
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-card/50 backdrop-blur-sm rounded-lg overflow-hidden border border-border relative"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="absolute top-0 left-0 right-0 h-10 bg-card/90 backdrop-blur-sm border-b border-border z-20 flex items-center justify-between px-4">
        <div className="text-sm text-foreground font-mono font-semibold">
          {format(timeline.viewStartTime, 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })} - {format(new Date(timeline.viewStartTime.getTime() + timeline.viewDuration), 'HH:mm:ss', { locale: zhCN })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onZoomChange(1)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              timeline.zoomLevel === 1 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            1小时
          </button>
          <button
            onClick={() => onZoomChange(2)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              timeline.zoomLevel === 2 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            6小时
          </button>
          <button
            onClick={() => onZoomChange(3)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              timeline.zoomLevel === 3 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            24小时
          </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="absolute top-10 left-0 right-0 bottom-0 overflow-x-auto overflow-y-hidden"
        onScroll={handleScroll}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div style={{ minWidth: '100%', height: '100%' }}>
          <canvas 
            ref={canvasRef} 
            onClick={handleCanvasClick}
            className={`w-full h-full ${isRecording ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
          />
        </div>
      </div>

      {isRecording && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none z-30 bg-red-500/90 backdrop-blur-sm px-2 py-1 rounded-md border border-red-400/50 shadow-sm">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
          <span className="text-xs font-medium text-white">录音中</span>
        </div>
      )}
    </div>
  );
};

export default WaveformTimeline;

