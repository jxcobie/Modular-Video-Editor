
# React Video Editor Component

A fully integratable, browser-native video editor component for Next.js/React applications. Powered by `ffmpeg.wasm` for client-side rendering.

## Features
- **Integratable Component**: `VideoEditor` drops into any React app.
- **Smart Injection**: Auto-populate timeline with video URLs via props.
- **Blob Export**: Returns a raw `Blob` to the parent component for custom handling (S3 upload, download, etc.).
- **Timeline API**: Programmatic control over tracks and clips.
- **Text & Transitions**: Built-in support for text overlays and fade transitions.

## Installation

Ensure you have the necessary dependencies:

```bash
npm install react react-dom @ffmpeg/ffmpeg @ffmpeg/util
```

## Usage

```tsx
import { VideoEditor } from './components/VideoEditor';

const MyPage = () => {
    
    const handleExport = (blob: Blob) => {
        // 1. Upload to S3
        // 2. Save to database
        // 3. Trigger download
        const url = URL.createObjectURL(blob);
        window.open(url);
    };

    return (
        <div style={{ height: '100vh' }}>
            <VideoEditor 
                initialCanvasSize={{ width: 1280, height: 720, name: '720p' }}
                initialClips={[
                    'https://example.com/video1.mp4',
                    'https://example.com/video2.mp4'
                ]}
                onExport={handleExport}
            />
        </div>
    );
};
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `initialCanvasSize` | `{ width: number, height: number, name: string }` | Sets resolution. If omitted, prompts user. |
| `initialClips` | `string[]` | Array of direct video URLs to load sequentially onto Track 1. |
| `onExport` | `(blob: Blob) => void` | Callback fired when export completes. |

## Customizing Transitions

Transitions are defined in `types.ts`. Currently supported types: `fade`.
To add a new transition:

1. Update `Transition` interface in `types.ts`.
2. Update `ClipLayer` in `components/PreviewPlayer.tsx` to calculate opacity/transform based on the new type.

## Theming

The editor uses Tailwind CSS with a custom `lumina` color palette defined in `index.html` (or your tailwind config). To change the theme, update the `colors` object in your Tailwind configuration.

## FFmpeg Integration

The export logic resides in `services/ffmpegService.ts`. 
**Note:** `ffmpeg.wasm` requires `SharedArrayBuffer`. You must set the following headers on your server/hosting provider:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If these headers are missing, the export will fail (or use the simulation fallback provided in the code).
