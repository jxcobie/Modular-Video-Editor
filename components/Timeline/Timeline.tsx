/// <reference lib="dom" />
import React, { useRef, useState, useEffect } from 'react';
import { useTimeline } from '../../services/timelineStore';
import { TRACK_HEIGHT, RULER_HEIGHT, HEADER_HEIGHT } from '../../constants';
import { Track } from './Track';
import { ClipItem } from './ClipItem';

export const Timeline: React.FC = () => {
  const { state, dispatch, api } = useTimeline();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard Event Listener for Deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Only trigger if a clip is selected and we aren't editing an input field
        if (state.selectedClipId && ((e as any).key === 'Delete' || (e as any).key === 'Backspace')) {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            dispatch({ type: 'REMOVE_CLIP', payload: state.selectedClipId });
        }
    };

    (window as any).addEventListener('keydown', handleKeyDown);
    return () => (window as any).removeEventListener('keydown', handleKeyDown);
  }, [state.selectedClipId, dispatch]);

  const handleSeek = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const time = (x + scrollLeft) / state.zoom;
    dispatch({ type: 'SET_PLAYHEAD', payload: time });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.dataTransfer as any).dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const assetId = (e.dataTransfer as any).getData('assetId');
      if (!assetId || !scrollContainerRef.current) return;

      const rect = scrollContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      
      const time = Math.max(0, (x + scrollLeft) / state.zoom);
      
      // Determine track based on Y position relative to content area
      // Y needs to be offset by RULER_HEIGHT
      const relativeY = y - RULER_HEIGHT;
      // Tracks are rendered in reverse id order in the array usually, but let's look at how we map them.
      // We map state.tracks. So index 0 is top, 1 is below...
      const trackIndex = Math.floor(relativeY / TRACK_HEIGHT);
      
      const track = state.tracks[trackIndex];
      
      if (track) {
          api.addClipToTimeline(assetId, track.id, time);
      }
  };

  return (
    <div className="h-72 bg-lumina-900 border-t border-lumina-700 flex flex-col select-none relative z-10">
      {/* Toolbar */}
      <div className="h-10 bg-lumina-800 border-b border-lumina-700 flex items-center px-4 justify-between flex-shrink-0">
         <div className="flex gap-2">
             <span className="text-xs text-gray-500 font-mono">{formatTime(state.currentTime)}</span>
         </div>
         <div className="flex gap-2">
             <button 
                onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom - 10 })}
                className="text-xs px-2 py-1 bg-lumina-700 rounded hover:bg-lumina-600"
             >-</button>
             <input 
                type="range" min="10" max="200" value={state.zoom} 
                onChange={(e) => dispatch({ type: 'SET_ZOOM', payload: Number((e.target as any).value) })}
                className="w-24 accent-lumina-500"
             />
             <button 
                onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom + 10 })}
                className="text-xs px-2 py-1 bg-lumina-700 rounded hover:bg-lumina-600"
             >+</button>
         </div>
      </div>

      {/* Tracks Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div 
            ref={containerRef}
            className="relative min-w-full"
            style={{ width: `${state.duration * state.zoom}px`, minWidth: '100%' }}
        >
            {/* Ruler */}
            <div 
                className="h-[30px] border-b border-lumina-700 bg-lumina-800/50 sticky top-0 z-30 cursor-pointer"
                onClick={handleSeek}
            >
                {Array.from({ length: Math.ceil(state.duration) }).map((_, i) => (
                    <div 
                        key={i} 
                        className="absolute bottom-0 text-[9px] text-gray-500 border-l border-gray-600 pl-1"
                        style={{ left: `${i * state.zoom}px`, height: i % 5 === 0 ? '100%' : '30%' }}
                    >
                        {i % 5 === 0 && `${i}s`}
                    </div>
                ))}
            </div>

            {/* Track Backgrounds */}
            {state.tracks.map((track) => (
                <Track key={track.id} track={track} />
            ))}

            {/* Clips Layer - Rendered absolutely over tracks */}
            <div className="absolute top-[30px] left-0 w-full h-full pointer-events-none">
                 {Object.values(state.clips).map(clip => (
                    <ClipItem 
                        key={clip.id} 
                        clip={clip} 
                        timelineRect={scrollContainerRef.current?.getBoundingClientRect()}
                        scrollLeft={scrollContainerRef.current?.scrollLeft || 0}
                    />
                 ))}
            </div>

            {/* Playhead */}
            <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-40 pointer-events-none"
                style={{ left: `${state.currentTime * state.zoom}px` }}
            >
                <div className="w-3 h-3 bg-red-500 transform -translate-x-1.5 -translate-y-1.5 rotate-45 absolute top-0"></div>
            </div>
        </div>
      </div>
    </div>
  );
};

function formatTime(seconds: number) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}