
/// <reference lib="dom" />
import React, { useState } from 'react';
import { TimelineProvider, useTimeline } from './services/timelineStore';
import { AssetLibrary } from './components/AssetLibrary';
import { PreviewPlayer } from './components/PreviewPlayer';
import { Timeline } from './components/Timeline/Timeline';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ffmpegService } from './services/ffmpegService';
import { EditorProps, CanvasSize } from './types';

const ProjectSetup: React.FC<{ onComplete: (s: CanvasSize) => void }> = ({ onComplete }) => {
    const sizes = [
        { name: 'YouTube (16:9)', width: 1920, height: 1080 },
        { name: 'TikTok (9:16)', width: 1080, height: 1920 },
        { name: 'Square (1:1)', width: 1080, height: 1080 },
        { name: 'Cinema (2.35:1)', width: 1920, height: 817 },
    ];

    return (
        <div className="fixed inset-0 bg-lumina-900 z-50 flex items-center justify-center p-4">
            <div className="bg-lumina-800 border border-lumina-700 p-8 rounded-2xl max-w-2xl w-full shadow-2xl">
                <h1 className="text-3xl font-bold text-white mb-2 text-center">Start Project</h1>
                <p className="text-gray-400 text-center mb-8">Select video resolution</p>
                
                <div className="grid grid-cols-2 gap-4">
                    {sizes.map(s => (
                        <button 
                            key={s.name}
                            onClick={() => onComplete(s)}
                            className="flex flex-col items-center justify-center p-6 bg-lumina-900 border-2 border-transparent hover:border-lumina-500 rounded-xl transition-all hover:bg-lumina-700 group"
                        >
                            <div 
                                className="border border-gray-600 group-hover:border-lumina-400 mb-3 bg-black/50"
                                style={{ 
                                    width: '60px', 
                                    height: `${(s.height / s.width) * 60}px` 
                                }}
                            />
                            <span className="font-bold text-white">{s.name}</span>
                            <span className="text-xs text-gray-500">{s.width} x {s.height}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const EditorLayout: React.FC<{ onExport?: (blob: Blob) => void }> = ({ onExport }) => {
    const { state, dispatch } = useTimeline();
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await ffmpegService.load();
            const blob = await ffmpegService.exportVideo(state, (p) => setProgress(Math.round(p)));
            
            if (onExport) {
                onExport(blob);
            } else {
                // Default fallback: Download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `video_export_${Date.now()}.mp4`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (e) {
            (window as any).alert("Export failed or was cancelled.");
        } finally {
            setIsExporting(false);
            setProgress(0);
        }
    };

    return (
        <div className="flex flex-col h-full bg-lumina-900 text-white font-sans selection:bg-lumina-500/30">
            {/* Header */}
            <header className="h-14 border-b border-lumina-700 bg-lumina-800 flex items-center justify-between px-4 z-20">
                <div className="flex items-center gap-2">
                    <span className="font-bold tracking-tight text-lg text-gray-200">Video Editor</span>
                    <span className="text-xs px-2 py-0.5 bg-lumina-700 rounded text-gray-400 ml-2">{state.canvasSize.name}</span>
                </div>
                
                <div className="flex gap-4">
                     <button className="text-sm text-gray-400 hover:text-white transition-colors">Settings</button>
                     <button 
                        onClick={handleExport}
                        disabled={isExporting}
                        className="bg-white text-lumina-900 px-4 py-1.5 rounded-md font-semibold text-sm hover:bg-gray-100 transition-colors shadow-lg shadow-white/10 disabled:opacity-50"
                     >
                        {isExporting ? `Processing ${progress}%` : 'Export'}
                     </button>
                </div>
            </header>

            {/* Main Workspace */}
            <div className="flex-1 flex overflow-hidden">
                <AssetLibrary />
                <PreviewPlayer />
                <PropertiesPanel />
            </div>

            {/* Bottom Timeline */}
            <Timeline />
        </div>
    );
}

export const VideoEditor: React.FC<EditorProps> = (props) => {
  const [setupComplete, setSetupComplete] = useState(!!props.initialCanvasSize);
  const [initialSize, setInitialSize] = useState<CanvasSize | undefined>(props.initialCanvasSize);

  const handleSetupComplete = (size: CanvasSize) => {
      setInitialSize(size);
      setSetupComplete(true);
  };

  if (!setupComplete) {
      return <ProjectSetup onComplete={handleSetupComplete} />;
  }

  // Merge dynamic setup into initial props for the provider
  const providerProps = {
      ...props,
      initialCanvasSize: initialSize
  };

  return (
    <div className="w-full h-full min-h-[600px] relative">
        <TimelineProvider initialProps={providerProps}>
            <EditorLayout onExport={props.onExport} />
        </TimelineProvider>
    </div>
  );
}

export default VideoEditor;
