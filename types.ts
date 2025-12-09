
export enum ClipType {
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT',
}

export interface MediaAsset {
  id: string;
  file: File;
  url: string; // Blob URL
  type: 'video' | 'audio' | 'image';
  duration: number; // In seconds
  thumbnail?: string;
  name: string;
}

export interface Transform {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number; // 1 = 100%
  rotation: number; // degrees
  opacity: number; // 0-1
}

export interface TextData {
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  align: 'left' | 'center' | 'right';
}

export interface Transition {
  inDuration: number; // seconds
  outDuration: number; // seconds
  type: 'fade' | 'slide' | 'zoom'; // simple CSS simulated transitions
}

export interface Clip {
  id: string;
  assetId?: string; // Optional for text layers
  trackId: number;
  type: ClipType;
  
  // Temporal properties
  timelineStart: number; // Where it starts on the timeline (seconds)
  inPoint: number; // Trim start (seconds into the source)
  duration: number; // Playback duration (seconds)
  
  // Visual properties
  transform: Transform;
  zIndex: number;
  label?: string;

  // Feature specific
  textData?: TextData;
  transition?: Transition;
  volume?: number; // 0-1 for Audio/Video
}

export interface Track {
  id: number;
  type: 'video' | 'audio' | 'overlay';
  name: string;
  isMuted: boolean;
  isHidden: boolean;
}

export interface CanvasSize {
  width: number;
  height: number;
  name: string;
}

export interface TimelineState {
  assets: Record<string, MediaAsset>;
  tracks: Track[];
  clips: Record<string, Clip>;
  duration: number; // Total timeline duration
  currentTime: number; // Playhead position
  isPlaying: boolean;
  selectedClipId: string | null;
  zoom: number; // Pixels per second
  canvasSize: CanvasSize;
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

export const DEFAULT_TEXT_DATA: TextData = {
  content: 'Double Click to Edit',
  fontSize: 40,
  fontFamily: 'Inter',
  color: '#ffffff',
  backgroundColor: 'transparent',
  align: 'center',
};

// --- Integration Types ---

export interface ThemeConfig {
    primaryColor?: string; // Hex
    backgroundColor?: string; // Hex
    panelBackgroundColor?: string; // Hex
    textColor?: string;
}

export interface EditorProps {
    initialCanvasSize?: CanvasSize;
    initialClips?: string[]; // Array of Video URLs to auto-insert
    onExport?: (blob: Blob) => void;
    config?: {
        theme?: ThemeConfig;
        maxDuration?: number;
    };
}
