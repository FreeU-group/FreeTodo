"use client";

import React, { useEffect, useRef, useState } from 'react';
import OpenAI from 'openai';
import WaveformTimeline from './components/WaveformTimeline';
import TranscriptionLog from './components/TranscriptionLog';
import ChatInterface from './components/ChatInterface';
import { useAppStore } from './store/useAppStore';
import { RecordingService } from './services/RecordingService';
import { RecognitionService } from './services/RecognitionService';
import { OptimizationService } from './services/OptimizationService';
import { ScheduleExtractionService } from './services/ScheduleExtractionService';
import { PersistenceService } from './services/PersistenceService';
import { TranscriptSegment, ChatMessage, AudioSegment, ScheduleItem } from './types';

const SYSTEM_PROMPT_CHAT = `
你是一个智能语音助手。请根据提供的最近10分钟的语音转录上下文回答用户问题。
如果答案不在上下文中，请明确告知。
`;

export function VoiceModulePanel() {
  const {
    isRecording,
    recordingStartTime,
    currentTime,
    timeline,
    transcripts,
    schedules,
    audioSegments,
    processStatus,
    startRecording: storeStartRecording,
    stopRecording: storeStopRecording,
    setCurrentTime: storeSetCurrentTime,
    setTimelineView,
    setTimelineZoom,
    addTranscript,
    updateTranscript,
    addSchedule,
    addAudioSegment,
    updateAudioSegment,
    setProcessStatus,
  } = useAppStore();

  const recordingServiceRef = useRef<RecordingService | null>(null);
  const recognitionServiceRef = useRef<RecognitionService | null>(null);
  const optimizationServiceRef = useRef<OptimizationService | null>(null);
  const scheduleExtractionServiceRef = useRef<ScheduleExtractionService | null>(null);
  const persistenceServiceRef = useRef<PersistenceService | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { 
      id: 'init', 
      role: 'model', 
      text: '你好！我是基于 DeepSeek 的 7×24 智能录音助手。我可以持续录音、识别语音并自动提取日程。你可以随时向我提问，如果有录音内容，我会基于最近的录音内容回答；如果没有录音内容，我也可以回答一般性问题。', 
      timestamp: new Date() 
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<number | null>(null);

  // 初始化服务
  useEffect(() => {
    const recordingService = new RecordingService();
    recordingService.setCallbacks({
      onSegmentReady: handleAudioSegmentReady,
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

    const persistenceService = new PersistenceService();
    persistenceService.setCallbacks({
      onUploadProgress: (type, progress) => {
        console.log(`Upload progress (${type}): ${progress}%`);
      },
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
        if (audio.currentTime) {
          storeSetCurrentTime(new Date(Date.now() - (audio.duration - audio.currentTime) * 1000));
        }
      }, 100);
    };

    let apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.includes('your_deepseek_api_key')) {
      apiKey = "sk-26d76c61cf2842fcb729e019d587a026";
    }
    setIsApiKeyMissing(!apiKey);

    return () => {
      recordingService.stop();
      recognitionService.stop();
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      storeSetCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAudioSegmentReady = async (blob: Blob, startTime: Date, endTime: Date, segmentId: string) => {
    const audioSegment: AudioSegment = {
      id: segmentId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      fileSize: blob.size,
      uploadStatus: 'pending',
    };
    addAudioSegment(audioSegment);

    if (persistenceServiceRef.current) {
      updateAudioSegment(segmentId, { uploadStatus: 'uploading' });
      const audioFileId = await persistenceServiceRef.current.uploadAudio(blob, {
        startTime,
        endTime,
        segmentId,
      });
      if (audioFileId) {
        // 获取音频文件 URL
        const audioUrl = await persistenceServiceRef.current.getAudioUrl(audioFileId);
        updateAudioSegment(segmentId, { 
          fileUrl: audioUrl || undefined, 
          uploadStatus: 'uploaded' 
        });
      } else {
        updateAudioSegment(segmentId, { uploadStatus: 'failed' });
      }
    }
  };

  const handleRecognitionResult = (text: string, isFinal: boolean) => {
    if (!text.trim()) return;
    const currentRecordingStartTime = useAppStore.getState().recordingStartTime;
    if (!currentRecordingStartTime) return;

    const now = Date.now();
    const relativeEndTime = now - currentRecordingStartTime.getTime();
    const relativeStartTime = Math.max(0, relativeEndTime - 2000);
    const absoluteEnd = new Date();
    const absoluteStart = new Date(absoluteEnd.getTime() - Math.max(500, relativeEndTime - relativeStartTime));

    const lastSegment = useAppStore.getState().audioSegments[useAppStore.getState().audioSegments.length - 1];
    const transcripts = useAppStore.getState().transcripts;
    
    if (isFinal) {
      // 最终结果：创建新片段或更新最后一个临时片段
      const lastInterimSegment = [...transcripts].reverse().find(t => t.isInterim);
      
      if (lastInterimSegment) {
        // 更新临时片段为最终结果
        updateTranscript(lastInterimSegment.id, {
          rawText: text,
          isInterim: false,
          interimText: undefined,
          absoluteStart,
          absoluteEnd,
          audioStart: relativeStartTime,
          audioEnd: relativeEndTime,
        });
        
        // 触发优化
        const updatedSegment = { ...lastInterimSegment, rawText: text, isInterim: false };
        if (optimizationServiceRef.current) {
          optimizationServiceRef.current.enqueue(updatedSegment);
        }
      } else {
        // 创建新的最终片段
        const segment: TranscriptSegment = {
          id: `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date(),
          absoluteStart,
          absoluteEnd,
          segmentId: lastSegment?.id,
          rawText: text,
          isOptimized: false,
          isInterim: false,
          containsSchedule: false,
          audioStart: relativeStartTime,
          audioEnd: relativeEndTime,
          uploadStatus: 'pending',
        };
        addTranscript(segment);
        if (optimizationServiceRef.current) {
          optimizationServiceRef.current.enqueue(segment);
        }
      }
    } else {
      // 临时结果：更新最后一个临时片段或创建新的临时片段
      const lastInterimSegment = [...transcripts].reverse().find(t => t.isInterim);
      
      if (lastInterimSegment) {
        // 更新临时文本
        updateTranscript(lastInterimSegment.id, {
          interimText: text,
          absoluteEnd,
          audioEnd: relativeEndTime,
        });
      } else {
        // 创建新的临时片段
        const segment: TranscriptSegment = {
          id: `transcript_interim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date(),
          absoluteStart,
          absoluteEnd,
          segmentId: lastSegment?.id,
          rawText: '', // 临时结果时为空
          interimText: text,
          isOptimized: false,
          isInterim: true,
          containsSchedule: false,
          audioStart: relativeStartTime,
          audioEnd: relativeEndTime,
          uploadStatus: 'pending',
        };
        addTranscript(segment);
      }
    }
  };

  const handleTextOptimized = (segmentId: string, optimizedText: string, containsSchedule: boolean) => {
    updateTranscript(segmentId, {
      optimizedText,
      isOptimized: true,
      containsSchedule,
    });

    if (containsSchedule && scheduleExtractionServiceRef.current) {
      const segment = transcripts.find(t => t.id === segmentId);
      if (segment) {
        scheduleExtractionServiceRef.current.enqueue({
          ...segment,
          optimizedText,
          isOptimized: true,
          containsSchedule,
        });
      }
    }

    setTimeout(() => {
      const currentTranscripts = useAppStore.getState().transcripts;
      const pendingTranscripts = currentTranscripts.filter(t => t.isOptimized && t.uploadStatus === 'pending');
      if (pendingTranscripts.length >= 10 && persistenceServiceRef.current) {
        persistenceServiceRef.current.saveTranscripts(pendingTranscripts);
        pendingTranscripts.forEach(t => {
          updateTranscript(t.id, { uploadStatus: 'uploaded' });
        });
      }
    }, 100);
  };

  const handleScheduleExtracted = (schedule: ScheduleItem) => {
    addSchedule(schedule);
    setTimeout(() => {
      const currentSchedules = useAppStore.getState().schedules;
      const pendingSchedules = currentSchedules.filter(s => s.status === 'pending');
      if (pendingSchedules.length >= 5 && persistenceServiceRef.current) {
        persistenceServiceRef.current.saveSchedules(pendingSchedules);
      }
    }, 100);
  };

  const handleStartRecording = async () => {
    setError(null);
    storeStartRecording();
    try {
      if (recordingServiceRef.current) {
        await recordingServiceRef.current.start();
        setProcessStatus('recording', 'running');
      }
      if (recognitionServiceRef.current) {
        setTimeout(() => {
          recognitionServiceRef.current?.start();
        }, 500);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setError(error.message);
      setProcessStatus('recording', 'error');
      storeStopRecording();
    }
  };

  const handleStopRecording = async () => {
    if (recordingServiceRef.current) {
      await recordingServiceRef.current.stop();
      setProcessStatus('recording', 'idle');
    }
    if (recognitionServiceRef.current) {
      recognitionServiceRef.current.stop();
    }
    storeStopRecording();
  };

  const handleSeek = async (time: Date) => {
    if (isRecording) return;
    const segment = audioSegments.find(s => s.startTime <= time && s.endTime >= time);
    if (segment && audioPlayerRef.current) {
      // 如果还没有 fileUrl，尝试获取
      let audioUrl = segment.fileUrl;
      if (!audioUrl && segment.id && persistenceServiceRef.current) {
        const fetchedUrl = await persistenceServiceRef.current.getAudioUrl(segment.id);
        if (fetchedUrl) {
          audioUrl = fetchedUrl;
          updateAudioSegment(segment.id, { fileUrl: fetchedUrl });
        }
      }
      
      if (audioUrl) {
        audioPlayerRef.current.src = audioUrl;
        const seekTime = (time.getTime() - segment.startTime.getTime()) / 1000;
        audioPlayerRef.current.currentTime = seekTime;
        audioPlayerRef.current.play();
      }
    }
  };

  const handleTimelineChange = (startTime: Date, duration: number) => {
    setTimelineView(startTime, duration);
    const endTime = new Date(startTime.getTime() + duration);
    if (persistenceServiceRef.current) {
      persistenceServiceRef.current.queryTranscripts(startTime, endTime).then(fetched => {
        const existing = useAppStore.getState().transcripts;
        fetched.forEach(segment => {
          if (!existing.find(t => t.id === segment.id)) {
            addTranscript(segment);
          }
        });
      });
      persistenceServiceRef.current.querySchedules(startTime, endTime).then(fetched => {
        const existing = useAppStore.getState().schedules;
        fetched.forEach(schedule => {
          if (!existing.find(s => s.id === schedule.id)) {
            addSchedule(schedule);
          }
        });
      });
    }
  };

  const handleSegmentClick = async (
    startMs: number,
    endMs: number,
    segmentId?: string,
    absoluteStartMs?: number
  ) => {
    if (isRecording || !recordingStartTime) return;
    let targetSegment = segmentId ? audioSegments.find(s => s.id === segmentId) : undefined;
    if (!targetSegment && absoluteStartMs) {
      const abs = new Date(absoluteStartMs);
      targetSegment = audioSegments.find(s => s.startTime <= abs && s.endTime >= abs);
    }
    if (!targetSegment) {
      const startTime = new Date(recordingStartTime.getTime() + startMs);
      await handleSeek(startTime);
      return;
    }
    if (audioPlayerRef.current) {
      // 如果还没有 fileUrl，尝试获取
      let audioUrl = targetSegment.fileUrl;
      if (!audioUrl && targetSegment.id && persistenceServiceRef.current) {
        const fetchedUrl = await persistenceServiceRef.current.getAudioUrl(targetSegment.id);
        if (fetchedUrl) {
          audioUrl = fetchedUrl;
          updateAudioSegment(targetSegment.id, { fileUrl: fetchedUrl });
        }
      }
      
      if (audioUrl) {
        audioPlayerRef.current.src = audioUrl;
        let seekSeconds = 0;
        if (absoluteStartMs) {
          seekSeconds = Math.max(0, (absoluteStartMs - targetSegment.startTime.getTime()) / 1000);
        } else {
          seekSeconds = Math.max(0, (startMs - (targetSegment.startTime.getTime() - recordingStartTime.getTime())) / 1000);
        }
        audioPlayerRef.current.currentTime = seekSeconds;
        audioPlayerRef.current.play();
        return;
      }
    }
    const startTime = new Date(recordingStartTime.getTime() + startMs);
    await handleSeek(startTime);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    const msgId = Date.now().toString();
    setChatMessages(prev => [...prev, { id: msgId, role: 'user', text, timestamp: new Date() }]);
    setIsChatLoading(true);
    try {
      // 获取最近 10 分钟的转录内容作为上下文（可选）
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const contextSegments = transcripts.filter(t => t.timestamp > tenMinutesAgo);
      const contextString = contextSegments
        .map(t => `[${t.timestamp.toLocaleTimeString()}] ${t.optimizedText || t.rawText}`)
        .join('\n');
      
      // 使用 Next.js 代理路径（会自动代理到后端 localhost:8000）
      // API Key 由后端管理，前端不需要传递真实 Key
      // OpenAI SDK 需要完整的 URL，在浏览器环境中使用 window.location.origin
      let baseURL: string;
      if (typeof window !== 'undefined' && window.location) {
        // 浏览器环境：使用当前页面的 origin + 代理路径
        const origin = window.location.origin;
        if (!origin || origin === 'null' || origin === 'undefined') {
          // 如果 origin 无效，使用默认值
          baseURL = 'http://localhost:3000/api/deepseek';
        } else {
          baseURL = `${origin}/api/deepseek`;
        }
      } else {
        // 服务端环境：直接使用后端地址
        baseURL = 'http://localhost:8000/api/deepseek';
      }
      
      // 验证 baseURL 是否有效
      try {
        new URL(baseURL);
      } catch (urlError) {
        console.error('Invalid baseURL:', baseURL, urlError);
        throw new Error(`Invalid API URL: ${baseURL}`);
      }
      
      const ai = new OpenAI({
        baseURL: baseURL,
        apiKey: 'dummy-key', // 后端会使用配置的 API Key，这里只是占位符
        dangerouslyAllowBrowser: true,
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('API timeout')), 30000)
      );
      
      // 构建消息：如果有上下文就加上，没有就只发送用户问题
      const systemPrompt = contextString 
        ? SYSTEM_PROMPT_CHAT 
        : '你是一个智能语音助手。你可以回答用户的各种问题。如果用户询问关于录音内容的问题，请告知用户目前没有录音内容，建议先开始录音。';
      
      const userContent = contextString
        ? `上下文 (最近10分钟):\n${contextString}\n\n用户提问: ${text}`
        : text;
      
      const apiPromise = ai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      });
      
      const response = await Promise.race([apiPromise, timeoutPromise]) as any;
      
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: response.choices?.[0]?.message?.content || "无法处理该请求",
        timestamp: new Date()
      }]);
    } catch (e: any) {
      console.error('Chat API error:', e);
      const errorMessage = e?.message || e?.toString() || "Unknown error";
      setChatMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: `出错: ${errorMessage}。请检查后端服务是否正常运行，以及 LLM 配置是否正确。`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur flex items-center justify-between px-6 py-3 relative">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-muted'}`}></div>
          <h1 className="font-bold text-lg tracking-tight text-foreground">
            7×24 智能录音助手
          </h1>
        </div>
        {error && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-500/10 text-red-600 border border-red-500/20 px-4 py-1 rounded-full text-xs font-medium animate-pulse">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${processStatus.recording === 'running' ? 'bg-green-500' : 'bg-muted'}`}></span>
            <span>录音</span>
            <span className={`w-2 h-2 rounded-full ${processStatus.recognition === 'running' ? 'bg-green-500' : 'bg-muted'}`}></span>
            <span>识别</span>
          </div>
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm flex items-center gap-2"
            >
              开始录音
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/50 px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            >
              停止录音
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden">
        <div className="md:col-span-2 flex flex-col h-full overflow-hidden border-r border-border">
          <div className="h-64 p-4 shrink-0 bg-card/50 flex flex-col">
            <div className="text-xs text-muted-foreground mb-2 font-mono flex justify-between">
              <span>时间轴（绝对时间）</span>
              <span>{isRecording ? '录音中' : '空闲'}</span>
            </div>
            <div className="flex-1 min-h-0">
              <WaveformTimeline 
                analyser={analyser}
                isRecording={isRecording}
                timeline={timeline}
                audioSegments={audioSegments}
                schedules={schedules}
                onSeek={handleSeek}
                onTimelineChange={handleTimelineChange}
                onZoomChange={setTimelineZoom}
              />
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0 bg-background">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center bg-card/50 border-b border-border">
              <span>转录文本（点击文本回放）</span>
            </div>
            <TranscriptionLog 
              segments={transcripts} 
              onSegmentClick={handleSegmentClick}
              isRecording={isRecording}
            />
          </div>
        </div>
        <div className="md:col-span-1 h-full min-h-0 overflow-hidden flex flex-col border-l border-border">
          <div className="h-48 p-4 border-b border-border bg-card/50 overflow-y-auto">
            <h3 className="text-sm font-semibold text-foreground mb-2">日程列表</h3>
            <div className="space-y-2">
              {schedules.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无日程</p>
              ) : (
                schedules.map(schedule => (
                  <div key={schedule.id} className="text-xs bg-card border border-border p-2 rounded">
                    <div className="text-amber-600 font-mono">
                      {schedule.scheduleTime.toLocaleString('zh-CN')}
                    </div>
                    <div className="text-foreground mt-1">{schedule.description}</div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ChatInterface 
              messages={chatMessages} 
              onSendMessage={handleSendMessage} 
              isLoading={isChatLoading} 
            />
          </div>
        </div>
      </main>
    </div>
  );
}

