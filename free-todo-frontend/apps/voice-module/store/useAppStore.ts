import { create } from 'zustand';
import { TranscriptSegment, ScheduleItem, AudioSegment, TimelineState, ProcessStatus } from '../types';
import type { ExtractedTodo } from '../services/TodoExtractionService';

interface AppState {
  // 录音状态
  isRecording: boolean;
  recordingStartTime: Date | null;
  currentTime: Date;

  // 时间轴状态
  timeline: TimelineState;

  // 数据
  transcripts: TranscriptSegment[];
  schedules: ScheduleItem[];
  extractedTodos: ExtractedTodo[];  // ⚡ 提取的待办事项
  audioSegments: AudioSegment[];

  // 进程状态
  processStatus: ProcessStatus;

  // Actions
  startRecording: () => void;
  stopRecording: () => void;
  setCurrentTime: (time: Date) => void;
  setTimelineView: (startTime: Date, duration: number) => void;
  setTimelineZoom: (zoomLevel: number) => void;
  addTranscript: (segment: TranscriptSegment) => void;
  updateTranscript: (id: string, updates: Partial<TranscriptSegment>) => void;
  addSchedule: (schedule: ScheduleItem) => void;
  addExtractedTodo: (todo: ExtractedTodo) => void;  // ⚡ 添加提取的待办
  removeExtractedTodo: (todoId: string) => void;  // ⚡ 移除提取的待办
  removeSchedule: (scheduleId: string) => void;  // ⚡ 移除日程
  addAudioSegment: (segment: AudioSegment) => void;
  updateAudioSegment: (id: string, updates: Partial<AudioSegment>) => void;
  setProcessStatus: (process: keyof ProcessStatus, status: ProcessStatus[keyof ProcessStatus]) => void;
  loadHistory: (startTime: Date, endTime: Date) => Promise<void>;
  clearData: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  isRecording: false,
  recordingStartTime: null,
  currentTime: new Date(),

  timeline: {
    viewStartTime: new Date(Date.now() - 30 * 60 * 1000), // 默认显示最近30分钟
    viewDuration: 60 * 60 * 1000, // 1小时
    zoomLevel: 1,
    currentTime: new Date(),
  },

  transcripts: [],
  schedules: [],
  extractedTodos: [],  // ⚡ 提取的待办事项
  audioSegments: [],

  processStatus: {
    recording: 'idle',
    recognition: 'idle',
    optimization: 'idle',
    scheduleExtraction: 'idle',
    todoExtraction: 'idle',
    persistence: 'idle',
  },

  // Actions
  startRecording: () => {
    set({
      isRecording: true,
      recordingStartTime: new Date(),
      currentTime: new Date(),
    });
  },

  stopRecording: () => {
    set({
      isRecording: false,
    });
  },

  setCurrentTime: (time: Date) => {
    set({ currentTime: time });
  },

  setTimelineView: (startTime: Date, duration: number) => {
    set(state => ({
      timeline: {
        ...state.timeline,
        viewStartTime: startTime,
        viewDuration: duration,
      },
    }));
  },

  setTimelineZoom: (zoomLevel: number) => {
    const durations = [
      60 * 60 * 1000,      // 1小时
      6 * 60 * 60 * 1000,  // 6小时
      24 * 60 * 60 * 1000, // 24小时
    ];
    
    const duration = durations[zoomLevel - 1] || durations[0];
    const state = get();
    const centerTime = new Date(
      state.timeline.viewStartTime.getTime() + state.timeline.viewDuration / 2
    );
    
    set({
      timeline: {
        ...state.timeline,
        viewStartTime: new Date(centerTime.getTime() - duration / 2),
        viewDuration: duration,
        zoomLevel,
      },
    });
  },

  addTranscript: (segment: TranscriptSegment) => {
    set(state => {
      // 检查是否已存在相同 id 的 segment，避免重复添加
      const existingIndex = state.transcripts.findIndex(t => t.id === segment.id);
      if (existingIndex >= 0) {
        // 如果已存在，更新而不是添加
        return {
          transcripts: state.transcripts.map((t, index) => 
            index === existingIndex ? { ...t, ...segment } : t
          ),
        };
      }
      return {
        transcripts: [...state.transcripts, segment],
      };
    });
  },

  updateTranscript: (id: string, updates: Partial<TranscriptSegment>) => {
    set(state => ({
      transcripts: state.transcripts.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },

  addSchedule: (schedule: ScheduleItem) => {
    set(state => {
      // 检查是否已存在相同 id 的 schedule，避免重复添加
      const existingIndex = state.schedules.findIndex(s => s.id === schedule.id);
      if (existingIndex >= 0) {
        // 如果已存在，更新而不是添加
        return {
          schedules: state.schedules.map((s, index) => 
            index === existingIndex ? { ...s, ...schedule } : s
          ),
        };
      }
      return {
        schedules: [...state.schedules, schedule],
      };
    });
  },

  addExtractedTodo: (todo: ExtractedTodo) => {
    set(state => {
      // 检查是否已存在相同 id 的 todo，避免重复添加
      const existingIndex = state.extractedTodos.findIndex(t => t.id === todo.id);
      if (existingIndex >= 0) {
        // 如果已存在，更新而不是添加
        return {
          extractedTodos: state.extractedTodos.map((t, index) => 
            index === existingIndex ? { ...t, ...todo } : t
          ),
        };
      }
      return {
        extractedTodos: [...state.extractedTodos, todo],
      };
    });
  },

  removeExtractedTodo: (todoId: string) => {
    set(state => ({
      extractedTodos: state.extractedTodos.filter(t => t.id !== todoId),
    }));
  },

  removeSchedule: (scheduleId: string) => {
    set(state => ({
      schedules: state.schedules.filter(s => s.id !== scheduleId),
    }));
  },

  addAudioSegment: (segment: AudioSegment) => {
    set(state => ({
      audioSegments: [...state.audioSegments, segment],
    }));
  },

  updateAudioSegment: (id: string, updates: Partial<AudioSegment>) => {
    set(state => ({
      audioSegments: state.audioSegments.map(s =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }));
  },

  setProcessStatus: (process: keyof ProcessStatus, status: ProcessStatus[keyof ProcessStatus]) => {
    set(state => {
      // 避免无限循环：只有当状态真正改变时才更新
      if (state.processStatus[process] === status) {
        return state;
      }
      return {
        processStatus: {
          ...state.processStatus,
          [process]: status,
        },
      };
    });
  },

  loadHistory: async (startTime: Date, endTime: Date) => {
    // 这个函数会在组件中调用 PersistenceService 来加载数据
    // 这里只是占位，实际加载逻辑在组件中
    console.log('Loading history:', startTime, endTime);
  },

  clearData: () => {
    set({
      transcripts: [],
      schedules: [],
      extractedTodos: [],  // ⚡ 清空提取的待办
      audioSegments: [],
      isRecording: false,
      recordingStartTime: null,
    });
  },
}));

