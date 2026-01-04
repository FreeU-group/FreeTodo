/**
 * 圆球声波可视化组件
 * 显示音频输入电平，类似图片中的圆球声波效果
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioSphereProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
  size?: number; // 圆球大小，默认 64px
  className?: string;
}

export function AudioSphere({ analyser, isRecording, size = 64, className }: AudioSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording || !analyser || !canvasRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    // 注意：这里需要使用逻辑尺寸（size），而不是画布尺寸（已乘以dpr）
    const logicalSize = size;
    const centerX = logicalSize / 2;
    const centerY = logicalSize / 2;
    const radius = Math.min(centerX, centerY) * 0.85; // 稍微减小，确保不超出边界

    const draw = () => {
      if (!isRecording || !analyser) return;

      animationFrameRef.current = requestAnimationFrame(draw);

      // 获取时域数据（用于绘制波形）
      analyser.getByteTimeDomainData(dataArray);

      // 清空画布（使用逻辑尺寸，因为ctx已经scale了dpr）
      ctx.clearRect(0, 0, logicalSize, logicalSize);

      // 计算音频电平（0-1）
      let sum = 0;
      let maxValue = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = Math.abs(dataArray[i] - 128) / 128;
        sum += value;
        maxValue = Math.max(maxValue, value);
      }
      // 使用平均值和最大值的组合，让响应更敏感
      const audioLevel = Math.min(1, (sum / bufferLength) * 0.7 + maxValue * 0.3);
      
      // 计算波形高度（基于音频电平）
      const waveHeight = audioLevel * radius * 0.4; // 最大高度为半径的40%
      const baseWaveY = centerY - radius * 0.3; // 波形基线位置（圆球上部）

      // 绘制圆球背景（浅蓝色，带3D效果）
      // 外圈阴影
      const shadowGradient = ctx.createRadialGradient(
        centerX, centerY, radius * 0.8,
        centerX, centerY, radius * 1.1
      );
      shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
      shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadowGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // 主圆球背景（径向渐变，模拟3D球体）
      const bgGradient = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX, centerY, radius
      );
      bgGradient.addColorStop(0, '#e0f2fe'); // 浅蓝色（高光）
      bgGradient.addColorStop(0.5, '#bae6fd'); // 中等蓝色
      bgGradient.addColorStop(1, '#93c5fd'); // 稍深的蓝色（阴影）
      ctx.fillStyle = bgGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // 添加高光效果（让球看起来更立体）
      const highlightGradient = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.6
      );
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlightGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      // 绘制顶部深蓝色区域（带波浪效果）
      if (audioLevel > 0.05) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();

        // 绘制深蓝色区域
        const topGradient = ctx.createLinearGradient(
          centerX, centerY - radius,
          centerX, baseWaveY + waveHeight
        );
        topGradient.addColorStop(0, '#3b82f6'); // 深蓝色
        topGradient.addColorStop(1, '#60a5fa'); // 稍浅的蓝色
        
        ctx.fillStyle = topGradient;
        ctx.beginPath();
        
        // 绘制波浪形状
        const wavePoints = 50;
        const waveStartX = centerX - radius;
        const waveEndX = centerX + radius;
        const waveWidth = waveEndX - waveStartX;
        
        ctx.moveTo(waveStartX, centerY - radius);
        
        // 绘制波浪曲线
        const timeOffset = Date.now() * 0.003; // 波浪动画速度
        for (let i = 0; i <= wavePoints; i++) {
          const x = waveStartX + (i / wavePoints) * waveWidth;
          const progress = i / wavePoints;
          // 使用正弦波创建波浪效果，并根据音频电平调整高度
          // 使用多个频率叠加，让波浪更自然
          const wave1 = Math.sin(progress * Math.PI * 4 + timeOffset) * waveHeight * 0.3;
          const wave2 = Math.sin(progress * Math.PI * 6 + timeOffset * 1.3) * waveHeight * 0.15;
          const waveOffset = wave1 + wave2;
          const y = baseWaveY + waveOffset;
          ctx.lineTo(x, y);
        }
        
        ctx.lineTo(waveEndX, centerY - radius);
        ctx.closePath();
        ctx.fill();

        // 在深蓝色区域添加一些高光反射效果
        if (audioLevel > 0.1) {
          const highlightGradient = ctx.createLinearGradient(
            centerX - radius * 0.3, centerY - radius * 0.6,
            centerX + radius * 0.3, centerY - radius * 0.8
          );
          highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
          highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = highlightGradient;
          ctx.fillRect(
            centerX - radius * 0.3,
            centerY - radius * 0.8,
            radius * 0.6,
            radius * 0.2
          );
        }

        ctx.restore();
      } else {
        // 如果没有声音，只绘制静态的深蓝色区域（约1/3）
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();

        const topGradient = ctx.createLinearGradient(
          centerX, centerY - radius,
          centerX, baseWaveY
        );
        topGradient.addColorStop(0, '#3b82f6');
        topGradient.addColorStop(1, '#60a5fa');
        
        ctx.fillStyle = topGradient;
        ctx.beginPath();
        ctx.moveTo(centerX - radius, centerY - radius);
        ctx.lineTo(centerX + radius, centerY - radius);
        ctx.lineTo(centerX + radius, baseWaveY);
        ctx.lineTo(centerX - radius, baseWaveY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 绘制中间的白色虚线（像冒号）
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); // 虚线样式
      ctx.lineCap = 'round';
      
      // 绘制虚线
      ctx.beginPath();
      ctx.moveTo(centerX - radius * 0.3, centerY + radius * 0.1);
      ctx.lineTo(centerX + radius * 0.3, centerY + radius * 0.1);
      ctx.stroke();
      
      // 绘制两个点（冒号效果）
      ctx.setLineDash([]); // 取消虚线
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX - radius * 0.1, centerY + radius * 0.1, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX + radius * 0.1, centerY + radius * 0.1, 2, 0, Math.PI * 2);
      ctx.fill();

      // 绘制外圈光晕效果（当有声音时）
      if (audioLevel > 0.1) {
        const glowRadius = radius * (1 + audioLevel * 0.2);
        const glowGradient = ctx.createRadialGradient(
          centerX, centerY, radius,
          centerX, centerY, glowRadius
        );
        glowGradient.addColorStop(0, `rgba(59, 130, 246, ${audioLevel * 0.3})`);
        glowGradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 绘制边框（浅灰色，带阴影效果）
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // 添加内圈高光边框（增强3D效果）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.98, 0, Math.PI * 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isRecording, analyser]);

  // 设置画布大小
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }
  }, [size]);

  return (
    <div className={cn('relative inline-block', className)}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: size, height: size }}
      />
      {!isRecording && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full" />
        </div>
      )}
    </div>
  );
}

