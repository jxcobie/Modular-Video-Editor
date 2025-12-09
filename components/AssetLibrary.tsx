import React from 'react';
import { useTimeline } from '../services/timelineStore';

export const AssetLibrary: React.FC = () => {
  const { state, api } = useTimeline();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.target as any).files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        await api.addAsset(files[i]);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, assetId: string) => {
    (e.dataTransfer as any).setData('assetId', assetId);
    (e.dataTransfer as any).effectAllowed = 'copy';
  };

  return (
    <div className="w-64 bg-lumina-800 border-r border-lumina-700 flex flex-col h-full z-20 shadow-xl">
      <div className="p-4 border-b border-lumina-700 space-y-2">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Create</h2>
        <div className="grid grid-cols-2 gap-2">
             <label className="flex flex-col items-center justify-center p-3 bg-lumina-700 hover:bg-lumina-600 rounded cursor-pointer transition-colors text-xs text-center">
                <span className="text-lg mb-1">📁</span>
                <span>Import</span>
                <input type="file" className="hidden" multiple accept="video/*,image/*,audio/*" onChange={handleFileUpload} />
             </label>
             <button 
                onClick={() => api.addTextClip("New Text Layer")}
                className="flex flex-col items-center justify-center p-3 bg-lumina-700 hover:bg-lumina-600 rounded cursor-pointer transition-colors text-xs text-center"
             >
                <span className="text-lg mb-1">T</span>
                <span>Add Text</span>
             </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2 content-start">
        {Object.values(state.assets).map(asset => (
          <div 
            key={asset.id} 
            draggable 
            onDragStart={(e) => handleDragStart(e, asset.id)}
            className="aspect-square bg-lumina-900 rounded-lg overflow-hidden border border-transparent hover:border-lumina-500 cursor-grab relative group"
          >
            {asset.type === 'video' || asset.type === 'image' ? (
              <video src={asset.url} className="w-full h-full object-cover pointer-events-none" />
            ) : (
               <div className="w-full h-full flex flex-col items-center justify-center text-lumina-400 bg-lumina-800">
                 <span className="text-2xl">🎵</span>
               </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-[10px] truncate">
                {asset.name}
            </div>
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
        
        {Object.keys(state.assets).length === 0 && (
            <div className="col-span-2 text-center text-xs text-gray-500 mt-10 p-4 border-2 border-dashed border-lumina-700 rounded-xl">
                Drag files here<br/>or click Import
            </div>
        )}
      </div>

      {/* API Test Controls */}
      <div className="p-4 border-t border-lumina-700 bg-lumina-900/30">
        <h3 className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Quick Insert</h3>
        <div className="space-y-2">
            <button 
                onClick={() => api.addVideoClip('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'Bunny')}
                className="w-full py-1.5 px-3 bg-lumina-700/50 hover:bg-lumina-600 border border-lumina-600/50 rounded text-xs text-left flex items-center gap-2"
            >
                🐇 Sample Video
            </button>
            <button 
                onClick={() => api.addImageClip('https://picsum.photos/800/450', 'Random Landscape', 5)}
                className="w-full py-1.5 px-3 bg-lumina-700/50 hover:bg-lumina-600 border border-lumina-600/50 rounded text-xs text-left flex items-center gap-2"
            >
                🌄 Sample Image
            </button>
        </div>
      </div>
    </div>
  );
};
