import React, { useEffect, useRef } from 'react';
import { useTimeline } from '../services/timelineStore';
import { Clip, ClipType } from '../types';

export const PreviewPlayer: React.FC = () => {
  const { state, dispatch } = useTimeline();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const animate = (time: number) => {
    const currentState = stateRef.current;

    if (!currentState.isPlaying) {
        lastTimeRef.current = 0;
        return;
    }

    if (lastTimeRef.current !== 0) {
        const delta = (time - lastTimeRef.current) / 1000;
        const safeDelta = Math.min(delta, 0.1); 
        
        let newTime = currentState.currentTime + safeDelta;
        
        if (newTime >= currentState.duration) {
            newTime = 0;
        }
        
        dispatch({ type: 'SET_PLAYHEAD', payload: newTime });
    }
    
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (state.isPlaying) {
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(animate);
    } else {
      lastTimeRef.current = 0;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [state.isPlaying]);

  const PRELOAD_WINDOW = 2; 

  const activeClips = Object.values(state.clips).filter(clip => {
    const clipEnd = clip.timelineStart + clip.duration;
    const windowStart = state.currentTime - 1; 
    const windowEnd = state.currentTime + PRELOAD_WINDOW;
    return clip.timelineStart < windowEnd && clipEnd > windowStart;
  }).sort((a, b) => a.zIndex - b.zIndex);

  const hasVisibleClip = activeClips.some(clip => 
    clip.type !== ClipType.AUDIO &&
    state.currentTime >= clip.timelineStart && 
    state.currentTime < clip.timelineStart + clip.duration
  );

  return (
    <div className="flex-1 flex flex-col bg-black relative overflow-hidden items-center justify-center p-8">
      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className="relative bg-lumina-900 shadow-2xl overflow-hidden ring-1 ring-white/10"
        style={{ 
            aspectRatio: `${state.canvasSize.width} / ${state.canvasSize.height}`,
            height: '90%',
            maxWidth: '100%'
        }}
      >
        {activeClips.map(clip => {
            const isVisible = state.currentTime >= clip.timelineStart && 
                              state.currentTime < clip.timelineStart + clip.duration;
            return (
                <ClipLayer 
                    key={clip.id} 
                    clip={clip} 
                    currentTime={state.currentTime} 
                    isPlaying={state.isPlaying}
                    assets={state.assets} 
                    isVisible={isVisible}
                />
            );
        })}
        
        {!hasVisibleClip && (
            <div className="absolute inset-0 flex items-center justify-center text-lumina-700 font-mono text-sm pointer-events-none">
                <div className="text-center">
                    <p>CANVAS {state.canvasSize.width}x{state.canvasSize.height}</p>
                    <p className="text-xs mt-2 opacity-50">Drag media to timeline</p>
                </div>
            </div>
        )}
      </div>

      {/* Transport Controls Overlay */}
      <div className="absolute bottom-6 flex gap-4 p-2 bg-lumina-800/80 backdrop-blur-md rounded-full border border-lumina-600/50 shadow-lg z-50 transition-transform hover:scale-105">
         <button 
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white"
            onClick={() => dispatch({ type: 'SET_PLAYHEAD', payload: 0 })}
         >
            ⏮
         </button>
         <button 
            className="w-12 h-12 flex items-center justify-center rounded-full bg-lumina-500 hover:bg-lumina-400 text-white shadow-lg shadow-lumina-500/20"
            onClick={() => dispatch({ type: 'TOGGLE_PLAYBACK' })}
         >
            {state.isPlaying ? '⏸' : '▶'}
         </button>
      </div>
    </div>
  );
};

interface ClipLayerProps {
    clip: Clip;
    currentTime: number;
    isPlaying: boolean;
    assets: any;
    isVisible: boolean;
}

const ClipLayer: React.FC<ClipLayerProps> = ({ clip, currentTime, isPlaying, assets, isVisible }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    
    // Calculate Transition Opacity
    let transitionOpacity = 1;
    if (isVisible && clip.transition) {
        const timeIntoClip = currentTime - clip.timelineStart;
        const timeUntilEnd = (clip.timelineStart + clip.duration) - currentTime;

        if (timeIntoClip < clip.transition.inDuration) {
            transitionOpacity = timeIntoClip / clip.transition.inDuration;
        } else if (timeUntilEnd < clip.transition.outDuration) {
            transitionOpacity = timeUntilEnd / clip.transition.outDuration;
        }
    }
    
    // Apply user opacity
    const finalOpacity = (isVisible ? clip.transform.opacity : 0) * transitionOpacity;

    // Audio/Video Sync Logic
    useEffect(() => {
        const media = videoRef.current || audioRef.current;
        if (!media) return;

        if (isVisible) {
            const targetTime = (currentTime - clip.timelineStart) + clip.inPoint;

            if (Math.abs((media as any).currentTime - targetTime) > 0.2) {
                 (media as any).currentTime = targetTime;
            }

            if (isPlaying) {
                 if ((media as any).paused) {
                     (media as any).play().catch(() => {});
                 }
            } else {
                 if (!(media as any).paused) {
                     (media as any).pause();
                 }
                 (media as any).currentTime = targetTime;
            }
            
            (media as any).volume = clip.volume ?? 1;

        } else {
            if (!(media as any).paused) {
                (media as any).pause();
            }
            if (currentTime < clip.timelineStart) {
                if (Math.abs((media as any).currentTime - clip.inPoint) > 0.1) {
                    (media as any).currentTime = clip.inPoint;
                }
            }
        }
    }, [currentTime, isPlaying, clip.timelineStart, clip.inPoint, isVisible, clip.volume]);

    const style: React.CSSProperties = {
        position: 'absolute',
        left: `${clip.transform.x}%`,
        top: `${clip.transform.y}%`,
        width: '100%',
        height: '100%',
        transform: `scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`,
        opacity: finalOpacity,
        objectFit: 'contain',
        pointerEvents: 'none',
    };

    if (clip.type === ClipType.TEXT && clip.textData) {
        return (
            <div 
                style={{
                    ...style,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: clip.textData.align === 'left' ? 'flex-start' : clip.textData.align === 'right' ? 'flex-end' : 'center',
                }}
            >
                <h1 style={{
                    fontSize: `${clip.textData.fontSize}px`,
                    fontFamily: clip.textData.fontFamily,
                    color: clip.textData.color,
                    backgroundColor: clip.textData.backgroundColor,
                    padding: '0.5em',
                    whiteSpace: 'pre-wrap',
                    textAlign: clip.textData.align,
                }}>
                    {clip.textData.content}
                </h1>
            </div>
        )
    }

    if (clip.type === ClipType.AUDIO && clip.assetId) {
        const asset = assets[clip.assetId];
        if (!asset) return null;
        return <audio ref={audioRef} src={asset.url} />;
    }

    if (clip.assetId) {
        const asset = assets[clip.assetId];
        if (!asset) return null;

        if (asset.type === 'video') {
            return <video ref={videoRef} src={asset.url} style={style} muted={false} playsInline preload="auto" />;
        }
        if (asset.type === 'image') {
            return <img src={asset.url} style={style} alt="clip" />;
        }
    }
    
    return null;
}
