"use client";

import { useEffect, useRef, useState } from 'react';
import WaveformTimeline from './components/WaveformTimeline';
import TranscriptionLog from './components/TranscriptionLog';
import ChatInterface from './components/ChatInterface';
import ScheduleList from './components/ScheduleList';
import { useAppStore } from './store/useAppStore';
import { RecordingService } from './services/RecordingService';
import { RecognitionService } from './services/RecognitionService';
import { WebSocketRecognitionService } from './services/WebSocketRecognitionService';
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
  const websocketRecognitionServiceRef = useRef<WebSocketRecognitionService | null>(null);
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
  const [audioSource, setAudioSource] = useState<'microphone' | 'system'>('microphone');

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<number | null>(null);

  // 初始化服务
  useEffect(() => {
    const recordingService = new RecordingService(audioSource);
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

    // Web Speech API 识别服务（用于麦克风）
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
    
    // WebSocket Faster-Whisper 识别服务（用于系统音频和高质量识别）
    const websocketRecognitionService = new WebSocketRecognitionService();
    websocketRecognitionService.setCallbacks({
      onResult: handleRecognitionResult,
      onError: (err) => {
        console.error('WebSocket recognition error:', err);
        setError(err.message);
        setProcessStatus('recognition', 'error');
      },
      onStatusChange: (status) => {
        setProcessStatus('recognition', status);
      },
    });
    websocketRecognitionServiceRef.current = websocketRecognitionService;

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
      websocketRecognitionService.stop();
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      audio.pause();
    };
  }, [audioSource]);

  useEffect(() => {
    const interval = setInterval(() => {
      storeSetCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAudioSegmentReady = async (blob: Blob, startTime: Date, endTime: Date, segmentId: string, source: 'microphone' | 'system') => {
    const audioSegment: AudioSegment = {
      id: segmentId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      fileSize: blob.size,
      audioSource: source,
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
      // 最终结果：总是创建新片段（保留历史记录）
      // 检查是否与最后一个最终片段内容相同（避免重复）
      const lastFinalSegment = [...transcripts].reverse().find(t => !t.isInterim);
      if (lastFinalSegment && lastFinalSegment.rawText === text) {
        // 内容相同，可能是重复发送，跳过
        console.log('跳过重复的识别结果:', text);
        return;
      }
      
      // 如果有临时片段，先将其转为最终结果
      const lastInterimSegment = [...transcripts].reverse().find(t => t.isInterim);
      if (lastInterimSegment && lastInterimSegment.interimText === text) {
        // 临时片段内容与最终结果相同，直接转为最终结果
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

    // 无论 containsSchedule 是否为 true，都尝试提取日程
    // 因为即使 LLM 没有标记，文本中也可能包含时间信息
    if (scheduleExtractionServiceRef.current) {
      // 从最新的状态中获取 segment（因为 updateTranscript 可能还没更新 transcripts）
      const currentTranscripts = useAppStore.getState().transcripts;
      const segment = currentTranscripts.find(t => t.id === segmentId);
      if (segment) {
        console.log(`[VoiceModule] 将片段 ${segmentId} 加入日程提取队列，文本: ${optimizedText.substring(0, 50)}...`);
        scheduleExtractionServiceRef.current.enqueue({
          ...segment,
          optimizedText,
          isOptimized: true,
          containsSchedule,
        });
      } else {
        console.warn(`[VoiceModule] 未找到片段 ${segmentId}，无法提取日程`);
      }
    } else {
      console.warn(`[VoiceModule] scheduleExtractionServiceRef.current 为空，无法提取日程`);
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
    console.log(`[VoiceModule] 收到提取的日程: ${schedule.description} (时间: ${schedule.scheduleTime.toLocaleString()})`);
    addSchedule(schedule);
    console.log(`[VoiceModule] 日程已添加到状态，当前日程数: ${useAppStore.getState().schedules.length}`);
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
        // 更新音频源
        recordingServiceRef.current.setAudioSource(audioSource);
        
        // 如果是系统音频，提示用户
        if (audioSource === 'system') {
          // 浏览器会自动弹出选择窗口，这里可以添加提示
          console.log('请在弹出的窗口中选择要共享的标签页（包含音频）');
        }
        
        await recordingServiceRef.current.start();
        setProcessStatus('recording', 'running');
      }
      // 根据音频源选择识别服务
      if (audioSource === 'microphone') {
        // 麦克风：使用 Web Speech API（快速、免费）
        if (recognitionServiceRef.current) {
          setTimeout(() => {
            recognitionServiceRef.current?.start();
          }, 500);
        }
      } else if (audioSource === 'system') {
        // 系统音频：使用 WebSocket Faster-Whisper（支持系统音频，更准确）
        // 等待录音服务完全启动后再获取流
        setTimeout(() => {
          if (recordingServiceRef.current && websocketRecognitionServiceRef.current) {
            const stream = recordingServiceRef.current.getStream();
            if (stream) {
              console.log('启动 WebSocket Faster-Whisper 识别...');
              websocketRecognitionServiceRef.current.start(stream);
            } else {
              console.warn('无法获取音频流，WebSocket 识别未启动');
              setError('无法获取音频流，请重试');
            }
          }
        }, 1000); // 等待录音服务完全启动
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      console.error('Recording error:', error);
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
    if (websocketRecognitionServiceRef.current) {
      websocketRecognitionServiceRef.current.stop();
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
    
    // 创建助手消息占位符
    const assistantMsgId = (Date.now() + 1).toString();
    setChatMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'model',
      text: '',
      timestamp: new Date()
    }]);
    
    try {
      // 获取最近 10 分钟的转录内容作为上下文（可选）
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const contextSegments = transcripts.filter(t => t.timestamp > tenMinutesAgo);
      const contextString = contextSegments
        .map(t => `[${t.timestamp.toLocaleTimeString()}] ${t.optimizedText || t.rawText}`)
        .join('\n');
      
      // 使用 Next.js 代理路径（会自动代理到后端 localhost:8000）
      let apiUrl: string;
      if (typeof window !== 'undefined' && window.location) {
        const origin = window.location.origin;
        if (!origin || origin === 'null' || origin === 'undefined') {
          apiUrl = 'http://localhost:3000/api/deepseek/chat/completions';
        } else {
          apiUrl = `${origin}/api/deepseek/chat/completions`;
        }
      } else {
        apiUrl = 'http://localhost:8000/api/deepseek/chat/completions';
      }
      
      // 构建消息：如果有上下文就加上，没有就只发送用户问题
      const systemPrompt = contextString 
        ? SYSTEM_PROMPT_CHAT 
        : '你是一个智能语音助手。你可以回答用户的各种问题。如果用户询问关于录音内容的问题，请告知用户目前没有录音内容，建议先开始录音。';
      
      const userContent = contextString
        ? `上下文 (最近10分钟):\n${contextString}\n\n用户提问: ${text}`
        : text;
      
      // 使用流式 API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0.7,
          stream: true,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // 读取流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      
      if (!reader) {
        throw new Error('无法读取响应流');
      }
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            
            try {
              const chunk = JSON.parse(data);
              if (chunk.choices && chunk.choices[0]?.delta?.content) {
                const content = chunk.choices[0].delta.content;
                fullText += content;
                
                // 实时更新消息内容
                setChatMessages(prev => prev.map(msg => 
                  msg.id === assistantMsgId 
                    ? { ...msg, text: fullText }
                    : msg
                ));
              }
            } catch (e) {
              console.error('解析流式数据失败:', e, data);
            }
          }
        }
      }
      
    } catch (e: any) {
      console.error('Chat API error:', e);
      const errorMessage = e?.message || e?.toString() || "Unknown error";
      setChatMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId 
          ? { ...msg, text: `出错: ${errorMessage}。请检查后端服务是否正常运行，以及 LLM 配置是否正确。` }
          : msg
      ));
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
          <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 rounded-full text-xs font-medium ${
            error.includes('系统音频模式') 
              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' 
              : 'bg-red-500/10 text-red-600 border border-red-500/20 animate-pulse'
          }`}>
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
          {!isRecording && (
            <select
              value={audioSource}
              onChange={(e) => setAudioSource(e.target.value as 'microphone' | 'system')}
              className="bg-background border border-input text-foreground text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
              title="选择音频来源"
            >
              <option value="microphone">🎤 麦克风（Web Speech API）</option>
              <option value="system">🔊 系统音频（Faster-Whisper 实时识别）</option>
            </select>
          )}
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
          <div className="h-72 p-4 shrink-0 bg-card/50 flex flex-col">
            <div className="text-sm text-foreground mb-3 font-semibold flex justify-between items-center">
              <span>时间轴（绝对时间）</span>
              <span className={`text-xs px-2 py-1 rounded-full ${
                isRecording 
                  ? 'bg-red-500/10 text-red-600 border border-red-500/20' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                {isRecording ? '● 录音中' : '○ 空闲'}
              </span>
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
            <h3 className="text-sm font-semibold text-foreground mb-3">日程列表</h3>
            <ScheduleList schedules={schedules} />
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

