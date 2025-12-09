
/// <reference lib="dom" />
import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { TimelineState, Clip, MediaAsset, Track, DEFAULT_TRANSFORM, ClipType, CanvasSize, DEFAULT_TEXT_DATA, EditorProps } from '../types';
import { DEFAULT_DURATION } from '../constants';

// --- Actions ---
type Action =
  | { type: 'ADD_ASSET'; payload: MediaAsset }
  | { type: 'ADD_CLIP'; payload: Clip }
  | { type: 'ADD_CLIP_SMART'; payload: { assetId?: string; trackId: number; duration: number; type: ClipType; name: string; textData?: any } }
  | { type: 'UPDATE_CLIP'; payload: { id: string; changes: Partial<Clip> } }
  | { type: 'REMOVE_CLIP'; payload: string }
  | { type: 'SET_PLAYHEAD'; payload: number }
  | { type: 'TOGGLE_PLAYBACK' }
  | { type: 'SELECT_CLIP'; payload: string | null }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'UPDATE_TRACK'; payload: { id: number; changes: Partial<Track> } }
  | { type: 'SET_CANVAS_SIZE'; payload: CanvasSize };

// --- Initial State Factory ---
const createInitialState = (props?: EditorProps): TimelineState => ({
  assets: {},
  tracks: [
    { id: 3, type: 'overlay', name: 'Text/FX', isMuted: false, isHidden: false },
    { id: 2, type: 'video', name: 'Layer 3', isMuted: false, isHidden: false },
    { id: 1, type: 'video', name: 'Layer 2', isMuted: false, isHidden: false },
    { id: 0, type: 'video', name: 'Layer 1', isMuted: false, isHidden: false },
    { id: -1, type: 'audio', name: 'Audio 1', isMuted: false, isHidden: false },
  ],
  clips: {},
  duration: DEFAULT_DURATION,
  currentTime: 0,
  isPlaying: false,
  selectedClipId: null,
  zoom: 50,
  canvasSize: props?.initialCanvasSize || { width: 1920, height: 1080, name: '1080p' },
});

// --- Helper: Gap Finder ---
const findNextFreeSlot = (clips: Record<string, Clip>, trackId: number, duration: number, preferredStart: number): number => {
    const trackClips = Object.values(clips)
        .filter(c => c.trackId === trackId)
        .sort((a, b) => a.timelineStart - b.timelineStart);

    let proposedStart = preferredStart;
    
    for (const clip of trackClips) {
        const clipEnd = clip.timelineStart + clip.duration;
        const newEnd = proposedStart + duration;
        
        if (clip.timelineStart < newEnd && clipEnd > proposedStart) {
            proposedStart = clipEnd;
        }
    }
    return proposedStart;
};

// --- Reducer ---
function timelineReducer(state: TimelineState, action: Action): TimelineState {
  switch (action.type) {
    case 'ADD_ASSET':
      return {
        ...state,
        assets: { ...state.assets, [action.payload.id]: action.payload },
      };
    case 'ADD_CLIP':
      return {
        ...state,
        clips: { ...state.clips, [action.payload.id]: action.payload },
        duration: Math.max(state.duration, action.payload.timelineStart + action.payload.duration + 5),
        selectedClipId: action.payload.id,
      };
    case 'ADD_CLIP_SMART': {
        const { assetId, trackId, duration, type, name, textData } = action.payload;
        
        const timelineStart = findNextFreeSlot(state.clips, trackId, duration, state.currentTime);
        
        const clipId = Math.random().toString(36).substring(7);
        const newClip: Clip = {
            id: clipId,
            assetId,
            trackId,
            type,
            timelineStart,
            inPoint: 0,
            duration,
            transform: DEFAULT_TRANSFORM,
            zIndex: trackId,
            label: name,
            textData: type === ClipType.TEXT ? textData : undefined,
            volume: 1,
            transition: { inDuration: 0, outDuration: 0, type: 'fade' }
        };

        return {
            ...state,
            clips: { ...state.clips, [clipId]: newClip },
            duration: Math.max(state.duration, timelineStart + duration + 5),
            selectedClipId: clipId,
        };
    }
    case 'UPDATE_CLIP': {
      const clip = state.clips[action.payload.id];
      if (!clip) return state;
      const updatedClip = { ...clip, ...action.payload.changes };
      return {
        ...state,
        clips: { ...state.clips, [action.payload.id]: updatedClip },
        duration: Math.max(state.duration, updatedClip.timelineStart + updatedClip.duration + 5),
      };
    }
    case 'REMOVE_CLIP': {
      const newClips = { ...state.clips };
      delete newClips[action.payload];
      return { ...state, clips: newClips, selectedClipId: null };
    }
    case 'SET_PLAYHEAD':
      return { ...state, currentTime: Math.max(0, action.payload) };
    case 'TOGGLE_PLAYBACK':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SELECT_CLIP':
      return { ...state, selectedClipId: action.payload };
    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(10, Math.min(200, action.payload)) };
    case 'UPDATE_TRACK':
        return {
            ...state,
            tracks: state.tracks.map(t => t.id === action.payload.id ? { ...t, ...action.payload.changes } : t)
        };
    case 'SET_CANVAS_SIZE':
        return { ...state, canvasSize: action.payload };
    default:
      return state;
  }
}

// --- Context ---
const TimelineContext = createContext<{
  state: TimelineState;
  dispatch: React.Dispatch<Action>;
  api: {
    addAsset: (file: File) => Promise<string>;
    addClipToTimeline: (assetId: string, trackId: number, time: number) => void;
    addVideoClip: (url: string, name?: string) => Promise<string>;
    addImageClip: (url: string, name?: string, duration?: number) => Promise<string>;
    addTextClip: (content: string) => void;
  };
} | null>(null);

