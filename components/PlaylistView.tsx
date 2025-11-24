import React, { useState, useRef, useEffect } from 'react';
import { PlaylistEntry, Track, TrackType } from '../types';
import { audioProcessor } from '../services/audioProcessor';

interface PlaylistViewProps {
  playlist: PlaylistEntry[];
  tracks: Track[]; // Needed to access the file blob for preview and for insertion list
  onReorder: (newPlaylist: PlaylistEntry[]) => void;
  onInsert: (index: number, track: Track) => void;
  onRemove: (index: number) => void;
  onUpdateEntry: (index: number, updates: Partial<PlaylistEntry>) => void;
  onCommitChanges: () => void;
  onPreview: (blob: Blob | null) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({ 
  playlist, 
  tracks,
  onReorder,
  onInsert,
  onRemove,
  onUpdateEntry,
  onCommitChanges,
  onPreview,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [insertFilter, setInsertFilter] = useState<string>('ALL'); // Filter state for insert popup
  
  // Preview State
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isPreviewingTransition, setIsPreviewingTransition] = useState<string | null>(null); // trackId being transitioned from
  const [volume, setVolume] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  // Transition Preview Refs
  const transitionContextRef = useRef<AudioContext | null>(null);
  const transitionSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Calculate Total Playlist Duration
  const totalDurationSeconds = playlist.reduce((acc, entry) => {
    const track = tracks.find(t => t.id === entry.trackId);
    return acc + (track ? track.duration : 0);
  }, 0);

  const formatTotalDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      stopTransitionPreview();
    };
  }, []);

  // Update volume in real-time
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = volume;
    }
  }, [volume]);

  const stopAudio = () => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
    }
    if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
    }
    setPreviewId(null);
  };

  const stopTransitionPreview = () => {
    transitionSourcesRef.current.forEach(src => {
        try { src.stop(); } catch(e) {}
    });
    transitionSourcesRef.current = [];
    if (transitionContextRef.current) {
        transitionContextRef.current.close();
        transitionContextRef.current = null;
    }
    setIsPreviewingTransition(null);
  };

  const playTransitionPreview = async (index: number) => {
      stopAudio(); // Stop normal preview
      stopTransitionPreview(); // Stop existing transition preview

      const currentEntry = playlist[index];
      const nextEntry = playlist[index + 1];

      if (!nextEntry) return;

      const trackA = tracks.find(t => t.id === currentEntry.trackId);
      const trackB = tracks.find(t => t.id === nextEntry.trackId);

      if (!trackA || !trackB) return;

      setIsPreviewingTransition(currentEntry.trackId);

      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        transitionContextRef.current = ctx;

        // Decode buffers
        // Note: In a real heavy app, we'd cache these buffers. Here we decode on demand for preview.
        const bufferA = await audioProcessor.decodeTrack(trackA);
        const bufferB = await audioProcessor.decodeTrack(trackB);

        const crossfadeDur = currentEntry.crossfadeDuration || 0;
        const previewDurationA = 5; // Play last 5s of A
        const previewDurationB = 5; // Play first 5s of B

        // Logic:
        // A ends at T=previewDurationA
        // B starts at T=previewDurationA - crossfadeDur
        
        // Source A
        const sourceA = ctx.createBufferSource();
        sourceA.buffer = bufferA;
        const gainA = ctx.createGain();
        sourceA.connect(gainA);
        gainA.connect(ctx.destination);
        
        // Play last segment of A
        // Start time in context: 0
        // Offset in buffer: length - previewDurationA
        // Duration: previewDurationA + overlap (if we want to hear fade out completely) -> actually just play till end
        const offsetA = Math.max(0, bufferA.duration - previewDurationA);
        sourceA.start(0, offsetA);

        // Gain Envelope A: Fade Out
        // Starts fading out at (previewDurationA - crossfadeDur) relative to preview start?
        // No, in the mix timeline, A fades out at its very end.
        // So relative to the preview start (which is T-5s from end), the fade starts at 5s - crossfadeDur.
        const fadeOutStart = Math.max(0, previewDurationA - crossfadeDur);
        gainA.gain.setValueAtTime(1, 0); // Start full
        gainA.gain.setValueAtTime(1, ctx.currentTime + fadeOutStart);
        gainA.gain.linearRampToValueAtTime(0, ctx.currentTime + previewDurationA);

        // Source B
        const sourceB = ctx.createBufferSource();
        sourceB.buffer = bufferB;
        const gainB = ctx.createGain();
        sourceB.connect(gainB);
        gainB.connect(ctx.destination);

        // Start B relative to A's end
        const startTimeB = Math.max(0, previewDurationA - crossfadeDur);
        sourceB.start(startTimeB, 0); // Start from beginning of B

        // Gain Envelope B: Fade In
        gainB.gain.setValueAtTime(0, ctx.currentTime + startTimeB);
        gainB.gain.linearRampToValueAtTime(1, ctx.currentTime + startTimeB + crossfadeDur);

        transitionSourcesRef.current = [sourceA, sourceB];

        // Auto stop after preview
        sourceB.onended = () => {
            setIsPreviewingTransition(null);
            ctx.close();
        };

      } catch (e) {
          console.error("Preview failed", e);
          setIsPreviewingTransition(null);
      }
  };

  const togglePreview = (trackId: string) => {
    stopTransitionPreview();

    // 1. Find the track file
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // 2. If clicking the same track that is playing, pause it.
    if (previewId === trackId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPreviewId(null);
      return;
    }

    // 3. Stop previous if any
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // 4. Revoke previous URL to free memory
    if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
    }

    // 5. Play new
    const url = URL.createObjectURL(track.file);
    activeUrlRef.current = url;
    
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    
    // Setup listeners
    audioRef.current.onended = () => {
        setPreviewId(null);
        setCurrentTime(0);
    };
    audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };
    audioRef.current.onloadedmetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    // Reset state for new track
    setCurrentTime(0);
    setDuration(track.duration || 0); // Temporary fallback

    audioRef.current.src = url;
    audioRef.current.volume = volume;
    
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            // Ignore AbortError which happens when switching tracks fast (The fetching process...)
            if (error.name !== 'AbortError') {
                console.error("Erro ao reproduzir preview:", error);
            }
        });
    }
    setPreviewId(trackId);
  };

  const getFilteredTracksForInsert = () => {
      if (insertFilter === 'ALL') return tracks;
      return tracks.filter(t => t.type === insertFilter);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
        case 'ALL': return 'Todos';
        case TrackType.VOICE: return 'Voz/Off';
        case TrackType.JINGLE: return 'Vinhetas';
        case TrackType.MUSIC: return 'Músicas';
        case TrackType.COMMERCIAL: return 'Comerciais';
        case TrackType.OTHER: return 'Outros';
        case TrackType.OPENING_CLOSING: return 'Abertura/Fim';
        default: return type;
    }
  };

  // Helper to render the Insert Popup
  const renderInsertPopup = (idx: number) => (
    <div className="absolute left-1/2 transform -translate-x-1/2 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 rounded-xl shadow-2xl w-80 max-h-80 flex flex-col animate-fade-in-up">
        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-xs font-bold text-gray-500 uppercase">Inserir na Playlist</h4>
            <button onClick={() => setInsertIndex(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 mb-1 custom-scrollbar">
            {['ALL', TrackType.VOICE, TrackType.JINGLE, TrackType.MUSIC, TrackType.COMMERCIAL, TrackType.OTHER].map(type => (
                <button
                    key={type}
                    onClick={() => setInsertFilter(type)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
                        insertFilter === type 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                    {getTypeLabel(type)}
                </button>
            ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 custom-scrollbar space-y-1">
            {getFilteredTracksForInsert().length === 0 ? (
                <p className="text-xs text-center py-4 text-gray-400">Nenhum áudio nesta categoria.</p>
            ) : (
                getFilteredTracksForInsert().map(t => (
                    <div key={t.id} 
                        onClick={() => {
                            onInsert(idx, t);
                            setInsertIndex(null);
                        }}
                        className="flex items-center justify-between group p-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer rounded-lg border border-transparent hover:border-gray-100 dark:hover:border-gray-700 transition-all">
                        <div className="flex items-center gap-2 overflow-hidden">
                             <span className={`w-2 h-2 rounded-full shrink-0 ${
                                 t.type === TrackType.MUSIC ? 'bg-blue-500' :
                                 t.type === TrackType.JINGLE ? 'bg-purple-500' :
                                 t.type === TrackType.VOICE ? 'bg-red-500' : 
                                 'bg-gray-400'
                             }`}></span>
                             <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{t.name}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">{Math.round(t.duration)}s</span>
                    </div>
                ))
            )}
        </div>
    </div>
  );

  if (playlist.length === 0) return null;

  const getTypeColor = (type: TrackType) => {
    switch(type) {
      case TrackType.MUSIC: return "bg-blue-600 border-blue-400";
      case TrackType.JINGLE: return "bg-purple-600 border-purple-400";
      case TrackType.COMMERCIAL: return "bg-amber-600 border-amber-400";
      case TrackType.VOICE: return "bg-red-600 border-red-400";
      case TrackType.OTHER: return "bg-teal-600 border-teal-400";
      case TrackType.OPENING_CLOSING: return "bg-indigo-600 border-indigo-400";
      default: return "bg-gray-600";
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newPl = [...playlist];
    if (direction === 'up' && index > 0) {
      [newPl[index], newPl[index - 1]] = [newPl[index - 1], newPl[index]];
    } else if (direction === 'down' && index < newPl.length - 1) {
      [newPl[index], newPl[index + 1]] = [newPl[index + 1], newPl[index]];
    }
    onReorder(newPl);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIndex) return;

    const newPl = [...playlist];
    const [movedItem] = newPl.splice(draggedIdx, 1);
    newPl.splice(dropIndex, 0, movedItem);
    
    onReorder(newPl);
    setDraggedIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-6 gap-4">
         <div className="flex items-center">
            <span className="w-2 h-10 bg-green-500 mr-3 rounded-full"></span>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-300">
                Agendamento Gerado
              </h2>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Duração Total: <span className="text-gray-700 dark:text-gray-200">{formatTotalDuration(totalDurationSeconds)}</span>
              </p>
            </div>
        </div>
        <div className="flex items-center gap-3">
             {/* Undo/Redo Buttons */}
             <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 mr-2">
                <button 
                  onClick={onUndo} 
                  disabled={!canUndo}
                  className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors"
                  title="Desfazer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                </button>
                <div className="w-[1px] h-4 bg-gray-300 dark:bg-gray-700"></div>
                <button 
                  onClick={onRedo} 
                  disabled={!canRedo}
                  className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors"
                  title="Refazer"
                >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                </button>
             </div>

             <button 
                onClick={onSave}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold border border-gray-300 dark:border-gray-700 transition-colors"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Salvar JSON
             </button>
             <div className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-900 px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-800 hidden sm:block">
                 Arraste para reordenar
            </div>
        </div>
      </div>
     
      <div className="space-y-1">
        {playlist.map((item, idx) => (
          <React.Fragment key={`${item.trackId}-${idx}`}>
             {/* Insert Zone */}
             <div className="h-4 group/insert relative flex justify-center items-center hover:h-10 transition-all z-20">
                <div className="w-full h-[1px] bg-gray-300 dark:bg-gray-800 group-hover/insert:bg-gray-400 dark:group-hover/insert:bg-gray-600"></div>
                <button 
                    onClick={() => {
                        setInsertIndex(insertIndex === idx ? null : idx);
                        setInsertFilter('ALL'); // Reset filter
                    }}
                    className="absolute bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-700 opacity-0 group-hover/insert:opacity-100 hover:bg-gray-300 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-opacity z-20">
                    + Inserir
                </button>
                {insertIndex === idx && renderInsertPopup(idx)}
             </div>

            {/* Track Item (Draggable) */}
            <div 
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`relative flex items-center group transition-all duration-200 z-10 
                  ${draggedIdx === idx ? 'opacity-40 scale-[0.98]' : 'opacity-100'} 
                  ${draggedIdx !== null && draggedIdx !== idx ? 'hover:translate-y-1' : ''}
                `}
            >
                {/* Grip Handle */}
                <div className="mr-3 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400 p-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                </div>

                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-lg z-10 ${getTypeColor(item.type)} text-white shrink-0`}>
                {idx + 1}
                </div>
                
                <div className={`ml-4 flex-1 bg-white dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm backdrop-blur-sm group-hover:border-gray-400 dark:group-hover:border-gray-500 transition-colors relative overflow-hidden ${draggedIdx === idx ? 'border-dashed border-gray-500 bg-gray-50 dark:bg-gray-800/30' : ''}`}>
                    <div className="flex items-center overflow-hidden flex-1 mr-4">
                        {/* Play Preview Button */}
                        <button 
                            onClick={() => togglePreview(item.trackId)}
                            className={`mr-3 p-1.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${previewId === item.trackId ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-blue-500 dark:hover:text-blue-400'}`}
                            title="Pré-ouvir faixa"
                        >
                             {previewId === item.trackId ? (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                             ) : (
                                <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                             )}
                        </button>

                        {/* Volume Control (Only when playing) */}
                        {previewId === item.trackId && (
                            <div className="flex items-center mr-3 animate-fade-in shrink-0">
                                <svg className="w-3 h-3 text-gray-400 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.05" 
                                    value={volume}
                                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-16 h-1 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    title={`Volume: ${Math.round(volume * 100)}%`}
                                />
                            </div>
                        )}

                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 mr-2 shrink-0`}>
                        {item.type.replace('_', ' ')}
                        </span>
                        <span className={`text-gray-800 dark:text-gray-200 font-medium truncate select-none ${previewId === item.trackId ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                          {item.trackName}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col gap-0.5">
                             <button onClick={() => moveItem(idx, 'up')} className="text-gray-400 hover:text-gray-800 dark:text-gray-500 dark:hover:text-white disabled:opacity-30" disabled={idx === 0}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                             </button>
                             <button onClick={() => moveItem(idx, 'down')} className="text-gray-400 hover:text-gray-800 dark:text-gray-500 dark:hover:text-white disabled:opacity-30" disabled={idx === playlist.length -1}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                             </button>
                        </div>
                        
                        {/* Crossfade Editor & Preview */}
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center bg-gray-100 dark:bg-gray-900 rounded p-1">
                                <span className="text-[9px] text-gray-500 dark:text-gray-400 mr-1 uppercase font-bold">Mix</span>
                                <input 
                                    type="number" 
                                    className="w-10 text-xs bg-transparent text-right outline-none text-gray-800 dark:text-white font-mono"
                                    value={item.crossfadeDuration}
                                    onChange={(e) => onUpdateEntry(idx, { crossfadeDuration: parseFloat(e.target.value) || 0 })}
                                    onBlur={onCommitChanges}
                                    step="0.5"
                                    min="0"
                                />
                                <span className="text-[9px] text-gray-500 dark:text-gray-400 ml-0.5">s</span>
                            </div>
                            
                            {/* Transition Preview Button (only if not last item) */}
                            {idx < playlist.length - 1 && (
                                <button 
                                    onClick={() => playTransitionPreview(idx)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${isPreviewingTransition === item.trackId ? 'bg-green-100 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'}`}
                                    title="Ouvir transição"
                                >
                                    {isPreviewingTransition === item.trackId ? (
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    ) : (
                                        <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    )}
                                    Preview
                                </button>
                            )}
                        </div>

                        <button onClick={() => onRemove(idx)} className="text-gray-400 hover:text-red-500 dark:text-gray-600 transition-colors ml-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Progress Bar */}
                    {previewId === item.trackId && (
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-200 dark:bg-gray-700 pointer-events-none">
                             <div 
                                className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-100 ease-linear"
                                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                             />
                        </div>
                    )}
                </div>
            </div>
          </React.Fragment>
        ))}
         {/* Final Insert Zone */}
         <div className="h-4 group/insert relative flex justify-center items-center hover:h-10 transition-all z-20">
                <div className="w-full h-[1px] bg-gray-300 dark:bg-gray-800 group-hover/insert:bg-gray-400 dark:group-hover/insert:bg-gray-600"></div>
                <button 
                    onClick={() => {
                        setInsertIndex(playlist.length);
                        setInsertFilter('ALL');
                    }}
                    className="absolute bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-700 opacity-0 group-hover/insert:opacity-100 hover:bg-gray-300 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-opacity z-20">
                    + Inserir
                </button>
                 {insertIndex === playlist.length && (
                    <div className="absolute bottom-8 transform z-30">
                        {renderInsertPopup(playlist.length)}
                    </div>
                )}
         </div>
      </div>
    </div>
  );
};