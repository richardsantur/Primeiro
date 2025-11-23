export enum TrackType {
  MUSIC = 'MUSIC',
  JINGLE = 'JINGLE',
  COMMERCIAL = 'COMMERCIAL',
  VOICE = 'VOICE', // Off/Locution
  OTHER = 'OTHER' // News, Programs, etc.
}

export interface Track {
  id: string;
  file: File | Blob; // Allow Blob for recorded audio
  name: string;
  type: TrackType;
  duration: number; // in seconds
  audioBuffer?: AudioBuffer;
}

export interface PlaylistEntry {
  trackId: string;
  trackName: string;
  type: TrackType;
  crossfadeDuration: number; // Seconds to overlap with next track
}

export interface AppSettings {
  targetBlockDuration: number; // minutes
  commercialsPerBlock: number;
  defaultCrossfade: number;
  jingleFrequency: number; // every X songs
  globalFadeIn: number;
  globalFadeOut: number;
}

export interface BlockHistory {
  id: string;
  name: string;
  date: string;
  entries: PlaylistEntry[];
  totalDuration: number;
}

export interface User {
  username: string;
  password: string; // In a real app, hash this!
  role: 'admin';
}