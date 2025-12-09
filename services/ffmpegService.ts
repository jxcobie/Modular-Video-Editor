
import { TimelineState } from '../types';

class FFmpegService {
  /**
   * Sends the timeline state to the server for processing.
   * Returns a Blob of the exported video.
   */
  async exportVideo(state: TimelineState, onProgress?: (p: number) => void): Promise<Blob> {
    // 1. Prepare State for Transport
    // We need to ensure we aren't sending circular references or massive local objects if possible.
    // Ideally, assets should have public URLs. 
    // If assets are local Blobs (from file input), this Server-Side Export will fail 
    // unless we upload them first or convert to Base64 (which is heavy).
    // For this implementation, we assume URLs are accessible by the server.

    try {
      if (onProgress) onProgress(10); // Fake progress start

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state }),
      });

      if (onProgress) onProgress(50); // Processing...

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Export failed on server');
      }

      if (onProgress) onProgress(90); // Downloading...

      const blob = await response.blob();
      
      if (onProgress) onProgress(100);

      return blob;
    } catch (error) {
      console.error("Export Service Error:", error);
      throw error;
    }
  }

  // Mock load for compatibility with existing UI calls
  async load() {
    return true;
  }
}

export const ffmpegService = new FFmpegService();
