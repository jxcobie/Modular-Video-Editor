import React, { useState } from 'react';
import { useTimeline } from '../services/timelineStore';
import { ClipType } from '../types';

export const PropertiesPanel: React.FC = () => {
  const { state, dispatch } = useTimeline();
  const selectedClip = state.selectedClipId ? state.clips[state.selectedClipId] : null;
  const [activeTab, setActiveTab] = useState<'visual' | 'text' | 'anim' | 'audio'>('visual');

  if (!selectedClip) {
    return (
      <div className="w-80 bg-lumina-800 border-l border-lumina-700 flex flex-col items-center justify-center text-center text-gray-500">
        <div className="w-16 h-16 bg-lumina-700/50 rounded-full flex items-center justify-center mb-4 text-2xl">✨</div>
        <p className="px-8 text-sm">Select a clip to edit properties, animations, or effects.</p>
      </div>
    );
  }

  const updateClip = (changes: any) => {
      dispatch({ type: 'UPDATE_CLIP', payload: { id: selectedClip.id, changes }});
  };

  const updateTransform = (key: string, value: number) => {
    updateClip({ transform: { ...selectedClip.transform, [key]: value } });
  };

  const updateText = (key: string, value: any) => {
      if (!selectedClip.textData) return;
      updateClip({ textData: { ...selectedClip.textData, [key]: value } });
  };

  const updateTransition = (key: string, value: any) => {
      updateClip({ transition: { ...selectedClip.transition, [key]: value } });
  };

  return (
    <div className="w-80 bg-lumina-800 border-l border-lumina-700 flex flex-col h-full overflow-hidden shadow-xl z-20">
      <div className="p-4 border-b border-lumina-700 bg-lumina-900/50">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Editing</h2>
        <div className="font-semibold text-white truncate">{selectedClip.label || 'Untitled Clip'}</div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-lumina-700">
          {(['visual', 'anim', 'audio'] as const).map(tab => {
             // Skip tabs based on type
             if (tab === 'audio' && selectedClip.type === ClipType.TEXT) return null;
             if (tab === 'visual' && selectedClip.type === ClipType.AUDIO) return null;

             return (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                        activeTab === tab ? 'border-lumina-400 text-white bg-lumina-700/20' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    {tab === 'visual' ? 'Visual' : tab === 'anim' ? 'Animate' : 'Audio'}
                </button>
             );
          })}
          {selectedClip.type === ClipType.TEXT && (
              <button
                onClick={() => setActiveTab('text')}
                className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'text' ? 'border-lumina-400 text-white bg-lumina-700/20' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
            >
                Text
            </button>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* VISUAL TAB */}
        {activeTab === 'visual' && selectedClip.type !== ClipType.AUDIO && (
            <div className="space-y-6 animate-fadeIn">
                <ControlGroup label="Opacity">
                    <input 
                        type="range" min="0" max="1" step="0.01"
                        value={selectedClip.transform.opacity}
                        onChange={(e) => updateTransform('opacity', parseFloat((e.target as any).value))}
                        className="w-full accent-lumina-500"
                    />
                </ControlGroup>
                
                <ControlGroup label="Scale">
                    <input 
                        type="range" min="0.1" max="3" step="0.1"
                        value={selectedClip.transform.scale}
                        onChange={(e) => updateTransform('scale', parseFloat((e.target as any).value))}
                        className="w-full accent-lumina-500 mb-2"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>10%</span>
                        <span>{Math.round(selectedClip.transform.scale * 100)}%</span>
                        <span>300%</span>
                    </div>
                </ControlGroup>

                <ControlGroup label="Rotation">
                     <div className="flex items-center gap-3">
                         <input 
                            type="range" min="-180" max="180"
                            value={selectedClip.transform.rotation}
                            onChange={(e) => updateTransform('rotation', parseFloat((e.target as any).value))}
                            className="flex-1 accent-lumina-500"
                        />
                        <span className="text-xs text-gray-300 w-8 text-right">{selectedClip.transform.rotation}°</span>
                     </div>
                </ControlGroup>

                <ControlGroup label="Position">
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInput label="X" value={selectedClip.transform.x} onChange={(v) => updateTransform('x', v)} />
                        <NumberInput label="Y" value={selectedClip.transform.y} onChange={(v) => updateTransform('y', v)} />
                    </div>
                </ControlGroup>
            </div>
        )}

        {/* TEXT TAB */}
        {activeTab === 'text' && selectedClip.textData && (
            <div className="space-y-6 animate-fadeIn">
                <ControlGroup label="Content">
                    <textarea 
                        value={selectedClip.textData.content}
                        onChange={(e) => updateText('content', (e.target as any).value)}
                        className="w-full h-24 bg-lumina-900 border border-lumina-600 rounded-lg p-2 text-sm text-white focus:ring-2 focus:ring-lumina-500 focus:border-transparent"
                    />
                </ControlGroup>

                <ControlGroup label="Typography">
                     <div className="grid grid-cols-2 gap-2 mb-2">
                        <NumberInput label="Size" value={selectedClip.textData.fontSize} onChange={(v) => updateText('fontSize', v)} />
                        <select 
                            value={selectedClip.textData.align}
                            onChange={(e) => updateText('align', (e.target as any).value)}
                            className="bg-lumina-900 border border-lumina-600 rounded px-2 py-1 text-xs text-white"
                        >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                        </select>
                     </div>
                     <input 
                        type="color" 
                        value={selectedClip.textData.color}
                        onChange={(e) => updateText('color', (e.target as any).value)}
                        className="w-full h-8 rounded cursor-pointer"
                     />
                </ControlGroup>
            </div>
        )}

        {/* ANIMATION TAB */}
        {activeTab === 'anim' && (
             <div className="space-y-6 animate-fadeIn">
                 <div className="p-4 bg-lumina-900/50 rounded-lg border border-lumina-700">
                    <h4 className="text-xs font-bold text-white mb-4">Fade In</h4>
                    <input 
                        type="range" min="0" max="2" step="0.1"
                        value={selectedClip.transition?.inDuration || 0}
                        onChange={(e) => updateTransition('inDuration', parseFloat((e.target as any).value))}
                        className="w-full accent-lumina-500 mb-2"
                    />
                    <div className="text-right text-xs text-gray-400">{selectedClip.transition?.inDuration || 0}s</div>
                 </div>

                 <div className="p-4 bg-lumina-900/50 rounded-lg border border-lumina-700">
                    <h4 className="text-xs font-bold text-white mb-4">Fade Out</h4>
                    <input 
                        type="range" min="0" max="2" step="0.1"
                        value={selectedClip.transition?.outDuration || 0}
                        onChange={(e) => updateTransition('outDuration', parseFloat((e.target as any).value))}
                        className="w-full accent-lumina-500 mb-2"
                    />
                    <div className="text-right text-xs text-gray-400">{selectedClip.transition?.outDuration || 0}s</div>
                 </div>
             </div>
        )}

        {/* AUDIO TAB */}
        {activeTab === 'audio' && (
            <div className="space-y-6 animate-fadeIn">
                 <ControlGroup label="Volume">
                    <div className="flex items-center gap-3">
                        <span className="text-lg">🔈</span>
                        <input 
                            type="range" min="0" max="1" step="0.01"
                            value={selectedClip.volume ?? 1}
                            onChange={(e) => updateClip({ volume: parseFloat((e.target as any).value) })}
                            className="flex-1 accent-lumina-500"
                        />
                        <span className="text-lg">🔊</span>
                    </div>
                 </ControlGroup>
            </div>
        )}

        <div className="pt-8 mt-auto border-t border-lumina-700">
            <button 
                onClick={() => dispatch({ type: 'REMOVE_CLIP', payload: selectedClip.id })}
                className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
                <span>🗑</span> Delete Clip
            </button>
        </div>

      </div>
    </div>
  );
};

const ControlGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-[10px] font-bold text-lumina-400 uppercase tracking-wider mb-2">{label}</label>
        {children}
    </div>
);

const NumberInput: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
    <div className="bg-lumina-900 border border-lumina-600 rounded px-2 py-1.5 flex items-center justify-between group focus-within:ring-1 focus-within:ring-lumina-500">
        <span className="text-xs text-gray-500 font-medium mr-2 group-focus-within:text-lumina-500">{label}</span>
        <input 
            type="number" 
            value={value}
            onChange={(e) => onChange(parseFloat((e.target as any).value))}
            className="bg-transparent text-right text-sm text-white focus:outline-none w-16"
        />
    </div>
);
