/**
 * 新的语音模块面板（重构版）
 * 使用新的UI组件结构，参考千问、飞书、腾讯会议的界面设计
 * 
 * 核心功能流程：
 * 1. 采集音频（保留）
 * 2. 自动转录
 * 3. LLM优化
 * 4. 智能提取（待办事项、日程）
 */

"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Mic, Play, Upload } from 'lucide-react';
import { DateSelector } from './components/DateSelector';
import { OriginalTextView } from './components/OriginalTextView';
import { OptimizedTextView } from './components/OptimizedTextView';
import { MeetingSummary } from './components/MeetingSummary';
import { CompactPlayer } from './components/CompactPlayer';
import { RecordingView } from './components/RecordingView';
import { ExtractedItemsPanel } from './components/ExtractedItemsPanel';
import { AudioListPanel } from './components/AudioListPanel';
import type { ViewMode } from './components/ModeSwitcher';
import { useAppStore } from './store/useAppStore';
import { RecordingService } from './services/RecordingService';
import { RecognitionService } from './services/RecognitionService';
import { WebSocketRecognitionService } from './services/WebSocketRecognitionService';
import { OptimizationService } from './services/OptimizationService';
import { ScheduleExtractionService } from './services/ScheduleExtractionService';
import { TodoExtractionService, ExtractedTodo } from './services/TodoExtractionService';
import { PersistenceService } from './services/PersistenceService';
import { useModuleContextStore } from '@/lib/store/module-context-store';
import { useCreateTodo } from '@/lib/query/todos';
import { cn } from '@/lib/utils';
import type { TranscriptSegment, AudioSegment, ScheduleItem } from './types';

// API基础URL
const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api')
  : 'http://localhost:8000/api';

