
import { Clip, TimelineState, MediaAsset, ClipType } from '../types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private fontLoaded = false;

  async load() {
    if (this.isLoaded) return;

    this.ffmpeg = new FFmpeg();
    
    // Using unpkg for demo purposes. In prod, host these files.
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    try {
        await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        this.isLoaded = true;
        console.log("FFmpeg Loaded");
    } catch (e) {
        console.error("Failed to load FFmpeg. Check SharedArrayBuffer headers.", e);
        throw new Error("FFmpeg load failed. Export unavailable in this environment.");
    }
  }

  async exportVideo(state: TimelineState, onProgress: (p: number) => void): Promise<Blob> {
    if (!this.ffmpeg || !this.isLoaded) {
      throw new Error("FFmpeg not loaded. Please ensure shared headers are set.");
    }
    
    const ffmpeg = this.ffmpeg;

    ffmpeg.on('progress', ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });

    // 1. Load Font (for Text Layers)
    if (!this.fontLoaded) {
        try {
             // Using a standard google font for text rendering
             const fontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter-Bold.ttf';
             await ffmpeg.writeFile('font.ttf', await fetchFile(fontUrl));
             this.fontLoaded = true;
        } catch(e) {
            console.warn("Failed to load font, text layers may not render correctly.", e);
        }
    }

    // 2. Prepare Assets & Inputs
    const activeClips = Object.values(state.clips).sort((a, b) => a.zIndex - b.zIndex);
    const uniqueAssets = new Set(activeClips.map(c => c.assetId).filter(Boolean) as string[]);
    const assetInputMap = new Map<string, number>();
    const inputArgs: string[] = [];
    
    let inputIndex = 0;
    
    // Write asset files to VFS
    for (const assetId of uniqueAssets) {
      const asset = state.assets[assetId];
      if (!asset) continue;
      
      const filename = `asset_${assetId}_${asset.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      await ffmpeg.writeFile(filename, await fetchFile(asset.url));
      
      inputArgs.push('-i', filename);
      assetInputMap.set(assetId, inputIndex);
      inputIndex++;
    }

    // 3. Build Filter Graph
    const filterChain: string[] = [];
    let lastVideoLabel = "[base]";
    
    // Create Black Background Canvas
    filterChain.push(`color=c=black:s=${state.canvasSize.width}x${state.canvasSize.height}:d=${state.duration}[base]`);
    
    const audioMixLabels: string[] = [];

    // Process Clips
    activeClips.forEach((clip, idx) => {
        const { timelineStart, inPoint, duration, transform, transition } = clip;
        const clipLabel = `clip${idx}`;
        
        // --- VIDEO / IMAGE PROCESSING ---
        if (clip.type === ClipType.VIDEO || clip.type === ClipType.IMAGE) {
            if (!clip.assetId) return;
            const inputIdx = assetInputMap.get(clip.assetId);
            if (inputIdx === undefined) return;
            
            // 1. Trim & Set PTS
            // For images, we loop them to match duration. For video, we trim.
            let streamPrep = "";
            if (clip.type === ClipType.IMAGE) {
                // Loop image to duration, then setpts
                streamPrep = `[${inputIdx}:v]loop=loop=-1:size=1:start=0,trim=start=0:end=${duration},setpts=PTS-STARTPTS`;
            } else {
                streamPrep = `[${inputIdx}:v]trim=${inPoint}:${inPoint + duration},setpts=PTS-STARTPTS`;
            }

            // 2. Transforms (Scale, Rotate, Opacity)
            // Convert % to pixels
            const targetW = Math.round(state.canvasSize.width * transform.scale);
            const targetH = -1; // Keep aspect ratio roughly or handle explicit height? 
            // ffmpeg scale=-1 keeps aspect ratio. But if we want precise scale of original:
            // Let's assume scale=1 means 'fit width' or 'original size'? 
            // Simplified: Scale width relative to canvas width * scale
            // Better NLE behavior: Scale relative to source size. 
            // For this implementation, we'll map scale 1.0 = 100% of canvas width (common in web editors) or original size.
            // Let's stick to: scale=iw*${scale}:ih*${scale}
            
            const scaleFilter = `scale=iw*${transform.scale}:ih*${transform.scale}`;
            const rotateFilter = `rotate=${transform.rotation}*PI/180:c=none:ow=rotw(${transform.rotation}*PI/180):oh=roth(${transform.rotation}*PI/180)`;
            
            // Opacity (using colorchannelmixer)
            const opacityFilter = `colorchannelmixer=aa=${transform.opacity}`;
            
            // 3. Transitions (Fade In/Out)
            let fadeFilter = "";
            if (transition) {
                if (transition.inDuration > 0) {
                    fadeFilter += `,fade=t=in:st=0:d=${transition.inDuration}:alpha=1`;
                }
                if (transition.outDuration > 0) {
                    // fade out needs to start at duration - outDuration
                    fadeFilter += `,fade=t=out:st=${duration - transition.outDuration}:d=${transition.outDuration}:alpha=1`;
                }
            }

            // Combine filters
            filterChain.push(`${streamPrep},${scaleFilter},${rotateFilter},${opacityFilter}${fadeFilter}[${clipLabel}_v]`);
            
            // 4. Overlay onto Base
            // Calculate Position
            const x = (transform.x / 100) * state.canvasSize.width;
            const y = (transform.y / 100) * state.canvasSize.height;
            
            // We use 'enable' to turn on the overlay only during the clip's timeline window.
            // However, since we reset PTS to 0 for the clip, we usually need to shift PTS to match timelineStart
            // OR use 'eof_action=pass'.
            // The robust method for NLE:
            // Shift clip PTS to start time: setpts=PTS-STARTPTS+${timelineStart}/TB
            // Then overlay.
            
            // Let's replace the previous setpts with the shifted one.
            filterChain[filterChain.length - 1] = filterChain[filterChain.length - 1].replace('setpts=PTS-STARTPTS', `setpts=PTS-STARTPTS+${timelineStart}/TB`);
            
            filterChain.push(`${lastVideoLabel}[${clipLabel}_v]overlay=x=${x}:y=${y}:enable='between(t,${timelineStart},${timelineStart + duration})'[tmp_v${idx}]`);
            lastVideoLabel = `[tmp_v${idx}]`;
        }

        // --- TEXT PROCESSING ---
        if (clip.type === ClipType.TEXT && clip.textData) {
            const { content, fontSize, color, align, x: textX, y: textY } = { 
                ...clip.textData, 
                x: (clip.transform.x / 100) * state.canvasSize.width,
                y: (clip.transform.y / 100) * state.canvasSize.height
            };
            
            // Escape text for drawtext
            const escapedText = content.replace(/:/g, '\\:').replace(/'/g, '').replace(/\n/g, ' ');
            const fontColor = color.replace('#', '0x'); // ffmpeg expects 0xRRGGBB
            
            // Position Logic (Rough approximation for center/left/right)
            // drawtext x/y is top-left of text box.
            let xExpr = `${textX}`;
            if (align === 'center') xExpr = `${textX}-(text_w/2)`;
            if (align === 'right') xExpr = `${textX}-text_w`;

            const drawTextFilter = `drawtext=fontfile=font.ttf:text='${escapedText}':fontcolor=${fontColor}:fontsize=${fontSize}:x=${xExpr}:y=${textY}:enable='between(t,${timelineStart},${timelineStart + duration})'`;
            
            filterChain.push(`${lastVideoLabel}${drawTextFilter}[tmp_v${idx}]`);
            lastVideoLabel = `[tmp_v${idx}]`;
        }

        // --- AUDIO PROCESSING ---
        // Includes audio from Video clips and Audio-only clips
        if (clip.type === ClipType.AUDIO || (clip.type === ClipType.VIDEO && clip.volume !== 0)) {
            if (!clip.assetId) return;
            const inputIdx = assetInputMap.get(clip.assetId);
            if (inputIdx === undefined) return;
            
            // Need to check if input has audio stream. For safety we can try mapping [i:a].
            // If asset is IMAGE, it has no audio.
            const asset = state.assets[clip.assetId];
            if (asset.type === 'image') return;

            const audioLabel = `[aud${idx}]`;
            
            // Trim, Volume, Delay
            const volumeVal = clip.volume ?? 1;
            const delayMs = timelineStart * 1000;
            
            // atrim uses seconds. adelay uses milliseconds.
            const audioFilter = `[${inputIdx}:a]atrim=start=${inPoint}:end=${inPoint + duration},asetpts=PTS-STARTPTS,volume=${volumeVal},adelay=${delayMs}|${delayMs}${audioLabel}`;
            
            filterChain.push(audioFilter);
            audioMixLabels.push(audioLabel);
        }
    });

    // 4. Final Outputs
    
    // Video Output Mapping
    const mapArgs = ['-map', lastVideoLabel];

    // Audio Output Mixing
    if (audioMixLabels.length > 0) {
        const amixFilter = `${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest[outa]`;
        filterChain.push(amixFilter);
        mapArgs.push('-map', '[outa]');
    }

    // Full Command
    const complexFilter = filterChain.join(';');
    const execArgs = [
        ...inputArgs,
        '-filter_complex', complexFilter,
        ...mapArgs,
        '-c:v', 'libx264', // H.264 Video
        '-preset', 'ultrafast', // Speed over compression for browser
        '-crf', '25', // Quality
        '-shortest', // Stop at shortest stream (usually video duration)
        'output.mp4'
    ];

    console.log("FFmpeg Command:", execArgs.join(' '));

    // 5. Execute
    try {
        await ffmpeg.exec(execArgs);
    } catch (error) {
        console.error("FFmpeg execution error:", error);
        throw new Error("Export failed during encoding.");
    }

    // 6. Read & Return
    try {
        const data = await ffmpeg.readFile('output.mp4');
        return new Blob([data as Uint8Array], { type: 'video/mp4' });
    } catch (error) {
        console.error("Failed to read output file:", error);
        throw new Error("Export succeeded but output file was missing.");
    }
  }
}

export const ffmpegService = new FFmpegService();
