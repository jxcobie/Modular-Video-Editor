import React from 'react';
import { Track as TrackType } from '../../types';
import { TRACK_HEIGHT } from '../../constants';

export const Track: React.FC<{ track: TrackType }> = ({ track }) => {
  return (
    <div 
        className="relative border-b border-lumina-800 bg-lumina-900/50 group box-border"
        style={{ height: TRACK_HEIGHT }}
    >
        {/* Track Label (Sticky) */}
        <div className="sticky left-0 w-24 h-full bg-lumina-900/90 border-r border-lumina-700 z-10 flex items-center px-2 text-xs font-bold text-gray-400 absolute">
            {track.name}
        </div>
        
        {/* Grid Lines (Visual Aid) */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
            <div className="w-full h-1/2 border-b border-white"></div>
        </div>
    </div>
  );
};