export function VoiceModulePanel() {
  // 从store获取状态
  const {
    isRecording,
    recordingStartTime,
    transcripts,
    schedules,
    extractedTodos,
    audioSegments,
    processStatus,
    startRecording: storeStartRecording,
    stopRecording: storeStopRecording,
    setCurrentTime: storeSetCurrentTime,
    addTranscript,
    updateTranscript,
    addSchedule,
    addExtractedTodo,
    removeExtractedTodo,
    removeSchedule,
    addAudioSegment,
    updateAudioSegment,
    setProcessStatus,
  } = useAppStore();

  // 服务引用
  const recordingServiceRef = useRef<RecordingService | null>(null);
  const recognitionServiceRef = useRef<RecognitionService | WebSocketRecognitionService | null>(null);
  const [recognitionServiceType, setRecognitionServiceType] = useState<'web-speech' | 'websocket'>('web-speech');
  const optimizationServiceRef = useRef<OptimizationService | null>(null);
  const scheduleExtractionServiceRef = useRef<ScheduleExtractionService | null>(null);
  const todoExtractionServiceRef = useRef<TodoExtractionService | null>(null);
  const persistenceServiceRef = useRef<PersistenceService | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<number | null>(null);

  // 音频相关状态
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 设置当前模块上下文
  const { setCurrentModule, setVoiceTranscripts } = useModuleContextStore();
  
  // 创建Todo的mutation（用于智能提取）
  const createTodoMutation = useCreateTodo();

  // UI状态
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [pendingTodos, setPendingTodos] = useState<ExtractedTodo[]>([]);  // 待确认的待办列表
  const [pendingSchedules, setPendingSchedules] = useState<ScheduleItem[]>([]);  // 待确认的日程列表
  const [meetingSummary, setMeetingSummary] = useState<string>('');  // LLM生成的智能纪要
  const [currentView, setCurrentView] = useState<'original' | 'optimized'>('original'); // 原文 / 智能优化版
  const [viewMode, setViewMode] = useState<ViewMode>('playback');
  const [apiResponse, setApiResponse] = useState<any>(null);  // 存储后端API响应，用于展示
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | undefined>();
  const [hoveredSegment, setHoveredSegment] = useState<TranscriptSegment | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0); // 录音时长（秒）
  const [currentSpeaker, setCurrentSpeaker] = useState<string>('发言人1');
  const [meetingTitle, setMeetingTitle] = useState<string>(''); // 会议标题
  const [nowTime, setNowTime] = useState<Date | null>(null); // 当前时间（初始为 null，避免 SSR 不一致）
  const [dayAudioSegments, setDayAudioSegments] = useState<AudioSegment[]>([]); // 当前日期的音频列表（从后端查询）

  // 播放器状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedAudioId, setSelectedAudioId] = useState<string | undefined>(undefined);

  // 设置模块上下文
  useEffect(() => {
    setCurrentModule('voice');
    return () => {
      setCurrentModule(null);
    };
  }, [setCurrentModule]);

  // 更新音频转录内容到模块上下文（供AI聊天使用）
  useEffect(() => {
    // 只传递当前日期的转录内容，并且优先使用优化后的文本
    const dayTranscripts = transcripts.filter((t) => {
      const transcriptDate = new Date(t.timestamp);
      return transcriptDate.toDateString() === selectedDate.toDateString();
    });
    
    setVoiceTranscripts(dayTranscripts.map(t => ({
      timestamp: t.timestamp,
      optimizedText: t.optimizedText,
      rawText: t.rawText,
    })));
  }, [transcripts, selectedDate, setVoiceTranscripts]);

  // 不再需要枚举设备，直接使用系统默认麦克风

  // 处理文本优化完成
  const handleTextOptimized = useCallback((segmentId: string, optimizedText: string, containsSchedule: boolean) => {
    // 检查优化文本中是否包含日程标记
    const hasScheduleInText = optimizedText.includes('[SCHEDULE:');
    const finalContainsSchedule = containsSchedule || hasScheduleInText;
    
    updateTranscript(segmentId, {
      optimizedText,
      isOptimized: true,
      containsSchedule: finalContainsSchedule,
    });

    const currentTranscripts = useAppStore.getState().transcripts;
    const segment = currentTranscripts.find(t => t.id === segmentId);
    if (segment) {
      const updatedSegment = {
        ...segment,
        optimizedText,
        isOptimized: true,
        containsSchedule: finalContainsSchedule,
      };
      
      // 如果包含日程标记，添加到日程提取队列
      if (finalContainsSchedule && scheduleExtractionServiceRef.current) {
        console.log('[VoiceModulePanel] 📅 检测到日程标记，添加到提取队列:', segmentId);
        scheduleExtractionServiceRef.current.enqueue(updatedSegment);
      }
      
      // 添加到待办提取队列
      if (todoExtractionServiceRef.current) {
        todoExtractionServiceRef.current.enqueue(updatedSegment);
      }
    }

    setTimeout(() => {
      const currentTranscripts = useAppStore.getState().transcripts;
      const segment = currentTranscripts.find(t => t.id === segmentId);
      if (segment && persistenceServiceRef.current) {
        persistenceServiceRef.current.saveTranscripts([segment]).catch(() => {});
        updateTranscript(segmentId, { uploadStatus: 'uploaded' });
      }
    }, 100);
  }, [updateTranscript]);

  // 处理日程提取 - 先加入到待确认列表，不自动加入
  const handleScheduleExtracted = useCallback(async (schedule: ScheduleItem) => {
    // 先加入到待确认列表（智能提取区域）
    setPendingSchedules(prev => {
      // 避免重复添加
      if (prev.find(s => s.id === schedule.id)) {
        return prev;
      }
      return [...prev, schedule];
    });
    
    // 更新segment的containsSchedule标志
    const currentTranscripts = useAppStore.getState().transcripts;
    const segment = currentTranscripts.find(t => t.id === schedule.sourceSegmentId);
    if (segment) {
      updateTranscript(schedule.sourceSegmentId, {
        containsSchedule: true,
      });
    }
  }, [updateTranscript]);
  
  // 用户点击"加入日程"后调用
  const handleAddSchedule = useCallback(async (schedule: ScheduleItem) => {
    // 加入到全局状态（待办事项区域）
    addSchedule(schedule);
    
    // 保存日程到后端
    if (persistenceServiceRef.current) {
      try {
        await persistenceServiceRef.current.saveSchedules([schedule]);
      } catch (error) {
        console.warn('[handleAddSchedule] 保存日程到后端失败:', error);
      }
    }
    
    // 自动创建Todo（与系统待办列表、日历等联动）
    try {
      const userNotes = `VOICE_SOURCE_SEGMENT_ID:${schedule.sourceSegmentId}`;
      await createTodoMutation.mutateAsync({
        name: schedule.description,
        deadline: schedule.scheduleTime.toISOString(),
        startTime: schedule.scheduleTime.toISOString(),
        status: 'active',
        priority: 'medium',
        tags: ['语音提取', '日程'],
        userNotes: userNotes,
      });
    } catch (error) {
      console.warn('[handleAddSchedule] 自动创建 Todo 失败:', error);
    }
  }, [addSchedule, createTodoMutation]);

  // 处理待办提取 - 先加入到待确认列表，不自动加入
  const handleTodoExtracted = useCallback(async (todo: ExtractedTodo) => {
    // 先加入到待确认列表（智能提取区域）
    setPendingTodos(prev => {
      // 避免重复添加
      if (prev.find(t => t.id === todo.id)) {
        return prev;
      }
      return [...prev, todo];
    });
    
    const currentTranscripts = useAppStore.getState().transcripts;
    const segment = currentTranscripts.find(t => t.id === todo.sourceSegmentId);
    if (segment) {
      updateTranscript(todo.sourceSegmentId, {
        containsTodo: true,
      });
    }
  }, [updateTranscript]);
  
  // 用户点击"加入待办"后调用
  const handleAddTodo = useCallback(async (todo: ExtractedTodo) => {
    // 加入到全局状态（待办事项区域）
    addExtractedTodo(todo);
    
    // 自动创建Todo（与系统待办列表、日历等联动）
    try {
      const userNotes = `VOICE_SOURCE_SEGMENT_ID:${todo.sourceSegmentId}`;
      await createTodoMutation.mutateAsync({
        name: todo.title,
        description: todo.description,
        deadline: todo.deadline?.toISOString(),
        status: 'active',
        priority: todo.priority === 'high' ? 'high' : todo.priority === 'low' ? 'low' : 'medium',
        tags: ['语音提取', '待办事项'],
        userNotes: userNotes,
      });
    } catch (error) {
      console.warn('[handleAddTodo] 自动创建 Todo 失败:', error);
    }
  }, [addExtractedTodo, createTodoMutation]);

  // 处理识别结果（支持自动分段）
  const handleRecognitionResult = useCallback((text: string, isFinal: boolean) => {
    console.log('[VoiceModulePanel] 📝 收到识别结果:', { text: text.substring(0, 50), isFinal });
    
    // 处理所有结果（包括临时结果）
    if (!text.trim()) {
      return;
    }

    // 如果是临时结果，更新最后一个临时片段或创建新片段
    if (!isFinal) {
      // 查找最后一个临时片段
      const currentTranscripts = useAppStore.getState().transcripts;
      const lastInterim = currentTranscripts
        .filter(t => t.isInterim)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
      
      if (lastInterim) {
        // 更新临时片段
        updateTranscript(lastInterim.id, {
          rawText: text,
          interimText: text, // 同时更新 interimText，确保UI显示
          isInterim: true,
        });
      } else {
        // 创建新的临时片段
        const currentRecordingStartTime = useAppStore.getState().recordingStartTime;
        if (!currentRecordingStartTime) {
          return;
        }
        
        const now = Date.now();
        const relativeEndTime = now - currentRecordingStartTime.getTime();
        const relativeStartTime = Math.max(0, relativeEndTime - 2000);
        const absoluteEnd = new Date();
        const absoluteStart = new Date(absoluteEnd.getTime() - Math.max(500, relativeEndTime - relativeStartTime));
        
        const currentAudioSegments = useAppStore.getState().audioSegments;
        const lastSegment = currentAudioSegments[currentAudioSegments.length - 1];
        const segmentId = lastSegment?.id;

        const segment: TranscriptSegment = {
          id: `transcript_interim_${Date.now()}`,
          timestamp: new Date(),
          absoluteStart,
          absoluteEnd,
          segmentId,
          rawText: text,
          interimText: text, // 设置 interimText，确保UI显示
          isOptimized: false,
          isInterim: true,
          containsSchedule: false,
          audioStart: relativeStartTime,
          audioEnd: relativeEndTime,
          uploadStatus: 'pending',
        };

        addTranscript(segment);
      }
      return;
    }
    
    // 处理最终结果 - 支持自动分段
    const currentRecordingStartTime = useAppStore.getState().recordingStartTime;
    const currentAudioSegments = useAppStore.getState().audioSegments;
    if (!currentRecordingStartTime) {
      console.warn('[VoiceModulePanel] ⚠️ 录音开始时间为空，跳过识别结果');
      return;
    }

    // 检测句子结束标记（句号、问号、感叹号、分号、换行等），自动分段
    // 使用正则表达式匹配句子结束标记，保留标记
    const sentencePattern = /([^。！？；\n]+[。！？；\n])/g;
    const matches = text.match(sentencePattern);
    
    // 如果文本包含多个句子，需要分段处理
    if (matches && matches.length > 1) {
      const currentTranscripts = useAppStore.getState().transcripts;
      const lastInterim = currentTranscripts
        .filter(t => t.isInterim)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
      
      const now = Date.now();
      const relativeEndTime = now - currentRecordingStartTime.getTime();
      const relativeStartTime = lastInterim?.audioStart || Math.max(0, relativeEndTime - 2000);
      const totalDuration = relativeEndTime - relativeStartTime;
      const avgSentenceDuration = totalDuration / matches.length;
      
      matches.forEach((sentence, index) => {
        const sentenceStartTime = relativeStartTime + avgSentenceDuration * index;
        const sentenceEndTime = relativeStartTime + avgSentenceDuration * (index + 1);
        const absoluteEnd = new Date(currentRecordingStartTime.getTime() + sentenceEndTime);
        const absoluteStart = new Date(currentRecordingStartTime.getTime() + sentenceStartTime);

        const lastSegment = currentAudioSegments[currentAudioSegments.length - 1];
        const segmentId = lastSegment?.id;

        const segment: TranscriptSegment = {
          id: `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date(),
          absoluteStart,
          absoluteEnd,
          segmentId,
          rawText: sentence.trim(),
          isOptimized: false,
          isInterim: false,
          containsSchedule: false,
          audioStart: sentenceStartTime,
          audioEnd: sentenceEndTime,
          uploadStatus: 'pending',
        };

        console.log('[VoiceModulePanel] ✅ 添加转录片段（自动分段）:', segment.id, sentence.trim().substring(0, 30));
        addTranscript(segment);

        // 添加到优化队列
        if (optimizationServiceRef.current) {
          optimizationServiceRef.current.enqueue(segment);
        }
      });
      
      return;
    }

    // 单个句子或没有明确分段的情况
    const currentTranscripts = useAppStore.getState().transcripts;
    const lastInterim = currentTranscripts
      .filter(t => t.isInterim)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    
    if (lastInterim && lastInterim.rawText && text.includes(lastInterim.rawText.substring(0, Math.min(10, lastInterim.rawText.length)))) {
      // 更新临时片段为最终结果
      const now = Date.now();
      const relativeEndTime = now - currentRecordingStartTime.getTime();
      const relativeStartTime = lastInterim.audioStart || Math.max(0, relativeEndTime - 2000);
      const absoluteEnd = new Date();
      const absoluteStart = lastInterim.absoluteStart || new Date(absoluteEnd.getTime() - Math.max(500, relativeEndTime - relativeStartTime));
      
      updateTranscript(lastInterim.id, {
        rawText: text,
        isInterim: false,
        absoluteEnd,
        audioEnd: relativeEndTime,
      });
      
      // 添加到优化队列
      const updatedSegment: TranscriptSegment = {
        ...lastInterim,
        rawText: text,
        isInterim: false,
        absoluteEnd,
        audioEnd: relativeEndTime,
      };
      if (optimizationServiceRef.current) {
        optimizationServiceRef.current.enqueue(updatedSegment);
      }
    } else {
      // 创建新的最终片段
      const now = Date.now();
      const relativeEndTime = now - currentRecordingStartTime.getTime();
      const relativeStartTime = Math.max(0, relativeEndTime - 2000);
      const absoluteEnd = new Date();
      const absoluteStart = new Date(absoluteEnd.getTime() - Math.max(500, relativeEndTime - relativeStartTime));

      const lastSegment = currentAudioSegments[currentAudioSegments.length - 1];
      const segmentId = lastSegment?.id;

      const segment: TranscriptSegment = {
        id: `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date(),
        absoluteStart,
        absoluteEnd,
        segmentId,
        rawText: text,
        isOptimized: false,
        isInterim: false,
        containsSchedule: false,
        audioStart: relativeStartTime,
        audioEnd: relativeEndTime,
        uploadStatus: 'pending',
      };

      console.log('[VoiceModulePanel] ✅ 添加转录片段:', segment.id);
      addTranscript(segment);

      // 添加到优化队列
      if (optimizationServiceRef.current) {
        optimizationServiceRef.current.enqueue(segment);
      }
    }
  }, [addTranscript, updateTranscript]);

  // 处理音频段就绪
  // 使用 ref 存储回调，避免闭包问题
  const handleAudioSegmentReadyRef = useRef<((blob: Blob, startTime: Date, endTime: Date, segmentId: string) => Promise<void>) | null>(null);

  // 处理音频段就绪（完全参考代码实现）
  const handleAudioSegmentReady = useCallback(async (
    blob: Blob,
    startTime: Date,
    endTime: Date,
    segmentId: string
  ) => {
    // 创建本地Blob URL用于立即播放
    const localAudioUrl = URL.createObjectURL(blob);
    
    // 打印保存的音频URL（用户要求）
    console.log('[VoiceModulePanel] 💾 音频已保存到本地（Blob URL）:', {
      segmentId,
      localAudioUrl,
      blobSize: blob.size,
      blobType: blob.type, // 应该是 audio/webm;codecs=opus
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    // 创建音频片段记录（参考代码）
    const audioSegment: AudioSegment = {
      id: segmentId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      fileSize: blob.size,
      audioSource: 'microphone',
      uploadStatus: 'pending',
      fileUrl: localAudioUrl, // 使用本地URL，确保可以立即播放
      unixStartTime: startTime.getTime(), // 添加Unix时间戳，用于精确跳转
      unixEndTime: endTime.getTime(),
    };

    addAudioSegment(audioSegment);

    // 上传音频到后端（保存到本地文件夹 lifetrace/data/audio）
    if (persistenceServiceRef.current) {
      console.log('[VoiceModulePanel] 📤 开始上传音频到后端，保存到本地文件夹...');
      const audioFileId = await persistenceServiceRef.current.uploadAudio(blob, {
        startTime,
        endTime,
        segmentId,
      });

      if (audioFileId) {
        console.log('[VoiceModulePanel] ✅ 音频已成功保存到本地文件夹（lifetrace/data/audio）');
        updateAudioSegment(segmentId, { uploadStatus: 'uploaded' });
        // 注意：保留本地Blob URL用于播放，不替换为后端URL
      } else {
        console.error('[VoiceModulePanel] ❌ 音频上传失败，未保存到本地文件夹');
        updateAudioSegment(segmentId, { uploadStatus: 'failed' });
      }
    } else {
      console.error('[VoiceModulePanel] ❌ PersistenceService未初始化，无法保存音频');
    }
  }, [addAudioSegment, updateAudioSegment]);

  // 更新 ref，确保总是使用最新的回调
  useEffect(() => {
    handleAudioSegmentReadyRef.current = handleAudioSegmentReady;
  }, [handleAudioSegmentReady]);

  // 初始化服务（只执行一次，完全不依赖任何状态）
  useEffect(() => {
    console.log('[VoiceModulePanel] 🔄 useEffect: 初始化服务');
    const recordingService = new RecordingService();
    // 初始设置回调（使用 ref，避免闭包问题）
    // 注意：真正的回调会在 handleStartRecording 中重新设置以确保使用最新引用
    recordingService.setCallbacks({
      onSegmentReady: (blob, startTime, endTime, segmentId) => {
        // 使用 ref 获取最新的回调
        if (handleAudioSegmentReadyRef.current) {
          handleAudioSegmentReadyRef.current(blob, startTime, endTime, segmentId);
        } else {
          console.error('[VoiceModulePanel] ❌ handleAudioSegmentReadyRef.current 为 null，回调未设置');
        }
      },
      onError: (err) => {
        console.error('Recording error:', err);
        setError(err.message);
        setProcessStatus('recording', 'error');
      },
      onAudioData: (analyserNode) => {
        setAnalyser(analyserNode);
      },
    });
    recordingServiceRef.current = recordingService;

    // 检查 Web Speech API 是否支持
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isElectron = (window as any).require || (window as any).electronAPI;
    
    if (!SpeechRecognition || isElectron) {
      // 不支持 Web Speech API 或在 Electron 环境中，使用 WebSocket + Faster-Whisper
      console.log('[VoiceModulePanel] 🔄 使用 WebSocket + Faster-Whisper 识别服务');
      const wsRecognitionService = new WebSocketRecognitionService();
      wsRecognitionService.setCallbacks({
        onResult: (text: string, isFinal: boolean, startTime?: number, endTime?: number) => {
          // WebSocket 服务的回调格式略有不同，需要适配
          handleRecognitionResult(text, isFinal);
        },
        onError: (err) => {
          console.error('WebSocket Recognition error:', err);
          setError(err.message);
          setProcessStatus('recognition', 'error');
        },
        onStatusChange: (status) => {
          setProcessStatus('recognition', status);
        },
      });
      recognitionServiceRef.current = wsRecognitionService;
      setRecognitionServiceType('websocket');
    } else {
      // 支持 Web Speech API，使用浏览器原生识别
      console.log('[VoiceModulePanel] ✅ 使用 Web Speech API 识别服务');
      const recognitionService = new RecognitionService();
      recognitionService.setCallbacks({
        onResult: handleRecognitionResult,
        onError: (err) => {
          console.error('Recognition error:', err);
          setError(err.message);
          setProcessStatus('recognition', 'error');
        },
        onStatusChange: (status) => {
          setProcessStatus('recognition', status);
        },
      });
      recognitionServiceRef.current = recognitionService;
      setRecognitionServiceType('web-speech');
    }

    const optimizationService = new OptimizationService();
    optimizationService.setCallbacks({
      onOptimized: handleTextOptimized,
      onError: (segmentId, err) => {
        console.error(`Optimization error for ${segmentId}:`, err);
        setProcessStatus('optimization', 'error');
      },
      onStatusChange: (status) => {
        setProcessStatus('optimization', status);
      },
    });
    optimizationServiceRef.current = optimizationService;

    const scheduleExtractionService = new ScheduleExtractionService();
    scheduleExtractionService.setCallbacks({
      onScheduleExtracted: handleScheduleExtracted,
      onError: (err) => {
        console.error('Schedule extraction error:', err);
        setProcessStatus('scheduleExtraction', 'error');
      },
      onStatusChange: (status) => {
        setProcessStatus('scheduleExtraction', status);
      },
    });
    scheduleExtractionServiceRef.current = scheduleExtractionService;

    const todoExtractionService = new TodoExtractionService();
    todoExtractionService.setCallbacks({
      onTodoExtracted: handleTodoExtracted,
      onError: (err) => {
        console.error('Todo extraction error:', err);
      },
      onStatusChange: () => {},
    });
    todoExtractionServiceRef.current = todoExtractionService;

    const persistenceService = new PersistenceService();
    persistenceService.setCallbacks({
      onError: (err) => {
        console.error('Persistence error:', err);
        setProcessStatus('persistence', 'error');
      },
      onStatusChange: (status) => {
        setProcessStatus('persistence', status);
      },
    });
    persistenceServiceRef.current = persistenceService;

    const audio = new Audio();
    audioPlayerRef.current = audio;
    
    audio.onerror = () => {
      setError('音频加载失败');
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
    
    audio.onended = () => {
      setIsPlaying(false);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
    
    audio.onpause = () => {
      setIsPlaying(false);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
    
    audio.onplay = () => {
      setIsPlaying(true);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = window.setInterval(() => {
        if (audio.currentTime && audio.duration) {
          setCurrentTime(audio.currentTime);
          setDuration(audio.duration);
        }
      }, 100);
    };

    // 只在组件卸载时清理，不在依赖项变化时清理
    // 这样可以避免回调被反复清空和重新设置
    return () => {
      console.log('[VoiceModulePanel] 🧹 useEffect cleanup: 组件卸载，清理服务');
      // 组件卸载时才清理（不清空回调，只停止服务）
      if (recordingServiceRef.current) {
        recordingServiceRef.current.stop();
      }
      if (recognitionServiceRef.current) {
        recognitionServiceRef.current.stop();
      }
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      audio.pause();
    };
    // 注意：完全移除依赖项，只在组件挂载时执行一次
    // 回调会在 handleStartRecording 中重新设置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 组件挂载时加载当天音频列表
  useEffect(() => {
    if (persistenceServiceRef.current) {
      console.log('[VoiceModulePanel] 📅 组件挂载，加载当天音频列表');
      handleDateChange(selectedDate).catch(err => {
        console.error('[VoiceModulePanel] ❌ 加载当天音频列表失败:', err);
      });
    }
  }, []); // 只在挂载时执行一次

  // 更新当前时间
  useEffect(() => {
    const interval = setInterval(() => {
      storeSetCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [storeSetCurrentTime]);

  // 录音时长计时器
  useEffect(() => {
    let interval: number | null = null;
    if (isRecording) {
      interval = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // 处理录音开始
  const handleStartRecording = useCallback(async () => {
    console.log('[VoiceModulePanel] 🎤 handleStartRecording被调用');
    setError(null);
    
    try {
      // 如果正在播放，先停止播放
      if (isPlaying && audioPlayerRef.current) {
        console.log('[VoiceModulePanel] ⏸️ 停止播放');
        handlePause();
      }
      
      // 清空之前的转录内容（开始新的录音会话）
      console.log('[VoiceModulePanel] 🧹 清空之前的转录内容');
      useAppStore.getState().clearData();
      
      // 先切换到录音模式
      console.log('[VoiceModulePanel] 🔄 切换到录音模式');
      setViewMode('recording');
      
      // 检查录音服务是否初始化
      if (!recordingServiceRef.current) {
        console.error('[VoiceModulePanel] ❌ 录音服务未初始化！');
        throw new Error('录音服务未初始化，请刷新页面重试');
      }
      
      console.log('[VoiceModulePanel] 🎤 准备启动录音服务');
      
      // 确保回调已设置（在start之前，使用ref获取最新的回调）
      if (recordingServiceRef.current) {
        // 确保 ref 已更新
        handleAudioSegmentReadyRef.current = handleAudioSegmentReady;
        
        console.log('[VoiceModulePanel] 🔍 检查回调:', {
          hasCallback: typeof handleAudioSegmentReady === 'function',
          hasRefCallback: handleAudioSegmentReadyRef.current !== null,
        });
        
        recordingServiceRef.current.setCallbacks({
          onSegmentReady: (blob, startTime, endTime, segmentId) => {
            // 使用 ref 获取最新的回调
            if (handleAudioSegmentReadyRef.current) {
              handleAudioSegmentReadyRef.current(blob, startTime, endTime, segmentId);
            }
          },
          onError: (err) => {
            console.error('[VoiceModulePanel] Recording error:', err);
            setError(err.message);
            setProcessStatus('recording', 'error');
          },
          onAudioData: (analyserNode) => {
            setAnalyser(analyserNode);
          },
        });
        // 验证回调是否真的设置了
        const status = recordingServiceRef.current.getStatus();
        console.log('[VoiceModulePanel] ✅ 已设置录音服务回调，验证:', {
          hasOnSegmentReady: handleAudioSegmentReadyRef.current !== null,
          serviceStatus: status,
        });
      }
      
      // 启动录音服务（使用系统默认麦克风，与 Web Speech API 保持一致）
      console.log('[VoiceModulePanel] 🚀 调用recordingService.start()（使用系统默认麦克风）');
      await recordingServiceRef.current.start();
      console.log('[VoiceModulePanel] ✅ recordingService.start()完成');
      
      setProcessStatus('recording', 'running');
      storeStartRecording();
      setRecordingDuration(0);
      console.log('[VoiceModulePanel] ✅ 录音状态已更新');
      
      // 启动识别服务
      if (recognitionServiceRef.current) {
        // 重新设置回调（因为可能在清理时被清空）
        if (recognitionServiceType === 'websocket') {
          // WebSocket 服务需要传入 MediaStream
          const wsService = recognitionServiceRef.current as WebSocketRecognitionService;
          wsService.setCallbacks({
            onResult: (text: string, isFinal: boolean, startTime?: number, endTime?: number) => {
              handleRecognitionResult(text, isFinal);
            },
            onError: (err) => {
              console.error('[VoiceModulePanel] WebSocket Recognition error:', err);
              setError(err.message);
              setProcessStatus('recognition', 'error');
            },
            onStatusChange: (status) => {
              setProcessStatus('recognition', status);
            },
          });
          // WebSocket 服务需要传入录音服务的 MediaStream
          if (recordingServiceRef.current) {
            const stream = recordingServiceRef.current.getStream?.();
            if (stream) {
              setTimeout(() => {
                try {
                  wsService.start(stream);
                  console.log('[VoiceModulePanel] ✅ WebSocket 识别服务已启动');
                } catch (recognitionError) {
                  console.error('[VoiceModulePanel] ❌ WebSocket Recognition start error:', recognitionError);
                  setError('识别服务启动失败，请检查后端服务是否运行');
                }
              }, 500);
            } else {
              console.error('[VoiceModulePanel] ❌ 无法获取音频流');
              setError('无法获取音频流');
            }
          }
        } else {
          // Web Speech API 服务
          const webSpeechService = recognitionServiceRef.current as RecognitionService;
          webSpeechService.setCallbacks({
            onResult: handleRecognitionResult,
            onError: (err) => {
              console.error('[VoiceModulePanel] Recognition error:', err);
              setError(err.message);
              setProcessStatus('recognition', 'error');
            },
            onStatusChange: (status) => {
              setProcessStatus('recognition', status);
            },
          });
          // 延迟启动识别，确保录音服务已完全启动
          setTimeout(() => {
            try {
              webSpeechService.start();
              console.log('[VoiceModulePanel] ✅ Web Speech API 识别服务已启动');
            } catch (recognitionError) {
              console.error('[VoiceModulePanel] ❌ Recognition start error:', recognitionError);
              setError('识别服务启动失败，请检查浏览器是否支持语音识别');
            }
          }, 500);
        }
      } else {
        console.error('[VoiceModulePanel] 识别服务未初始化');
        setError('识别服务未初始化');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      console.error('Recording error:', error);
      setError(error.message);
      setProcessStatus('recording', 'error');
      storeStopRecording();
      setRecordingDuration(0);
      // 如果启动失败，切换回回看模式
      setViewMode('playback');
    }
  }, [storeStartRecording, storeStopRecording, setProcessStatus, handleRecognitionResult, isPlaying]);

  // 处理录音暂停
  const handlePauseRecording = useCallback(() => {
    if (!isRecording) {
      return;
    }
    
    // 暂停识别服务（停止转录）
    if (recognitionServiceRef.current) {
      if (recognitionServiceType === 'websocket') {
        (recognitionServiceRef.current as WebSocketRecognitionService).stop();
      } else {
        (recognitionServiceRef.current as RecognitionService).stop();
      }
    }
    
    // 暂停录音服务（暂停MediaRecorder，保留音频流）
    if (recordingServiceRef.current) {
      recordingServiceRef.current.pause();
    }
    
    // 更新状态为暂停
    setProcessStatus('recording', 'paused');
  }, [isRecording, setProcessStatus]);

  // 处理录音恢复
  const handleResumeRecording = useCallback(() => {
    const currentStatus = useAppStore.getState().processStatus.recording;
    if (currentStatus !== 'paused') {
      return;
    }
    
    // 恢复录音服务
    if (recordingServiceRef.current) {
      recordingServiceRef.current.resume();
    }
    
    // 恢复识别服务
    if (recognitionServiceRef.current) {
      if (recognitionServiceType === 'websocket') {
        const stream = recordingServiceRef.current?.getStream();
        if (stream) {
          (recognitionServiceRef.current as WebSocketRecognitionService).start(stream);
        }
      } else {
        (recognitionServiceRef.current as RecognitionService).start();
      }
    }
    
    // 更新状态为运行中
    setProcessStatus('recording', 'running');
  }, [setProcessStatus]);

  // 处理录音停止（参考代码实现 + 自动播放）
  const handleStopRecording = useCallback(async () => {
    if (recordingServiceRef.current) {
      await recordingServiceRef.current.stop();
      setProcessStatus('recording', 'idle');
    }

    if (recognitionServiceRef.current) {
      if (recognitionServiceType === 'websocket') {
        (recognitionServiceRef.current as WebSocketRecognitionService).stop();
      } else {
        (recognitionServiceRef.current as RecognitionService).stop();
      }
    }

    storeStopRecording();
    setViewMode('playback');
    
    // 停止播放（如果正在播放）
    if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    }
    
    // 等待音频段准备好（finalizeSegment会在onstop事件中调用）
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 获取最新的音频段（刚录完的），但不自动播放
    const currentAudioSegments = useAppStore.getState().audioSegments;
    if (currentAudioSegments.length > 0) {
      // 找到最新的音频段（按结束时间排序）
      const latestSegment = currentAudioSegments
        .sort((a, b) => b.endTime.getTime() - a.endTime.getTime())[0];
      
      if (latestSegment && latestSegment.fileUrl) {
        console.log('[VoiceModulePanel] 🎵 找到最新音频段:', {
          segmentId: latestSegment.id,
          fileUrl: latestSegment.fileUrl,
          duration: latestSegment.duration,
          fileSize: latestSegment.fileSize,
        });
        
        // 设置当前播放URL（但不自动播放）
        setCurrentAudioUrl(latestSegment.fileUrl);
        setSelectedAudioId(latestSegment.id);
        
        // 加载音频但不播放
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = latestSegment.fileUrl;
          audioPlayerRef.current.load();
          if (latestSegment.duration > 0) {
            setDuration(latestSegment.duration / 1000);
          }
        }
      } else {
        console.warn('[VoiceModulePanel] ⚠️ 最新音频段没有fileUrl');
      }
    } else {
      console.warn('[VoiceModulePanel] ⚠️ 没有找到音频段');
    }
    
    // 录音结束后，生成智能纪要（使用LLM生成纯文本摘要，不包含标记）
    try {
      const currentTranscripts = useAppStore.getState().transcripts;
      // 收集所有优化后的文本，去除标记
      const allText = currentTranscripts
        .filter(t => !t.isInterim && (t.optimizedText || t.rawText))
        .map(t => {
          const text = t.optimizedText || t.rawText || '';
          // 去除 [SCHEDULE:...] 和 [TODO:...] 标记，只保留内容
          return text
            .replace(/\[SCHEDULE:\s*([^\]]+)\]/g, '$1')
            .replace(/\[TODO:\s*([^|]+)(?:\|[^\]]+)?\]/g, '$1');
        })
        .filter(t => t.trim().length > 0)
        .join('\n');
      
      if (allText.trim().length > 0) {
        console.log('[VoiceModulePanel] 📝 开始生成智能纪要...');
        
        // 使用OptimizationService的LLM生成摘要
        if (optimizationServiceRef.current) {
          const optimizationService = optimizationServiceRef.current as any;
          const aiClient = optimizationService.aiClient;
          
          if (aiClient) {
            try {
              const response = await aiClient.chat.completions.create({
                model: 'deepseek-chat',
                messages: [
                  {
                    role: 'system',
                    content: `你是一个智能会议纪要生成助手。请根据以下转录文本，生成一份简洁、清晰的会议纪要。

要求：
1. 总结核心内容和要点
2. 提取关键决策和行动项
3. 使用自然流畅的中文，不要使用任何标记符号（如 [SCHEDULE:...] 或 [TODO:...]）
4. 保持逻辑清晰，结构合理
5. 如果内容较少，可以生成简短的总结；如果内容较多，可以分段总结
6. 输出纯文本，不要使用任何特殊标记`,
                  },
                  {
                    role: 'user',
                    content: `请为以下转录内容生成智能纪要：\n\n${allText}`,
                  },
                ],
                temperature: 0.7,
                max_tokens: 2000,
              });
              
              if (response.choices && response.choices[0] && response.choices[0].message) {
                const summary = response.choices[0].message.content;
                if (summary) {
                  setMeetingSummary(summary);
                  console.log('[VoiceModulePanel] ✅ 智能纪要生成成功');
                }
              }
            } catch (error) {
              console.warn('[VoiceModulePanel] ⚠️ 生成智能纪要出错:', error);
            }
          } else {
            console.warn('[VoiceModulePanel] ⚠️ AI客户端未初始化，无法生成智能纪要');
          }
        }
      }
    } catch (error) {
      console.warn('[VoiceModulePanel] ⚠️ 生成智能纪要出错:', error);
    }
  }, [storeStopRecording, setProcessStatus, setViewMode, setCurrentAudioUrl]);

  // 监听灵动岛的录音控制事件（完全同步录音功能）
  useEffect(() => {
    const handleDynamicIslandToggleRecording = (event: Event) => {
      const customEvent = event as CustomEvent<{ action: 'start' | 'stop' | 'pause' | 'resume' }>;
      const { action } = customEvent.detail || {};
      
      if (!action) {
        console.warn('[VoiceModulePanel] ⚠️ 收到灵动岛录音控制事件，但 action 为空');
        return;
      }
      
      console.log('[VoiceModulePanel] 📱 收到灵动岛录音控制事件:', action);
      
      if (action === 'start') {
        if (!isRecording) {
          console.log('[VoiceModulePanel] 🎤 灵动岛触发：开始录音');
          handleStartRecording().catch(err => {
            console.error('[VoiceModulePanel] ❌ 灵动岛启动录音失败:', err);
          });
        } else {
          console.log('[VoiceModulePanel] ⚠️ 已在录音中，忽略开始请求');
        }
      } else if (action === 'pause') {
        if (isRecording) {
          console.log('[VoiceModulePanel] ⏸️ 灵动岛触发：暂停录音');
          handlePauseRecording();
        } else {
          console.log('[VoiceModulePanel] ⚠️ 未在录音，忽略暂停请求');
        }
      } else if (action === 'resume') {
        const currentStatus = useAppStore.getState().processStatus.recording;
        if (currentStatus === 'paused') {
          console.log('[VoiceModulePanel] ▶️ 灵动岛触发：恢复录音');
          handleResumeRecording();
        } else {
          console.log('[VoiceModulePanel] ⚠️ 录音未暂停，忽略恢复请求');
        }
      } else if (action === 'stop') {
        if (isRecording) {
          console.log('[VoiceModulePanel] ⏹️ 灵动岛触发：停止录音');
          handleStopRecording().catch(err => {
            console.error('[VoiceModulePanel] ❌ 灵动岛停止录音失败:', err);
          });
        } else {
          console.log('[VoiceModulePanel] ⚠️ 未在录音，忽略停止请求');
        }
      }
    };

    // 在 window 和 document 上都注册监听器
    window.addEventListener('dynamic-island-toggle-recording', handleDynamicIslandToggleRecording as EventListener);
    document.addEventListener('dynamic-island-toggle-recording', handleDynamicIslandToggleRecording as EventListener);
    console.log('[VoiceModulePanel] ✅ 已注册灵动岛录音控制事件监听器 (window & document)');
    
    return () => {
      window.removeEventListener('dynamic-island-toggle-recording', handleDynamicIslandToggleRecording as EventListener);
      document.removeEventListener('dynamic-island-toggle-recording', handleDynamicIslandToggleRecording as EventListener);
      console.log('[VoiceModulePanel] 🧹 已移除灵动岛录音控制事件监听器');
    };
  }, [isRecording, handleStartRecording, handlePauseRecording, handleResumeRecording, handleStopRecording]);

  // 处理日期切换 - 从后端加载该日期的数据
  const handleDateChange = useCallback(async (date: Date) => {
    setSelectedDate(date);
    
    if (!persistenceServiceRef.current) {
      console.warn('[VoiceModulePanel] PersistenceService未初始化，无法加载历史数据');
      return;
    }

    try {
      // 计算该日期的开始和结束时间（使用本地时间，避免时区问题）
      const startTime = new Date(date);
      startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(date);
      endTime.setHours(23, 59, 59, 999);

      console.log(`[VoiceModulePanel] 📅 加载日期数据: ${date.toDateString()}, 时间范围: ${startTime.toISOString()} - ${endTime.toISOString()}`);
      console.log(`[VoiceModulePanel] 📅 本地时间范围: ${startTime.toLocaleString('zh-CN')} - ${endTime.toLocaleString('zh-CN')}`);

      // 1. 加载转录文本
      const loadedTranscripts = await persistenceServiceRef.current.queryTranscripts(startTime, endTime);
      console.log(`[VoiceModulePanel] ✅ 加载了 ${loadedTranscripts.length} 条转录文本`);
      
      // 将加载的转录文本添加到 store（合并，避免重复）
      loadedTranscripts.forEach(t => {
        const exists = transcripts.find(tr => tr.id === t.id);
        if (!exists) {
          addTranscript(t);
        }
      });

      // 2. 加载日程
      const loadedSchedules = await persistenceServiceRef.current.querySchedules(startTime, endTime);
      console.log(`[VoiceModulePanel] ✅ 加载了 ${loadedSchedules.length} 条日程`);
      
      // 将加载的日程添加到 store（合并，避免重复）
      loadedSchedules.forEach(s => {
        const exists = schedules.find(sch => sch.id === s.id);
        if (!exists) {
          addSchedule(s);
        }
      });

      // 3. 加载音频文件信息（直接从后端查询，不依赖 store）
      const recordings = await persistenceServiceRef.current.queryAudioRecordings(startTime, endTime);
      console.log(`[VoiceModulePanel] ✅ 加载了 ${recordings.length} 条音频录音记录`);

      // 将查询到的音频记录转换为 AudioSegment（直接从后端查询，不依赖 store）
      const loadedAudioSegments: AudioSegment[] = [];
      for (const recording of recordings) {
        // 获取音频文件URL
        let fileUrl: string | undefined;
        if (recording.file_url) {
          fileUrl = recording.file_url;
        } else if (recording.id) {
          // 如果没有 file_url，尝试通过 ID 获取
          const url = await persistenceServiceRef.current.getAudioUrl(recording.id);
          if (url) fileUrl = url;
        }

        // 解析时间戳，确保正确转换
        let startTime: Date;
        let endTime: Date;
        
        try {
          // 尝试解析 ISO 字符串或时间戳
          // 注意：后端返回的时间字符串可能没有时区信息（如 '2025-12-30T07:30:06.201000'）
          // 这种情况下，JavaScript 会把它当作本地时间解析，这是正确的
          if (typeof recording.start_time === 'string') {
            // 如果字符串没有时区信息（没有 Z 或 +/-），说明已经是本地时间
            const timeStr = recording.start_time.trim();
            if (timeStr.endsWith('Z') || timeStr.includes('+') || timeStr.includes('-', 10)) {
              // 有时区信息，按 UTC 或指定时区解析
              startTime = new Date(timeStr);
            } else {
              // 没有时区信息，当作本地时间解析（后端返回的已经是本地时间）
              // 直接解析，JavaScript 会把它当作本地时间
              startTime = new Date(timeStr);
            }
            // 验证时间是否有效
            if (isNaN(startTime.getTime())) {
              console.warn('[VoiceModulePanel] ⚠️ 时间解析失败，使用当前时间:', recording.start_time);
              startTime = new Date();
            }
          } else if (typeof recording.start_time === 'number') {
            // 如果是时间戳（毫秒），直接创建 Date 对象
            startTime = new Date(recording.start_time);
            if (isNaN(startTime.getTime())) {
              console.warn('[VoiceModulePanel] ⚠️ 时间戳无效，使用当前时间:', recording.start_time);
              startTime = new Date();
            }
          } else {
            console.warn('[VoiceModulePanel] ⚠️ start_time 格式未知，使用当前时间:', recording.start_time);
            startTime = new Date();
          }
          
          if (recording.end_time) {
            if (typeof recording.end_time === 'string') {
              const endTimeStr = recording.end_time.trim();
              if (endTimeStr.endsWith('Z') || endTimeStr.includes('+') || endTimeStr.includes('-', 10)) {
                endTime = new Date(endTimeStr);
              } else {
                endTime = new Date(endTimeStr);
              }
              if (isNaN(endTime.getTime())) {
                endTime = new Date(startTime.getTime() + (recording.duration_seconds || 0) * 1000);
              }
            } else if (typeof recording.end_time === 'number') {
              endTime = new Date(recording.end_time);
              if (isNaN(endTime.getTime())) {
                endTime = new Date(startTime.getTime() + (recording.duration_seconds || 0) * 1000);
              }
            } else {
              endTime = new Date(startTime.getTime() + (recording.duration_seconds || 0) * 1000);
            }
          } else {
            endTime = new Date(startTime.getTime() + (recording.duration_seconds || 0) * 1000);
          }
          
          // 添加调试日志，确认时间解析正确
          console.log(`[VoiceModulePanel] 🕐 解析时间:`, {
            original: recording.start_time,
            parsed: startTime.toISOString(),
            local: startTime.toLocaleString('zh-CN'),
            hours: startTime.getHours(),
            minutes: startTime.getMinutes(),
            hasTimezone: typeof recording.start_time === 'string' ? (recording.start_time.includes('Z') || recording.start_time.includes('+') || recording.start_time.includes('-', 10)) : 'N/A',
          });
        } catch (e) {
          console.error('[VoiceModulePanel] ❌ 时间解析失败:', e, recording);
          startTime = new Date();
          endTime = new Date();
        }

        const audioSegment: AudioSegment = {
          id: recording.segment_id || recording.id,
          startTime,
          endTime,
          duration: recording.duration_seconds ? recording.duration_seconds * 1000 : (endTime.getTime() - startTime.getTime()),
          fileSize: recording.file_size || 0,
          fileUrl: fileUrl,
          audioSource: 'microphone',
          uploadStatus: fileUrl ? 'uploaded' : 'failed',
        };
        
        loadedAudioSegments.push(audioSegment);
        console.log(`[VoiceModulePanel] ✅ 加载音频段:`, {
          id: audioSegment.id,
          startTime: audioSegment.startTime.toISOString(),
          startTimeLocal: audioSegment.startTime.toLocaleString('zh-CN'),
          endTime: audioSegment.endTime.toISOString(),
          duration: audioSegment.duration,
          fileUrl: audioSegment.fileUrl,
        });
      }

      // 按开始时间排序
      loadedAudioSegments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      
      // 过滤出真正属于当前日期的音频（考虑时区问题）
      // 使用本地时间的年月日来匹配，而不是UTC时间
      const filteredSegments = loadedAudioSegments.filter(segment => {
        const segmentDate = new Date(segment.startTime);
        const selectedDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const segmentDateStr = `${segmentDate.getFullYear()}-${String(segmentDate.getMonth() + 1).padStart(2, '0')}-${String(segmentDate.getDate()).padStart(2, '0')}`;
        return segmentDateStr === selectedDateStr;
      });
      
      console.log(`[VoiceModulePanel] 📊 过滤后的音频段数量: ${filteredSegments.length} / ${loadedAudioSegments.length} (选择日期: ${date.toDateString()})`);
      
      // 更新当前日期的音频列表（直接从后端查询）
      setDayAudioSegments(filteredSegments);

      // 更新当前音频URL（使用该日期第一个音频文件）
      if (filteredSegments.length > 0 && filteredSegments[0].fileUrl) {
        setCurrentAudioUrl(filteredSegments[0].fileUrl);
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = filteredSegments[0].fileUrl;
          audioPlayerRef.current.load();
        }
      } else {
        setCurrentAudioUrl(null);
      }
    } catch (error) {
      console.error('[VoiceModulePanel] ❌ 加载历史数据失败:', error);
      setError('加载历史数据失败，请重试');
    }
  }, [addTranscript, addSchedule, addAudioSegment, transcripts, schedules, audioSegments]);

  // 处理导出
  const handleExport = useCallback(async () => {
    try {
      const dayTranscripts = transcripts.filter((t) => {
        const transcriptDate = new Date(t.timestamp);
        return transcriptDate.toDateString() === selectedDate.toDateString();
      });
      
      const exportData = {
        date: selectedDate.toISOString().split('T')[0],
        transcripts: dayTranscripts.map(t => ({
          time: t.audioStart ? `${Math.floor(t.audioStart / 1000 / 60)}:${String(Math.floor((t.audioStart / 1000) % 60)).padStart(2, '0')}` : '00:00',
          rawText: t.rawText,
          optimizedText: t.optimizedText || '',
        })),
        schedules: schedules.filter(s => {
          const scheduleDate = new Date(s.scheduleTime);
          return scheduleDate.toDateString() === selectedDate.toDateString();
        }),
        todos: extractedTodos.filter(t => {
          const todoDate = t.deadline ? new Date(t.deadline) : null;
          return todoDate && todoDate.toDateString() === selectedDate.toDateString();
        }),
      };
      
      // 生成JSON文件
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `录音记录_${selectedDate.toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
      setError('导出失败，请重试');
    }
  }, [selectedDate, transcripts, schedules, extractedTodos]);

  // 处理编辑 - 打开编辑模式
  const handleEdit = useCallback(() => {
    // 切换视图到编辑模式（可以编辑转录文本）
    // 这里可以添加一个编辑状态，允许用户编辑转录文本
    console.log('[VoiceModulePanel] 📝 编辑模式：可以编辑转录文本、日程、待办等');
    // 暂时显示提示，后续可以实现编辑对话框
    setError('编辑功能：可以点击转录文本进行编辑（功能开发中）');
  }, [setError]);

  // 处理选择音频文件
  const handleSelectAudio = useCallback((audio: AudioSegment) => {
    setSelectedAudioId(audio.id);
    if (audio.fileUrl) {
      setCurrentAudioUrl(audio.fileUrl);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = audio.fileUrl;
        audioPlayerRef.current.load();
        // 重置播放位置
        setCurrentTime(0);
        if (isPlaying) {
          audioPlayerRef.current.play().catch(() => {
            // 忽略自动播放失败
          });
        }
      }
      // 更新总时长
      if (audio.duration > 0) {
        setDuration(audio.duration / 1000);
      }
    }
  }, [isPlaying]);

  // 处理视图切换（原文/智能优化版）
  const handleViewChange = useCallback((view: 'original' | 'optimized') => {
    setCurrentView(view);
  }, []);

  // 处理播放器操作（先声明，供handleModeChange使用）
  const handlePause = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
  }, []);

  // 处理模式切换
  const handleModeChange = useCallback((mode: ViewMode) => {
    // 切换到录音模式时，停止播放
    if (mode === 'recording' && isPlaying) {
      handlePause();
      setIsPlaying(false);
    }
    // 切换到回看模式时，如果正在录音则停止录音
    if (mode === 'playback' && isRecording) {
      handleStopRecording();
    }
    setViewMode(mode);
  }, [isPlaying, isRecording, handlePause, handleStopRecording]);

  // 监听全屏模式切换，停止播放并加载当天音频列表
  useEffect(() => {
    const { useDynamicIslandStore } = require('@/lib/store/dynamic-island-store');
    const { IslandMode } = require('@/components/DynamicIsland/types');
    
    let previousMode = useDynamicIslandStore.getState().mode;
    
    // 检查当前模式并停止播放（如果不在全屏模式）
    const checkAndStop = () => {
      const currentMode = useDynamicIslandStore.getState().mode;
      
      // 如果切换到全屏模式，加载当天音频列表
      if (currentMode === IslandMode.FULLSCREEN && previousMode !== IslandMode.FULLSCREEN) {
        console.log('[VoiceModulePanel] 📱 切换到全屏模式，加载当天音频列表');
        handleDateChange(selectedDate).catch(err => {
          console.error('[VoiceModulePanel] ❌ 加载当天音频列表失败:', err);
        });
      }
      
      // 如果不在全屏模式，停止播放
      if (currentMode !== IslandMode.FULLSCREEN && isPlaying && audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        setIsPlaying(false);
      }
      
      previousMode = currentMode;
    };
    
    // 立即检查一次
    checkAndStop();
    
    // 使用定时器定期检查模式变化（因为 zustand 没有直接的 subscribe 方法）
    const interval = setInterval(checkAndStop, 500);
    return () => clearInterval(interval);
  }, [isPlaying, selectedDate, handleDateChange]);

  // 处理片段点击（协同功能）- 参考代码实现
  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    setHighlightedSegmentId(segment.id);
    
    if (isRecording || !recordingStartTime) {
      return;
    }
    
    // 优先使用segmentId匹配audioSegment
    let targetSegment = segment.segmentId
      ? audioSegments.find(s => s.id === segment.segmentId)
      : undefined;
    
    // 如果没有segmentId，使用绝对时间匹配
    if (!targetSegment && segment.absoluteStart) {
      const abs = segment.absoluteStart.getTime();
      targetSegment = audioSegments.find(
        s => s.startTime.getTime() <= abs && s.endTime.getTime() >= abs
      );
    }
    
    // 如果仍未找到，使用录音开始时间计算
    if (!targetSegment && segment.audioStart !== undefined) {
      const startTime = new Date(recordingStartTime.getTime() + segment.audioStart);
      targetSegment = audioSegments.find(
        s => s.startTime.getTime() <= startTime.getTime() && s.endTime.getTime() >= startTime.getTime()
      );
    }
    
    if (!targetSegment && audioSegments.length > 0) {
      // 最后兜底：使用最新的音频文件
      targetSegment = audioSegments.sort((a, b) => b.endTime.getTime() - a.endTime.getTime())[0];
    }
    
    if (audioPlayerRef.current && targetSegment?.fileUrl) {
      audioPlayerRef.current.src = targetSegment.fileUrl;
      
      // 计算在该分段内的偏移（秒）
      let seekSeconds = 0;
      if (segment.absoluteStart) {
        // 优先使用绝对时间
        seekSeconds = Math.max(
          0,
          (segment.absoluteStart.getTime() - targetSegment.startTime.getTime()) / 1000
        );
      } else if (segment.audioStart !== undefined && recordingStartTime) {
        // 使用相对录音开始时间计算
        const segmentAbsoluteTime = recordingStartTime.getTime() + segment.audioStart;
        seekSeconds = Math.max(
          0,
          (segmentAbsoluteTime - targetSegment.startTime.getTime()) / 1000
        );
      }
      
      // 确保音频已加载
      if (audioPlayerRef.current.src !== targetSegment.fileUrl) {
        audioPlayerRef.current.load();
        audioPlayerRef.current.addEventListener('loadedmetadata', () => {
          if (audioPlayerRef.current) {
            const targetTime = Math.min(seekSeconds, audioPlayerRef.current.duration || 0);
            audioPlayerRef.current.currentTime = targetTime;
            setCurrentTime(targetTime);
            audioPlayerRef.current.play().catch(() => {
              // 忽略播放错误
            });
          }
        }, { once: true });
      } else {
        // 如果URL相同，直接设置时间并播放
        audioPlayerRef.current.pause();
        const targetTime = Math.min(seekSeconds, audioPlayerRef.current.duration || 0);
        audioPlayerRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
        Promise.resolve().then(() => {
          if (audioPlayerRef.current) {
            audioPlayerRef.current.play().catch(() => {
              // 忽略播放错误
            });
          }
        });
      }
    }
  }, [isRecording, recordingStartTime, audioSegments, setCurrentTime]);

  const handlePlay = useCallback(() => {
    if (audioPlayerRef.current && currentAudioUrl) {
      audioPlayerRef.current.play();
    }
  }, [currentAudioUrl]);

  const handleSeek = useCallback((time: number) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    if (audioPlayerRef.current) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
      handleSeek(newTime);
    }
  }, [currentTime, duration, handleSeek]);

  // 格式化时间显示
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // 处理片段悬停（用于播放器显示小节信息）
  const handleSegmentHover = useCallback((segment: TranscriptSegment | null) => {
    setHoveredSegment(segment);
  }, []);

  // 过滤当前日期的转录内容
  const filteredTranscripts = transcripts.filter((t) => {
    const transcriptDate = new Date(t.timestamp);
    return transcriptDate.toDateString() === selectedDate.toDateString();
  });

  // 获取当前播放位置对应的小节信息
  const getCurrentSegmentInfo = useCallback(() => {
    if (!currentTime) return null;
    const timeInMs = currentTime * 1000;
    const segment = filteredTranscripts.find(s => {
      const start = s.audioStart || 0;
      const end = s.audioEnd || start + 5000;
      return timeInMs >= start && timeInMs <= end;
    });
    if (segment) {
      const timeInSeconds = segment.audioStart ? segment.audioStart / 1000 : 0;
      return {
        time: formatTime(timeInSeconds),
        text: (segment.optimizedText || segment.rawText || "").substring(0, 50) + "...",
      };
    }
    return null;
  }, [currentTime, filteredTranscripts, formatTime]);

  // 根据时间获取对应的小节信息（用于悬停显示）
  const getSegmentAtTime = useCallback((time: number) => {
    // time 是播放时间（秒），需要转换为毫秒
    const timeInMs = time * 1000;
    
    // 找到包含该时间点的转录片段
    // 需要找到 audioStart <= timeInMs <= audioEnd 的片段
    const segment = filteredTranscripts.find(s => {
      const start = s.audioStart || 0;
      const end = s.audioEnd || (start + 5000); // 如果没有结束时间，默认5秒
      return timeInMs >= start && timeInMs <= end;
    });
    
    if (segment) {
      // 返回该片段的时间（相对于录音开始）和文本
      const segmentTimeInSeconds = (segment.audioStart || 0) / 1000;
      return {
        time: formatTime(segmentTimeInSeconds),
        text: (segment.optimizedText || segment.rawText || "").substring(0, 80),
      };
    }
    
    // 如果没有找到精确匹配，返回最接近的片段
    if (filteredTranscripts.length > 0) {
      // 找到最接近的片段（按开始时间）
      const closestSegment = filteredTranscripts.reduce((prev, curr) => {
        const prevDist = Math.abs((prev.audioStart || 0) - timeInMs);
        const currDist = Math.abs((curr.audioStart || 0) - timeInMs);
        return currDist < prevDist ? curr : prev;
      });
      
      const segmentTimeInSeconds = (closestSegment.audioStart || 0) / 1000;
      return {
        time: formatTime(segmentTimeInSeconds),
        text: (closestSegment.optimizedText || closestSegment.rawText || "").substring(0, 80),
      };
    }
    
    return null;
  }, [filteredTranscripts, formatTime]);

  // 获取当前日期的音频URL（使用从后端查询的音频列表）
  useEffect(() => {
    if (dayAudioSegments.length > 0) {
      // 如果还没有选中，或者选中的不在当前日期的列表中，选择第一个
      const currentSelected = dayAudioSegments.find(s => s.id === selectedAudioId);
      if (!currentSelected) {
        setSelectedAudioId(dayAudioSegments[0].id);
        if (dayAudioSegments[0].fileUrl) {
          setCurrentAudioUrl(dayAudioSegments[0].fileUrl);
          if (audioPlayerRef.current) {
            audioPlayerRef.current.src = dayAudioSegments[0].fileUrl;
            audioPlayerRef.current.load();
          }
        }
      } else if (currentSelected.fileUrl) {
        setCurrentAudioUrl(currentSelected.fileUrl);
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = currentSelected.fileUrl;
          audioPlayerRef.current.load();
        }
      }
    } else {
      setCurrentAudioUrl(null);
      setSelectedAudioId(undefined);
    }
  }, [selectedDate, dayAudioSegments, selectedAudioId]);

  // 计算总时长：优先使用音频实际时长，否则使用转录文本计算的总时长
  const totalDuration = duration > 0 
    ? duration 
    : (filteredTranscripts.length > 0
        ? Math.max(...filteredTranscripts.map(s => (s.audioEnd || 0) / 1000))
        : 0);

  // 更新当前时间（仅在客户端）
  useEffect(() => {
    // 立即设置一次，避免初始渲染时显示 null
    setNowTime(new Date());
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 更新标题（如果没有设置，使用默认值）
  useEffect(() => {
    if (!meetingTitle && filteredTranscripts.length > 0) {
      setMeetingTitle(`${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`);
    }
  }, [filteredTranscripts.length, selectedDate, meetingTitle]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 顶部：左右分栏（区域1和区域2） */}
      <div className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-sm relative z-50">
        <div className="flex overflow-hidden">
          {/* 区域1：顶部左侧 */}
          <div className="flex-[2] border-r border-border/50">
            <div className="flex items-center gap-4 px-6 py-3">
              {/* 日期、时间和标题 */}
              <div className="flex items-center gap-4 flex-1">
                {/* 日期选择器 */}
                <DateSelector
                  selectedDate={selectedDate}
                  onDateChange={handleDateChange}
                  onExport={handleExport}
                  onEdit={handleEdit}
                  availableDates={useMemo(() => {
                    // 从当前日期的音频列表计算（暂时只显示当前日期，后续可以从后端查询所有日期）
                    const dates = new Set<string>();
                    dayAudioSegments.forEach(segment => {
                      const date = new Date(segment.startTime);
                      dates.add(date.toDateString());
                    });
                    return Array.from(dates).map(dateStr => new Date(dateStr));
                  }, [dayAudioSegments])}
                  audioCounts={useMemo(() => {
                    // 计算每个日期的音频数量（从当前日期的音频列表）
                    const counts = new Map<string, number>();
                    dayAudioSegments.forEach(segment => {
                      const date = new Date(segment.startTime);
                      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
                    });
                    return counts;
                  }, [dayAudioSegments])}
                />
                
                {/* 当前时间（仅在客户端渲染，避免 SSR 不一致） */}
                {nowTime && (
                  <div className="text-sm text-muted-foreground font-mono" suppressHydrationWarning>
                    {nowTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                )}
                
                {/* 标题输入框 */}
                <input
                  type="text"
                  value={meetingTitle || `${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="输入标题..."
                  className="flex-1 px-3 py-1.5 text-sm font-medium bg-transparent border-b border-border/50 focus:border-primary focus:outline-none"
                />
              </div>

              {/* 录音模式时显示设备选择器 */}

              {/* 功能图标切换（回看模式时显示） */}
              {viewMode === 'playback' && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => handleViewChange('original')}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-md transition-all",
                      currentView === 'original'
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                    title="原文"
                  >
                    原文
                  </button>
                  <button
                    onClick={() => handleViewChange('optimized')}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-md transition-all",
                      currentView === 'optimized'
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                    title="智能优化"
                  >
                    智能优化
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* 区域2：顶部右侧 */}
          <div className="flex-1">
            <div className="flex items-center justify-end gap-2 px-6 py-3">
            {viewMode === 'playback' ? (
              <>
                {/* 测试模式：上传音频文件 */}
                <label className={cn(
                  "px-4 py-2.5 rounded-lg transition-all duration-200",
                  "bg-muted hover:bg-muted/80 text-foreground",
                  "border border-border/50",
                  "flex items-center gap-2 text-sm font-medium cursor-pointer",
                  "hover:shadow-md active:scale-95"
                )}>
                  <Upload className="w-4 h-4" />
                  <span>测试音频</span>
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file && recordingServiceRef.current) {
                        try {
                          setError(null);
                          setViewMode('recording');
                          
                          // 创建音频URL用于播放
                          const audioUrl = URL.createObjectURL(file);
                          
                          // 使用文件上传API进行转录测试
                          const formData = new FormData();
                          formData.append("file", file);
                          formData.append("optimize", "true");
                          formData.append("extract_todos", "true");
                          formData.append("extract_schedules", "true");
                          
                          const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';
                          const response = await fetch(`${apiUrl}/audio/transcribe-file`, {
                            method: 'POST',
                            body: formData,
                          });
                          
                          if (response.ok) {
                            const result = await response.json();
                            console.log('[测试音频] 完整API响应:', JSON.stringify(result, null, 2));
                            // 存储API响应，用于展示
                            setApiResponse(result);
                            
                            // 获取音频时长
                            const audio = new Audio();
                            audio.src = audioUrl;
                            const duration = await new Promise<number>((resolve) => {
                              audio.onloadedmetadata = () => {
                                resolve(audio.duration * 1000); // 转换为毫秒
                              };
                              audio.onerror = () => {
                                // 如果无法加载元数据，使用默认时长
                                console.warn('无法获取音频时长，使用默认值');
                                resolve(60000); // 默认1分钟
                              };
                              // 超时保护
                              setTimeout(() => {
                                if (!audio.duration || isNaN(audio.duration)) {
                                  resolve(60000); // 默认1分钟
                                }
                              }, 3000);
                            });
                            
                            // 创建音频片段
                            const audioSegment: AudioSegment = {
                              id: `test_audio_${Date.now()}`,
                              startTime: new Date(),
                              endTime: new Date(Date.now() + duration),
                              duration: duration,
                              fileSize: file.size,
                              fileUrl: audioUrl,
                              audioSource: 'microphone',
                              uploadStatus: 'uploaded',
                            };
                            addAudioSegment(audioSegment);
                            
                            // 创建转录片段（按段落分割成多个独立的segment）
                            if (result.transcript) {
                              const text = result.transcript;
                              const optimizedText = result.optimized_text || undefined;
                              
                              // 按句号、问号、感叹号、换行符分段
                              // 如果没有这些标点，按时间点（如"7点"、"7:40"等）或长空格分段
                              const paragraphRegex = /([。！？\n]+)/g;
                              const paragraphs: string[] = [];
                              let lastIndex = 0;
                              let match;
                              
                              while ((match = paragraphRegex.exec(text)) !== null) {
                                const paragraphText = text.substring(lastIndex, match.index).trim();
                                if (paragraphText) {
                                  paragraphs.push(paragraphText);
                                }
                                lastIndex = match.index + match[0].length;
                              }
                              
                              // 添加最后一段（如果没有以标点结尾）
                              if (lastIndex < text.length) {
                                const remainingText = text.substring(lastIndex).trim();
                                if (remainingText) {
                                  paragraphs.push(remainingText);
                                }
                              }
                              
                              // 如果没有找到段落分隔符，按时间点或长空格分段
                              if (paragraphs.length === 0 || (paragraphs.length === 1 && paragraphs[0] === text)) {
                                // 按时间点分段（如"早上7点"、"7点40分"、"11点30分"、"7:40"等）
                                const timePointRegex = /(早上|上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})[点:](\d{0,2})[分]?|(\d{1,2})点(\d{0,2})分?/g;
                                const timeMatches: Array<{ index: number; text: string }> = [];
                                let timeMatch;
                                
                                while ((timeMatch = timePointRegex.exec(text)) !== null) {
                                  timeMatches.push({
                                    index: timeMatch.index,
                                    text: timeMatch[0],
                                  });
                                }
                                
                                if (timeMatches.length > 1) {
                                  // 按时间点分段
                                  paragraphs.length = 0; // 清空
                                  for (let i = 0; i < timeMatches.length; i++) {
                                    const startIndex = i === 0 ? 0 : timeMatches[i].index;
                                    const endIndex = i < timeMatches.length - 1 ? timeMatches[i + 1].index : text.length;
                                    const paragraphText = text.substring(startIndex, endIndex).trim();
                                    if (paragraphText) {
                                      paragraphs.push(paragraphText);
                                    }
                                  }
                                } else {
                                  // 如果没有时间点，按长空格（2个以上空格）分段
                                  const longSpaceRegex = /\s{2,}/g;
                                  const spaceMatches: number[] = [0];
                                  let spaceMatch;
                                  
                                  while ((spaceMatch = longSpaceRegex.exec(text)) !== null) {
                                    spaceMatches.push(spaceMatch.index);
                                  }
                                  spaceMatches.push(text.length);
                                  
                                  if (spaceMatches.length > 2) {
                                    paragraphs.length = 0; // 清空
                                    for (let i = 0; i < spaceMatches.length - 1; i++) {
                                      const paragraphText = text.substring(spaceMatches[i], spaceMatches[i + 1]).trim();
                                      if (paragraphText) {
                                        paragraphs.push(paragraphText);
                                      }
                                    }
                                  } else {
                                    // 如果都没有，按单个空格或固定长度分段（每50个字符一段）
                                    paragraphs.length = 0;
                                    const chunkSize = 50;
                                    for (let i = 0; i < text.length; i += chunkSize) {
                                      const chunk = text.substring(i, i + chunkSize).trim();
                                      if (chunk) {
                                        paragraphs.push(chunk);
                                      }
                                    }
                                    if (paragraphs.length === 0) {
                                      paragraphs.push(text);
                                    }
                                  }
                                }
                              }
                              
                              console.log('[测试音频] 原文分段结果:', paragraphs.length, '个段落');
                              paragraphs.forEach((para, idx) => {
                                console.log(`  段落${idx + 1}:`, para.substring(0, 30) + '...');
                              });
                              
                              // 同样处理优化文本（按换行符或句号分段）
                              const optimizedParagraphs: string[] = [];
                              if (optimizedText) {
                                // 优化文本通常有换行符，先按换行符分段
                                const optimizedLines = optimizedText.split(/\n+/).filter((line: string) => line.trim());
                                if (optimizedLines.length > 0) {
                                  optimizedParagraphs.push(...optimizedLines.map((line: string) => line.trim()));
                                } else {
                                  // 如果没有换行符，按句号分段
                                  let optLastIndex = 0;
                                  paragraphRegex.lastIndex = 0; // 重置正则
                                  while ((match = paragraphRegex.exec(optimizedText)) !== null) {
                                    const paragraphText = optimizedText.substring(optLastIndex, match.index).trim();
                                    if (paragraphText) {
                                      optimizedParagraphs.push(paragraphText);
                                    }
                                    optLastIndex = match.index + match[0].length;
                                  }
                                  if (optLastIndex < optimizedText.length) {
                                    const remainingText = optimizedText.substring(optLastIndex).trim();
                                    if (remainingText) {
                                      optimizedParagraphs.push(remainingText);
                                    }
                                  }
                                  if (optimizedParagraphs.length === 0) {
                                    optimizedParagraphs.push(optimizedText);
                                  }
                                }
                              }
                              
                              console.log('[测试音频] 优化文本分段结果:', optimizedParagraphs.length, '个段落');
                              optimizedParagraphs.forEach((para, idx) => {
                                console.log(`  优化段落${idx + 1}:`, para.substring(0, 30) + '...');
                              });
                              
                              // 为每个段落创建独立的segment
                              const baseTimestamp = new Date();
                              const segmentDuration = duration / paragraphs.length; // 平均分配时长
                              const createdSegments: TranscriptSegment[] = [];
                              
                              paragraphs.forEach((paragraph, index) => {
                                const segmentId = `test_${Date.now()}_${index}`;
                                // 如果优化文本有对应的段落，使用它；否则为undefined
                                const optimizedPara = optimizedParagraphs[index];
                                const segment: TranscriptSegment = {
                                  id: segmentId,
                                  timestamp: new Date(baseTimestamp.getTime() + index * segmentDuration),
                                  rawText: paragraph,
                                  optimizedText: optimizedPara && optimizedPara.trim() ? optimizedPara : undefined,
                                  isOptimized: !!(optimizedText && optimizedPara && optimizedPara.trim()),
                                  isInterim: false,
                                  containsSchedule: false, // 先设为false，提取后再更新
                                  containsTodo: false, // 先设为false，提取后再更新
                                  audioStart: index * segmentDuration,
                                  audioEnd: (index + 1) * segmentDuration,
                                  audioFileId: audioSegment.id,
                                  uploadStatus: 'uploaded',
                                };
                                addTranscript(segment);
                                createdSegments.push(segment);
                              });
                              
                              // 转录完成后，立即触发智能提取（对所有段落）
                              console.log('[测试音频] 转录完成，开始智能提取');
                              
                              // 触发待办提取（对所有段落）
                              if (todoExtractionServiceRef.current) {
                                console.log('[测试音频] 触发待办提取服务');
                                if (todoExtractionServiceRef.current) {
                                  todoExtractionServiceRef.current.extractedTodosWithoutCallback = [];
                                }
                                todoExtractionServiceRef.current.setCallbacks({
                                  onError: (err) => {
                                    console.error('Todo extraction error:', err);
                                  },
                                  onStatusChange: () => {},
                                });
                                // 为所有段落触发提取
                                createdSegments.forEach((seg) => {
                                  const textForExtraction = seg.optimizedText || seg.rawText;
                                  if (textForExtraction) {
                                    const segmentForExtraction = textForExtraction === seg.optimizedText 
                                      ? seg 
                                      : { ...seg, optimizedText: seg.rawText, isOptimized: true };
                                    todoExtractionServiceRef.current?.enqueue(segmentForExtraction);
                                  }
                                });
                                
                                setTimeout(() => {
                                  const storedTodos = todoExtractionServiceRef.current?.extractedTodosWithoutCallback || [];
                                  if (storedTodos.length > 0) {
                                    console.log('[测试音频] 发现', storedTodos.length, '个待确认的待办');
                                    setPendingTodos(storedTodos);
                                    if (todoExtractionServiceRef.current) {
                                      todoExtractionServiceRef.current.extractedTodosWithoutCallback = [];
                                    }
                                  }
                                }, 2000);
                              }
                              
                              // 触发日程提取（对所有段落）
                              if (scheduleExtractionServiceRef.current) {
                                console.log('[测试音频] 触发日程提取服务');
                                const service = scheduleExtractionServiceRef.current;
                                // 不设置onScheduleExtracted回调，让提取结果存储到待确认列表
                                service.setCallbacks({
                                  onError: (err) => {
                                    console.error('Schedule extraction error:', err);
                                    setProcessStatus('scheduleExtraction', 'error');
                                  },
                                  onStatusChange: (status) => {
                                    setProcessStatus('scheduleExtraction', status);
                                  },
                                });
                                service.extractedSchedulesWithoutCallback = [];
                                
                                // 为所有段落触发提取
                                createdSegments.forEach((seg) => {
                                  const textForExtraction = seg.optimizedText || seg.rawText;
                                  if (textForExtraction) {
                                    const segmentForExtraction = textForExtraction === seg.optimizedText 
                                      ? seg 
                                      : { ...seg, optimizedText: seg.rawText, isOptimized: true };
                                    service.enqueue(segmentForExtraction);
                                  }
                                });
                                
                                setTimeout(() => {
                                  const storedSchedules = service.extractedSchedulesWithoutCallback;
                                  if (storedSchedules.length > 0) {
                                    console.log('[测试音频] 发现', storedSchedules.length, '个待确认的日程');
                                    setPendingSchedules(storedSchedules);
                                    service.extractedSchedulesWithoutCallback = [];
                                  }
                                }, 2000);
                              }
                              
                              // 如果后端也返回了提取结果，添加到待确认列表（不自动加入）
                              const firstSegmentId = createdSegments[0]?.id || '';
                              if (result.todos && result.todos.length > 0) {
                                console.log('[测试音频] 后端也返回了', result.todos.length, '个待办事项，添加到待确认列表');
                                const backendTodos: ExtractedTodo[] = result.todos.map((todo: any, index: number) => ({
                                  id: `todo_backend_${Date.now()}_${index}_${Math.random()}`,
                                  sourceSegmentId: firstSegmentId,
                                  extractedAt: new Date(),
                                  title: todo.title || todo.name || '待办事项',
                                  description: todo.description || '',
                                  deadline: todo.deadline ? new Date(todo.deadline) : undefined,
                                  priority: todo.priority || 'medium',
                                  sourceText: todo.source_text || todo.description,
                                  textStartIndex: todo.text_start_index,
                                  textEndIndex: todo.text_end_index,
                                }));
                                setPendingTodos(prev => [...prev, ...backendTodos]);
                              }
                              
                              if (result.schedules && result.schedules.length > 0) {
                                console.log('[测试音频] 后端也返回了', result.schedules.length, '个日程，添加到待确认列表');
                                const backendSchedules: ScheduleItem[] = result.schedules.map((schedule: any, index: number) => ({
                                  id: `schedule_backend_${Date.now()}_${index}_${Math.random()}`,
                                  sourceSegmentId: firstSegmentId,
                                  extractedAt: new Date(),
                                  scheduleTime: new Date(schedule.schedule_time || schedule.scheduleTime || Date.now()),
                                  description: schedule.description || schedule.content || '',
                                  status: 'pending',
                                  sourceText: schedule.source_text || schedule.description,
                                  textStartIndex: schedule.text_start_index,
                                  textEndIndex: schedule.text_end_index,
                                }));
                                setPendingSchedules(prev => [...prev, ...backendSchedules]);
                              }
                              
                              // 等待提取处理完成后再验证
                              setTimeout(() => {
                                const updatedSegments = useAppStore.getState().transcripts.filter(t => 
                                  createdSegments.some(s => s.id === t.id)
                                );
                                console.log('[测试音频] 验证segment更新:', {
                                  count: updatedSegments.length,
                                  withTodo: updatedSegments.filter(s => s.containsTodo).length,
                                  withSchedule: updatedSegments.filter(s => s.containsSchedule).length,
                                });
                                
                                // 如果提取成功，触发UI更新
                                if (updatedSegments.some(s => s.containsTodo || s.containsSchedule)) {
                                  // 触发重新渲染
                                  setHighlightedSegmentId(firstSegmentId);
                                  setTimeout(() => setHighlightedSegmentId(undefined), 100);
                                }
                              }, 1000);
                              
                              // 设置当前音频URL，使播放器可以播放
                              setCurrentAudioUrl(audioUrl);
                              
                              // 初始化播放器
                              if (audioPlayerRef.current) {
                                audioPlayerRef.current.src = audioUrl;
                                audioPlayerRef.current.load();
                                setDuration(duration / 1000); // 转换为秒
                              }
                            }
                            
                            setViewMode('playback');
                          } else {
                            const errorText = await response.text();
                            throw new Error(`转录失败: ${errorText}`);
                          }
                        } catch (err) {
                          const error = err instanceof Error ? err : new Error('测试失败');
                          console.error('Test recording error:', error);
                          setError(error.message);
                          setViewMode('playback');
                        }
                      }
                      // 重置 input
                      e.target.value = '';
                    }}
                  />
                </label>
                
                {/* 开始录音按钮 */}
                <button
                  onClick={handleStartRecording}
                  className={cn(
                    "px-6 py-3 rounded-xl transition-all duration-300",
                    "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground",
                    "hover:from-primary/90 hover:to-primary/80",
                    "shadow-lg hover:shadow-xl",
                    "flex items-center gap-2.5 text-sm font-semibold",
                    "active:scale-95 hover:scale-105",
                    "border border-primary/20"
                  )}
                  title="开始录音"
                >
                  <Mic className="w-4 h-4" />
                  开始录音
                </button>
              </>
            ) : isRecording ? (
              useAppStore.getState().processStatus.recording === 'paused' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                  <div className="relative w-2 h-2">
                    <div className="absolute inset-0 bg-amber-500 rounded-full" />
                  </div>
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">暂停中</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30">
                  <div className="relative w-2 h-2">
                    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
                    <div className="absolute inset-0 bg-red-500 rounded-full" />
                  </div>
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">录音中</span>
                </div>
              )
            ) : (
              <button
                onClick={() => handleModeChange('playback')}
                className={cn(
                  "px-5 py-2.5 rounded-lg transition-all",
                  "bg-muted text-foreground",
                  "hover:bg-muted/80 shadow-md hover:shadow-lg",
                  "flex items-center gap-2",
                  "border border-border/50 text-sm font-medium",
                  "active:scale-95"
                )}
                title="切换到回看模式"
              >
                <Play className="w-4 h-4 ml-0.5" />
                回看
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区域：左右分栏（区域3和区域4） */}
      <div className="flex-1 flex overflow-hidden">
        {/* 区域3：下方左侧 */}
        <div className="flex-[2] flex flex-col overflow-hidden border-r border-border/50">
          {/* 录音模式：显示录音视图 */}
          {viewMode === 'recording' ? (
            <RecordingView
              isRecording={isRecording}
              isPaused={useAppStore.getState().processStatus.recording === 'paused'}
              recordingDuration={recordingDuration}
              segments={filteredTranscripts}
              currentSpeaker={currentSpeaker}
              onSpeakerChange={setCurrentSpeaker}
              onSegmentClick={handleSegmentClick}
              highlightedSegmentId={highlightedSegmentId}
              warningMessage={undefined}
              onPause={handlePauseRecording}
              onResume={handleResumeRecording}
              onStop={handleStopRecording}
              audioLevel={0}
              analyser={analyser}
              schedules={schedules.filter(s => {
                const scheduleDate = new Date(s.scheduleTime);
                return scheduleDate.toDateString() === selectedDate.toDateString();
              })}
              todos={extractedTodos.filter(t => {
                const todoDate = t.deadline ? new Date(t.deadline) : null;
                return todoDate ? todoDate.toDateString() === selectedDate.toDateString() : false;
              })}
            />
          ) : (
            <>
              {/* 左侧中间：内容视图（回看模式） */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {currentView === 'original' && (
                  <OriginalTextView
                    segments={filteredTranscripts}
                    onSegmentClick={handleSegmentClick}
                    highlightedSegmentId={highlightedSegmentId}
                    schedules={schedules.filter(s => {
                      const scheduleDate = new Date(s.scheduleTime);
                      return scheduleDate.toDateString() === selectedDate.toDateString();
                    })}
                    todos={extractedTodos.filter(t => {
                      const todoDate = t.deadline ? new Date(t.deadline) : null;
                      return todoDate ? todoDate.toDateString() === selectedDate.toDateString() : false;
                    })}
                  />
                )}
                {currentView === 'optimized' && (
                  <OptimizedTextView
                    segments={filteredTranscripts}
                    onSegmentClick={handleSegmentClick}
                    highlightedSegmentId={highlightedSegmentId}
                    schedules={schedules.filter(s => {
                      const scheduleDate = new Date(s.scheduleTime);
                      return scheduleDate.toDateString() === selectedDate.toDateString();
                    })}
                    todos={extractedTodos.filter(t => {
                      const todoDate = t.deadline ? new Date(t.deadline) : null;
                      return todoDate ? todoDate.toDateString() === selectedDate.toDateString() : false;
                    })}
                  />
                )}
              </div>

              {/* 左侧底部：播放器（回看模式时显示） */}
              <div className="shrink-0 border-t border-border/50">
                <CompactPlayer
                  title={meetingTitle}
                  date={selectedDate}
                  duration={totalDuration}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  audioUrl={currentAudioUrl || undefined}
                  playbackSpeed={playbackSpeed}
                  audioSegments={audioSegments.filter(s => {
                    const segmentDate = new Date(s.startTime);
                    return segmentDate.toDateString() === selectedDate.toDateString();
                  })}
                  selectedAudioId={selectedAudioId}
                  onSelectAudio={handleSelectAudio}
                  hoveredSegment={hoveredSegment ? {
                    time: hoveredSegment.audioStart ? formatTime(hoveredSegment.audioStart / 1000) : "00:00",
                    text: (hoveredSegment.optimizedText || hoveredSegment.rawText || "").substring(0, 50) + "...",
                  } : getCurrentSegmentInfo()}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onSkip={handleSkip}
                  getSegmentAtTime={getSegmentAtTime}
                  onSpeedChange={(speed) => {
                    setPlaybackSpeed(speed);
                    if (audioPlayerRef.current) {
                      audioPlayerRef.current.playbackRate = speed;
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* 右侧：辅助内容区域（1/3） */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
          {/* 右侧内容：音频列表、智能提取和智能纪要上下排列 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 音频列表面板 - 始终显示当天的音频列表（直接从后端查询） */}
            {viewMode === 'playback' && (
              <>
                <AudioListPanel
                  audioSegments={dayAudioSegments}
                  selectedAudioId={selectedAudioId}
                  onSelectAudio={handleSelectAudio}
                />
                {dayAudioSegments.length > 0 && (
                  <div className="border-t border-border/50 my-2" />
                )}
              </>
            )}
            
            {/* 智能提取面板 */}
            {(pendingTodos.length > 0 || pendingSchedules.length > 0) && (
              <>
                <ExtractedItemsPanel
                  todos={pendingTodos}
                  schedules={pendingSchedules}
                  onAddTodo={async (todo) => {
                    // 用户选择加入待办
                    await handleAddTodo(todo);
                    // 从待确认列表中移除
                    setPendingTodos(prev => prev.filter(t => t.id !== todo.id));
                  }}
                  onAddSchedule={async (schedule) => {
                    // 用户选择加入日程
                    await handleAddSchedule(schedule);
                    // 从待确认列表中移除
                    setPendingSchedules(prev => prev.filter(s => s.id !== schedule.id));
                  }}
                  onDismissTodo={(todoId) => {
                    // 用户选择忽略待办
                    setPendingTodos(prev => prev.filter(t => t.id !== todoId));
                  }}
                  onDismissSchedule={(scheduleId) => {
                    // 用户选择忽略日程
                    setPendingSchedules(prev => prev.filter(s => s.id !== scheduleId));
                  }}
                />
                {/* 分割线 */}
                <div className="border-t border-border/50 my-2" />
              </>
            )}
            
            {/* 智能纪要 */}
            <div className="flex-1 min-h-0">
              <MeetingSummary
                segments={filteredTranscripts}
                schedules={schedules}
                todos={extractedTodos}
                onSegmentClick={handleSegmentClick}
                summaryText={meetingSummary}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="shrink-0 px-6 py-2 bg-red-500/10 text-red-600 dark:text-red-400 text-sm border-t border-red-500/20">
          {error}
        </div>
      )}
    </div>
  );
}

