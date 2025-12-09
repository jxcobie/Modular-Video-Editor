/// <reference lib="dom" />
import React, { useState, useRef, useEffect } from 'react';
import { Clip, ClipType } from '../../types';
import { useTimeline } from '../../services/timelineStore';
import { TRACK_HEIGHT, RULER_HEIGHT } from '../../constants';

interface ClipItemProps {
    clip: Clip;
    timelineRect?: DOMRect;
    scrollLeft: number;
}

export const ClipItem: React.FC<ClipItemProps> = ({ clip, timelineRect, scrollLeft }) => {
  const { state, dispatch } = useTimeline();
  const isSelected = state.selectedClipId === clip.id;
  
  // Find track index for vertical positioning
  const trackIndex = state.tracks.findIndex(t => t.id === clip.trackId);
  const trackTop = trackIndex * TRACK_HEIGHT;

  const dragModeRef = useRef<'MOVE' | 'TRIM_START' | 'TRIM_END' | null>(null);
  const startXRef = useRef<number>(0);
  const initialValuesRef = useRef<{ start: number; duration: number; inPoint: number; trackId: number }>({ start: 0, duration: 0, inPoint: 0, trackId: 0 });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragModeUI, setDragModeUI] = useState<'MOVE' | 'TRIM_START' | 'TRIM_END' | null>(null);

  const handleMouseDown = (e: React.MouseEvent, mode: 'MOVE' | 'TRIM_START' | 'TRIM_END') => {
    e.stopPropagation();
    e.preventDefault();
    
    dispatch({ type: 'SELECT_CLIP', payload: clip.id });

    dragModeRef.current = mode;
    startXRef.current = e.clientX;
    initialValuesRef.current = {
      start: clip.timelineStart,
      duration: clip.duration,
      inPoint: clip.inPoint,
      trackId: clip.trackId
    };

    setIsDragging(true);
    setDragModeUI(mode);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const mode = dragModeRef.current;
    if (!mode) return;
    
    const deltaX = (e as any).clientX - startXRef.current;
    const deltaSec = deltaX / state.zoom;
    const { start, duration, inPoint, trackId } = initialValuesRef.current;
    
    // Determine Max Duration (if asset based)
    let maxDuration = duration;
    if (clip.assetId) {
        const asset = state.assets[clip.assetId];
        maxDuration = asset ? asset.duration : duration;
    } else {
        // Text layers etc have infinite max duration technically
        maxDuration = 3600; 
    }

    let changes: Partial<Clip> = {};

    if (mode === 'MOVE') {
      let newTrackId = trackId;
      if (timelineRect) {
          const currentY = (e as any).clientY;
          const relativeY = currentY - timelineRect.top - RULER_HEIGHT;
          const targetTrackIndex = Math.floor(relativeY / TRACK_HEIGHT);
          
          if (targetTrackIndex >= 0 && targetTrackIndex < state.tracks.length) {
              newTrackId = state.tracks[targetTrackIndex].id;
          }
      }

      let proposedStart = Math.max(0, start + deltaSec);
      let proposedEnd = proposedStart + duration;

      const otherClips = Object.values(state.clips).filter(c => 
          c.trackId === newTrackId && c.id !== clip.id
      ).sort((a, b) => a.timelineStart - b.timelineStart);

      let validStart = proposedStart;
      
      for (const other of otherClips) {
          const otherEnd = other.timelineStart + other.duration;
          const isOverlapping = (proposedStart < otherEnd) && (proposedEnd > other.timelineStart);

          if (isOverlapping) {
              if (start < other.timelineStart) {
                  validStart = Math.min(validStart, other.timelineStart - duration);
              } else {
                  validStart = Math.max(validStart, otherEnd);
              }
          }
      }
      changes = { timelineStart: validStart, trackId: newTrackId, zIndex: newTrackId };
    } 
    else if (mode === 'TRIM_START') {
        let proposedInPoint = inPoint + deltaSec;
        let proposedDuration = duration - deltaSec;
        
        if (proposedInPoint < 0) {
            proposedInPoint = 0;
            proposedDuration = duration + inPoint;
        }
        if (proposedDuration < 0.1) {
            proposedDuration = 0.1;
            proposedInPoint = inPoint + (duration - 0.1);
        }

        let proposedStart = start + (proposedInPoint - inPoint);
        
        const otherClips = Object.values(state.clips).filter(c => c.trackId === clip.trackId && c.id !== clip.id);
        const prevClip = otherClips
            .filter(c => c.timelineStart + c.duration <= start)
            .sort((a, b) => b.timelineStart - a.timelineStart)[0];
            
        if (prevClip) {
            const prevEnd = prevClip.timelineStart + prevClip.duration;
            if (proposedStart < prevEnd) {
                const diff = prevEnd - proposedStart;
                proposedStart = prevEnd;
                proposedInPoint += diff;
                proposedDuration -= diff;
            }
        }
        
        if (proposedStart < 0) {
            const diff = 0 - proposedStart;
            proposedStart = 0;
            proposedInPoint += diff;
            proposedDuration -= diff;
        }

        changes = { inPoint: proposedInPoint, duration: proposedDuration, timelineStart: proposedStart };
    } 
    else if (mode === 'TRIM_END') {
        let proposedDuration = duration + deltaSec;
        
        if (inPoint + proposedDuration > maxDuration) {
            proposedDuration = maxDuration - inPoint;
        }
        if (proposedDuration < 0.1) proposedDuration = 0.1;

        const otherClips = Object.values(state.clips).filter(c => c.trackId === clip.trackId && c.id !== clip.id);
        const nextClip = otherClips
            .filter(c => c.timelineStart >= start + duration)
            .sort((a, b) => a.timelineStart - b.timelineStart)[0];
            
        if (nextClip) {
            if (start + proposedDuration > nextClip.timelineStart) {
                proposedDuration = nextClip.timelineStart - start;
            }
        }
        changes = { duration: proposedDuration };
    }

    dispatch({ type: 'UPDATE_CLIP', payload: { id: clip.id, changes }});
  };

  const handleMouseUp = () => {
    dragModeRef.current = null;
    setIsDragging(false);
    setDragModeUI(null);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
  }, []);

  // Styles based on Clip Type
  let baseClasses = '';
  let borderClasses = '';
  
  switch(clip.type) {
      case ClipType.AUDIO:
          baseClasses = 'bg-emerald-900/90';
          borderClasses = 'border-emerald-500';
          break;
      case ClipType.TEXT:
          baseClasses = 'bg-purple-900/90';
          borderClasses = 'border-purple-500';
          break;
      case ClipType.IMAGE:
          baseClasses = 'bg-indigo-900/90';
          borderClasses = 'border-indigo-500';
          break;
      default:
          baseClasses = 'bg-cyan-900/90';
          borderClasses = 'border-cyan-500';
  }

  return (
    <div
      className={`absolute rounded-md overflow-hidden select-none transition-colors group pointer-events-auto border
        ${isSelected ? 'z-20 ring-2 ring-yellow-400' : 'z-10 hover:ring-1 hover:ring-white/50'}
        ${baseClasses} ${borderClasses}
      `}
      style={{
        left: `${clip.timelineStart * state.zoom}px`,
        width: `${clip.duration * state.zoom}px`,
        top: `${trackTop + (TRACK_HEIGHT * 0.1)}px`, 
        height: `${TRACK_HEIGHT * 0.8}px`,
        cursor: isDragging && dragModeUI === 'MOVE' ? 'grabbing' : 'grab'
      }}
      onMouseDown={(e) => handleMouseDown(e, 'MOVE')}
    >
      {/* Left Trim Handle */}
      <div 
        className={`absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center bg-black/20 hover:bg-yellow-500/50 z-30
            ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
        onMouseDown={(e) => handleMouseDown(e, 'TRIM_START')}
      >
        <div className="w-px h-4 bg-white/50"></div>
      </div>

      {/* Content */}
      <div className="px-3 py-1 text-[10px] text-white/90 truncate font-medium pointer-events-none relative z-10 flex items-center h-full gap-2">
        <span>
            {clip.type === ClipType.VIDEO && '🎬'}
            {clip.type === ClipType.AUDIO && '🎵'}
            {clip.type === ClipType.TEXT && 'T'}
            {clip.type === ClipType.IMAGE && '🖼️'}
        </span>
        {clip.label}
        {clip.transition?.inDuration ? <span className="text-[8px] opacity-50 px-1 border border-white/20 rounded">Fade In</span> : null}
      </div>
      
      {/* Waveform / Visual Simulation */}
      {clip.type === ClipType.AUDIO && (
          <div className="absolute inset-0 flex items-center opacity-30 pointer-events-none overflow-hidden">
               <div className="flex gap-0.5 h-1/2 w-full items-center">
                   {Array.from({length: 50}).map((_, i) => (
                       <div key={i} className="flex-1 bg-emerald-300" style={{ height: `${Math.random() * 100}%`}}></div>
                   ))}
               </div>
          </div>
      )}

      {/* Right Trim Handle */}
      <div 
        className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center bg-black/20 hover:bg-yellow-500/50 z-30
            ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
        onMouseDown={(e) => handleMouseDown(e, 'TRIM_END')}
      >
        <div className="w-px h-4 bg-white/50"></div>
      </div>
    </div>
  );
};
