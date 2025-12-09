import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { Buffer } from 'buffer';
import { TimelineState, ClipType } from '../../../types'; // Assuming types are shared or copied

const execFileAsync = promisify(execFile);

// Helper to download files
const downloadFile = async (url: string, dest: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    const arrayBuffer = await res.arrayBuffer();
    await fs.promises.writeFile(dest, Buffer.from(arrayBuffer));
};

export async function POST(req: NextRequest) {
  const tmpDir = path.join(os.tmpdir(), `export_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  
  try {
    const body = await req.json();
    const state: TimelineState = body.state;

    if (!state) {
        return NextResponse.json({ error: 'Missing TimelineState' }, { status: 400 });
    }

    // Create Temp Directory
    await fs.promises.mkdir(tmpDir, { recursive: true });

    // 1. Download Assets
    const assetFiles: { id: string; path: string }[] = [];
    const clips = Object.values(state.clips).sort((a, b) => a.zIndex - b.zIndex);
    const uniqueAssets = [...new Set(clips.map(c => c.assetId).filter(Boolean) as string[])];

    await Promise.all(uniqueAssets.map(async (assetId) => {
        const asset = state.assets[assetId];
        if (!asset || !asset.url.startsWith('http')) return; // Skip local blobs or missing assets
        
        // Sanitize filename
        const safeName = asset.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const filename = `asset_${assetId}_${safeName}`;
        const filePath = path.join(tmpDir, filename);
        
        try {
            await downloadFile(asset.url, filePath);
            assetFiles.push({ id: assetId, path: filePath });
        } catch (e) {
            console.error(`Failed to download asset ${assetId}:`, e);
        }
    }));

    // 2. Download Font (Inter-Bold)
    const fontPath = path.join(tmpDir, 'font.ttf');
    try {
        await downloadFile('https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter-Bold.ttf', fontPath);
    } catch (e) {
        console.warn("Could not download font, text overlay might fail");
    }

    // 3. Build FFmpeg Arguments
    const inputArgs: string[] = [];
    const assetInputMap = new Map<string, number>();
    
    // Map assets to input indices
    assetFiles.forEach((f, idx) => {
        inputArgs.push('-i', f.path);
        assetInputMap.set(f.id, idx);
    });

    const filterChain: string[] = [];
    let lastVideoLabel = '[base]';
    const audioMixLabels: string[] = [];

    // Initialize Canvas
    filterChain.push(`color=c=black:s=${state.canvasSize.width}x${state.canvasSize.height}:d=${state.duration}[base]`);

    // Process Clips
    clips.forEach((clip, idx) => {
        const { timelineStart, inPoint, duration, transform, transition } = clip;
        const clipLabel = `clip${idx}`;

        // --- VIDEO / IMAGE ---
        if (clip.type === 'VIDEO' || clip.type === 'IMAGE') {
            if (!clip.assetId) return;
            const inputIdx = assetInputMap.get(clip.assetId);
            if (inputIdx === undefined) return; // Asset not found (maybe local blob failed)

            let streamPrep = '';
            if (clip.type === 'IMAGE') {
                 // Loop image, trim to duration, shift PTS
                 streamPrep = `[${inputIdx}:v]loop=loop=-1:size=1:start=0,trim=start=0:end=${duration},setpts=PTS-STARTPTS+${timelineStart}/TB`;
            } else {
                 // Trim video, shift PTS
                 streamPrep = `[${inputIdx}:v]trim=${inPoint}:${inPoint + duration},setpts=PTS-STARTPTS+${timelineStart}/TB`;
            }

            // Transforms
            const scaleFilter = `scale=iw*${transform.scale}:ih*${transform.scale}`;
            // Rotate logic (requires converting degrees to radians for complex rotate, or simple transpose if 90deg, but standard `rotate` filter is best)
            // Note: `rotate` filter fills bg with black by default, c=none makes it transparent
            const rotateFilter = `rotate=${transform.rotation}*PI/180:c=none:ow=rotw(${transform.rotation}*PI/180):oh=roth(${transform.rotation}*PI/180)`;
            const opacityFilter = `colorchannelmixer=aa=${transform.opacity}`;

            let fadeFilter = "";
            if (transition) {
                if (transition.inDuration > 0) {
                     // fade in at start of clip (timelineStart)
                     fadeFilter += `,fade=t=in:st=${timelineStart}:d=${transition.inDuration}:alpha=1`;
                }
                if (transition.outDuration > 0) {
                     // fade out at end of clip
                     fadeFilter += `,fade=t=out:st=${timelineStart + duration - transition.outDuration}:d=${transition.outDuration}:alpha=1`;
                }
            }

            filterChain.push(`${streamPrep},${scaleFilter},${rotateFilter},${opacityFilter}${fadeFilter}[${clipLabel}_v]`);

            // Overlay
            // Ensure x/y are pixels
            const x = (transform.x / 100) * state.canvasSize.width;
            const y = (transform.y / 100) * state.canvasSize.height;

            filterChain.push(`${lastVideoLabel}[${clipLabel}_v]overlay=x=${x}:y=${y}:enable='between(t,${timelineStart},${timelineStart + duration})'[tmp${idx}]`);
            lastVideoLabel = `[tmp${idx}]`;
        }

        // --- TEXT ---
        if (clip.type === 'TEXT' && clip.textData) {
            const { content, fontSize, color, align, x: textX, y: textY } = { 
                ...clip.textData, 
                x: (clip.transform.x / 100) * state.canvasSize.width,
                y: (clip.transform.y / 100) * state.canvasSize.height
            };

            const escapedText = content.replace(/:/g, '\\:').replace(/'/g, '').replace(/\n/g, ' ');
            const fontColor = color.replace('#', '0x');
            
            // Basic alignment logic
            let xExpr = `${textX}`;
            if (align === 'center') xExpr = `${textX}-(text_w/2)`;
            if (align === 'right') xExpr = `${textX}-text_w`;

            // Escaped path for font file in filter graph
            // Windows path handling might require replacement of \ with /
            const fontPathEscaped = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

            const drawText = `drawtext=fontfile='${fontPathEscaped}':text='${escapedText}':fontcolor=${fontColor}:fontsize=${fontSize}:x=${xExpr}:y=${textY}:enable='between(t,${timelineStart},${timelineStart + duration})'`;
            
            filterChain.push(`${lastVideoLabel}${drawText}[tmp${idx}]`);
            lastVideoLabel = `[tmp${idx}]`;
        }

        // --- AUDIO ---
        if ((clip.type === 'AUDIO' || clip.type === 'VIDEO') && clip.assetId) {
            const inputIdx = assetInputMap.get(clip.assetId);
            // Images don't have audio
            if (inputIdx !== undefined) {
                const volume = clip.volume ?? 1;
                if (volume > 0) {
                     const delayMs = timelineStart * 1000;
                     const audioLabel = `[aud${idx}]`;
                     // atrim, volume, adelay
                     // Note: adelay takes milliseconds
                     const audioFilter = `[${inputIdx}:a]atrim=start=${inPoint}:end=${inPoint + duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delayMs}|${delayMs}${audioLabel}`;
                     filterChain.push(audioFilter);
                     audioMixLabels.push(audioLabel);
                }
            }
        }
    });

    const mapArgs = ['-map', lastVideoLabel];
    if (audioMixLabels.length > 0) {
        filterChain.push(`${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest[outa]`);
        mapArgs.push('-map', '[outa]');
    }

    const outputPath = path.join(tmpDir, 'output.mp4');
    
    const args = [
        '-y', // overwrite
        ...inputArgs,
        '-filter_complex', filterChain.join(';'),
        ...mapArgs,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-shortest',
        outputPath
    ];

    console.log("Executing FFmpeg...");
    await execFileAsync('ffmpeg', args);

    // 4. Return Result
    const videoBuffer = await fs.promises.readFile(outputPath);

    // Cleanup
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return new Response(videoBuffer, {
        status: 200,
        headers: {
            'Content-Type': 'video/mp4',
            'Content-Disposition': 'attachment; filename="export.mp4"',
        }
    });

  } catch (error) {
    console.error("Export Error:", error);
    // Attempt cleanup
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ error: 'Export Failed on Server' }, { status: 500 });
  }
}