import { create } from 'zustand';
import { TranscriptSegment, ScheduleItem, AudioSegment, TimelineState, ProcessStatus } from '../types';

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
  audioSegments: [],

  processStatus: {
    recording: 'idle',
    recognition: 'idle',
    optimization: 'idle',
    scheduleExtraction: 'idle',
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
    set(state => ({
      transcripts: [...state.transcripts, segment],
    }));
  },

  updateTranscript: (id: string, updates: Partial<TranscriptSegment>) => {
    set(state => ({
      transcripts: state.transcripts.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },

  addSchedule: (schedule: ScheduleItem) => {
    set(state => ({
      schedules: [...state.schedules, schedule],
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
    set(state => ({
      processStatus: {
        ...state.processStatus,
        [process]: status,
      },
    }));
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
      audioSegments: [],
      isRecording: false,
      recordingStartTime: null,
    });
  },
}));