// --- Helpers ---
const getMediaMetadata = (source: File | string): Promise<{ duration: number; type: 'video' | 'audio' | 'image' }> => {
  return new Promise((resolve) => {
    let url: string;
    let typePrefix: string;

    if (source instanceof File) {
        url = URL.createObjectURL(source);
        typePrefix = source.type;
    } else {
        url = source;
        const ext = source.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
            typePrefix = 'image';
        } else if (['mp3', 'wav', 'aac'].includes(ext || '')) {
            typePrefix = 'audio';
        } else {
            typePrefix = 'video';
        }
    }

    if (typePrefix.startsWith('image')) {
      const img = new Image();
      img.onload = () => resolve({ duration: 5, type: 'image' });
      img.onerror = () => resolve({ duration: 5, type: 'image' });
      img.src = url;
      return;
    }

    const element = typePrefix.startsWith('audio') ? document.createElement('audio') : document.createElement('video');
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      resolve({
        duration: element.duration,
        type: typePrefix.startsWith('audio') ? 'audio' : 'video'
      });
      element.remove(); 
    };
    element.onerror = () => {
       // Fallback for audio files that might not trigger video error correctly
       if (typePrefix.startsWith('audio')) {
           resolve({ duration: 10, type: 'audio' });
       } else {
           resolve({ duration: 10, type: 'video' });
       }
    };
    element.crossOrigin = "anonymous";
    element.src = url;
  });
};

export const TimelineProvider: React.FC<{ children: React.ReactNode; initialProps?: EditorProps }> = ({ children, initialProps }) => {
  const [state, dispatch] = useReducer(timelineReducer, createInitialState(initialProps));
  const initializedRef = useRef(false);

  // --- Programmatic API Implementation ---
  const addAsset = useCallback(async (file: File) => {
    const id = Math.random().toString(36).substring(7);
    const metadata = await getMediaMetadata(file);

    const asset: MediaAsset = {
      id,
      file,
      url: URL.createObjectURL(file),
      type: metadata.type,
      duration: metadata.duration,
      name: file.name,
    };

    dispatch({ type: 'ADD_ASSET', payload: asset });
    return id;
  }, []);

  const addClipToTimeline = useCallback((assetId: string, trackId: number, time: number) => {
    const asset = state.assets[assetId];
    if (!asset) return;

    const clipId = Math.random().toString(36).substring(7);
    const newClip: Clip = {
      id: clipId,
      assetId,
      trackId,
      type: asset.type === 'video' ? ClipType.VIDEO : asset.type === 'audio' ? ClipType.AUDIO : ClipType.IMAGE,
      timelineStart: time,
      inPoint: 0,
      duration: asset.duration,
      transform: DEFAULT_TRANSFORM,
      zIndex: trackId,
      label: asset.name,
      volume: 1,
      transition: { inDuration: 0, outDuration: 0, type: 'fade' }
    };

    dispatch({ type: 'ADD_CLIP', payload: newClip });
  }, [state.assets]);

  const addVideoClip = useCallback(async (url: string, name: string = "Video Clip") => {
    const id = Math.random().toString(36).substring(7);
    const metadata = await getMediaMetadata(url);

    const asset: MediaAsset = {
        id,
        file: new File([], name),
        url,
        type: 'video',
        duration: metadata.duration,
        name
    };
    dispatch({ type: 'ADD_ASSET', payload: asset });

    dispatch({ 
        type: 'ADD_CLIP_SMART', 
        payload: {
            assetId: id,
            trackId: 1,
            duration: metadata.duration,
            type: ClipType.VIDEO,
            name
        }
    });
    return id;
  }, []);

  const addImageClip = useCallback(async (url: string, name: string = "Image Clip", duration: number = 5) => {
    const id = Math.random().toString(36).substring(7);
    
    const asset: MediaAsset = {
        id,
        file: new File([], name),
        url,
        type: 'image',
        duration: duration,
        name
    };
    dispatch({ type: 'ADD_ASSET', payload: asset });

    dispatch({ 
        type: 'ADD_CLIP_SMART', 
        payload: {
            assetId: id,
            trackId: 2,
            duration: duration,
            type: ClipType.IMAGE,
            name
        }
    });
    return id;
  }, []);

  const addTextClip = useCallback((content: string) => {
      dispatch({
          type: 'ADD_CLIP_SMART',
          payload: {
              trackId: 3, // Top layer
              duration: 5,
              type: ClipType.TEXT,
              name: 'Text Layer',
              textData: { ...DEFAULT_TEXT_DATA, content }
          }
      });
  }, []);

  // Handle Initial Clips Injection
  useEffect(() => {
    if (initializedRef.current || !initialProps?.initialClips || initialProps.initialClips.length === 0) return;
    
    const loadInitialClips = async () => {
        // Sequentially load clips to ensure correct order
        for (let i = 0; i < initialProps.initialClips!.length; i++) {
            const url = initialProps.initialClips![i];
            const name = `Clip ${i + 1}`;
            await addVideoClip(url, name);
        }
    };

    loadInitialClips();
    initializedRef.current = true;
  }, [initialProps?.initialClips, addVideoClip]);

  return (
    <TimelineContext.Provider value={{ state, dispatch, api: { addAsset, addClipToTimeline, addVideoClip, addImageClip, addTextClip } }}>
      {children}
    </TimelineContext.Provider>
  );
};

export const useTimeline = () => {
  const context = useContext(TimelineContext);
  if (!context) throw new Error("useTimeline must be used within TimelineProvider");
  return context;
};
