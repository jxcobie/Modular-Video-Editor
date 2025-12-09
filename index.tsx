
/// <reference lib="dom" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import { VideoEditor } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Example integration
const handleExport = (blob: Blob) => {
    console.log("Exported Blob:", blob);
    alert("Parent App received Blob! Check console.");
    // Example: Upload blob to server or trigger download manually
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "integrated_export.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// Initial Clips to Preload
const SAMPLE_CLIPS = [
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
];

root.render(
  <React.StrictMode>
    <div className="w-screen h-screen bg-black">
        <VideoEditor 
            initialCanvasSize={{ width: 1920, height: 1080, name: '1080p' }}
            initialClips={SAMPLE_CLIPS}
            onExport={handleExport}
        />
    </div>
  </React.StrictMode>
);
