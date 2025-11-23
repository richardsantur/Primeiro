import { Track, PlaylistEntry, TrackType, AppSettings } from '../types';

declare global {
  interface Window {
    lamejs: any;
  }
}

export class AudioProcessor {
  private audioContext: AudioContext;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async getFileDuration(file: File | Blob): Promise<number> {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.duration;
  }

  async decodeTrack(track: Track): Promise<AudioBuffer> {
    const arrayBuffer = await track.file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.normalizeBuffer(audioBuffer);
  }

  // Peak Normalization to -1dB
  private normalizeBuffer(buffer: AudioBuffer): AudioBuffer {
    const channelData = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channelData.push(buffer.getChannelData(i));
    }

    let maxPeak = 0;
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const data = channelData[i];
      for (let j = 0; j < data.length; j++) {
        const abs = Math.abs(data[j]);
        if (abs > maxPeak) maxPeak = abs;
      }
    }

    const target = 0.89125;
    const gain = maxPeak > 0 ? target / maxPeak : 1;

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const data = channelData[i];
      for (let j = 0; j < data.length; j++) {
        data[j] *= gain;
      }
    }

    return buffer;
  }

  private getDb(sample: number): number {
    if (sample === 0) return -100;
    return 20 * Math.log10(Math.abs(sample));
  }

  private findCueIn(buffer: AudioBuffer, thresholdDb: number = -25): number {
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      if (this.getDb(data[i]) > thresholdDb) {
        return i / buffer.sampleRate;
      }
    }
    return 0;
  }

  private findCueOut(buffer: AudioBuffer, thresholdDb: number = -28): number {
    const data = buffer.getChannelData(0);
    for (let i = data.length - 1; i >= 0; i--) {
      if (this.getDb(data[i]) > thresholdDb) {
        return i / buffer.sampleRate;
      }
    }
    return buffer.duration;
  }

  private findMixPoint(buffer: AudioBuffer, cueOutTime: number, thresholdDb: number = -15): number {
    const data = buffer.getChannelData(0);
    const endSample = Math.floor(cueOutTime * buffer.sampleRate);
    
    for (let i = endSample; i >= 0; i--) {
      if (this.getDb(data[i]) > thresholdDb) {
        return i / buffer.sampleRate;
      }
    }
    return Math.max(0, cueOutTime - 2);
  }

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    this.mediaRecorder.start();
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject("No recorder initialized");
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' }); 
        resolve(audioBlob);
        this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.stop();
    });
  }

  // New Method: Returns the Master AudioBuffer directly
  async generateMasterBuffer(playlist: PlaylistEntry[], tracks: Track[], settings?: AppSettings): Promise<AudioBuffer> {
    const trackMap = new Map(tracks.map(t => [t.id, t]));
    
    // 1. Decode & Analyze
    const analyzedTracks: { 
      buffer: AudioBuffer; 
      cueIn: number; 
      cueOut: number; 
      mixPoint15: number; 
      mixPoint6: number;
      type: TrackType;
    }[] = [];

    for (const entry of playlist) {
      const track = trackMap.get(entry.trackId);
      if (track) {
        const buffer = await this.decodeTrack(track);
        
        const cueIn = this.findCueIn(buffer, -25); 
        const cueOut = this.findCueOut(buffer, -28); 
        
        const mixPoint15 = this.findMixPoint(buffer, cueOut, -15); 
        const mixPoint6 = this.findMixPoint(buffer, cueOut, -6);

        analyzedTracks.push({ 
          buffer, 
          cueIn, 
          cueOut, 
          mixPoint15, 
          mixPoint6,
          type: track.type 
        });
      }
    }

    if (analyzedTracks.length === 0) {
        return this.audioContext.createBuffer(2, 44100, 44100);
    }

    // 2. Timeline Calculation
    interface TimelineEvent {
      buffer: AudioBuffer;
      sourceStart: number;
      sourceEnd: number;
      destStart: number;
      destEnd: number;
    }

    const events: TimelineEvent[] = [];
    let cursor = 0;

    for (let i = 0; i < analyzedTracks.length; i++) {
      const current = analyzedTracks[i];
      const next = i < analyzedTracks.length - 1 ? analyzedTracks[i+1] : null;
      
      const duration = current.cueOut - current.cueIn;
      
      const evt: TimelineEvent = {
        buffer: current.buffer,
        sourceStart: current.cueIn,
        sourceEnd: current.cueOut,
        destStart: cursor,
        destEnd: cursor + duration
      };
      
      events.push(evt);
      
      let effectiveMixPoint = current.mixPoint15;
      const fadeSlopeDuration = Math.abs(current.mixPoint15 - current.mixPoint6);
      const tailLength = current.cueOut - current.mixPoint15;

      if (current.type === TrackType.VOICE) {
         effectiveMixPoint = current.cueOut - 0.5;
      } 
      else if (fadeSlopeDuration < 1.5) {
         if (tailLength > 1.5) {
            effectiveMixPoint = current.cueOut - 1.5;
         } else {
            effectiveMixPoint = current.mixPoint15;
         }
      } 
      else {
        if (tailLength > 6) {
            effectiveMixPoint = current.cueOut - 6;
        }
      }

      if (next && next.type === TrackType.VOICE) {
         effectiveMixPoint = Math.max(current.cueIn, effectiveMixPoint - 1.5);
      }

      const timeUntilMix = effectiveMixPoint - current.cueIn;
      const safeTimeUntilMix = Math.min(timeUntilMix, duration);
      
      cursor += safeTimeUntilMix;
    }

    const totalLength = events[events.length - 1].destEnd;

    // 3. Render
    const sampleRate = 44100; 
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalLength * sampleRate), sampleRate);

    events.forEach((event, index) => {
      const source = offlineCtx.createBufferSource();
      source.buffer = event.buffer;
      
      const gainNode = offlineCtx.createGain();
      source.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      source.start(event.destStart, event.sourceStart, event.sourceEnd - event.sourceStart);

      const overlapNext = index < events.length - 1 ? (event.destEnd - events[index+1].destStart) : 0;

      gainNode.gain.setValueAtTime(1, event.destStart);

      if (overlapNext > 0) {
        gainNode.gain.setValueAtTime(1, event.destEnd - overlapNext);
        gainNode.gain.linearRampToValueAtTime(0, event.destEnd);
      } else if (index === events.length - 1) {
        gainNode.gain.setValueAtTime(1, event.destEnd - 1.0);
        gainNode.gain.linearRampToValueAtTime(0, event.destEnd);
      }
    });

    return await offlineCtx.startRendering();
  }

  // Helper to get WAV Blob from Buffer
  bufferToWav(abuffer: AudioBuffer): Blob {
    let numOfChan = abuffer.numberOfChannels,
        len = abuffer.length,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample,
        offset = 0,
        pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit 

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    for(i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while(pos < len) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos])); 
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
            view.setInt16(44 + offset, sample, true); 
            offset += 2;
        }
        pos++;
    }

    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
  }

  // New Method: Encodes AudioBuffer to MP3 using lamejs
  async bufferToMp3(buffer: AudioBuffer): Promise<Blob> {
    if (!window.lamejs) {
        throw new Error("LameJS not found. Cannot encode MP3.");
    }

    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    
    // lamejs needs integer samples
    const mp3Encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, 320); // 320kbps
    const mp3Data = [];

    // Extract channel data and convert to Int16
    const leftData = buffer.getChannelData(0);
    const rightData = channels > 1 ? buffer.getChannelData(1) : leftData; // Mono fallback

    const blockSize = 1152;
    const leftInt16 = new Int16Array(blockSize);
    const rightInt16 = new Int16Array(blockSize);

    for (let i = 0; i < samples; i += blockSize) {
        const end = Math.min(i + blockSize, samples);
        const size = end - i;

        for (let j = 0; j < size; j++) {
            // Scale float to int16
            let sL = Math.max(-1, Math.min(1, leftData[i + j]));
            leftInt16[j] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
            
            let sR = Math.max(-1, Math.min(1, rightData[i + j]));
            rightInt16[j] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
        }

        const mp3buf = mp3Encoder.encodeBuffer(leftInt16.subarray(0, size), rightInt16.subarray(0, size));
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    const mp3buf = mp3Encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }

  // Compatibility method
  async renderMix(playlist: PlaylistEntry[], tracks: Track[]): Promise<Blob> {
      const buffer = await this.generateMasterBuffer(playlist, tracks);
      return this.bufferToWav(buffer);
  }
}

export const audioProcessor = new AudioProcessor();