import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Track, TrackType, PlaylistEntry, AppSettings, BlockHistory, User } from './types';
import { UploadZone } from './components/UploadZone';
import { PlaylistView } from './components/PlaylistView';
import { ConfigPanel } from './components/ConfigPanel';
import { AdminPanel } from './components/AdminPanel';
import { LoginModal } from './components/LoginModal';
import { generatePlaylistStructure } from './services/geminiService';
import { audioProcessor } from './services/audioProcessor';

// Simple UUID fallback
const simpleId = () => Math.random().toString(36).substring(2, 9);

export default function App() {
  // --- State ---
  const [view, setView] = useState<'home' | 'admin'>('home');
  const [showLogin, setShowLogin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>([]);
  
  // App Settings
  const [settings, setSettings] = useState<AppSettings>({
    targetBlockDuration: 15,
    commercialsPerBlock: 2,
    defaultCrossfade: 2.5,
    jingleFrequency: 1,
    globalFadeIn: 0,
    globalFadeOut: 0
  });

  // History
  const [history, setHistory] = useState<BlockHistory[]>(() => {
    const saved = localStorage.getItem('autodj_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Users
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('autodj_users');
    if (saved) return JSON.parse(saved);
    // Default admin if none exists
    return [{ username: 'admin', password: 'admin', role: 'admin' }];
  });

  // Processing States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const [isEncodingMp3, setIsEncodingMp3] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  
  // Mixed Audio
  const [masterBuffer, setMasterBuffer] = useState<AudioBuffer | null>(null);
  const [downloadWavUrl, setDownloadWavUrl] = useState<string | null>(null);

  // Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousWavUrlRef = useRef<string | null>(null);

  // Debounce/Cooldown for generation
  const lastGenTimeRef = useRef<number>(0);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('autodj_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('autodj_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Handle auto-play of generated mix securely
  useEffect(() => {
    if (downloadWavUrl && audioRef.current) {
        audioRef.current.load();
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                if (err.name !== 'AbortError') {
                    console.log("Playback interrupted or prevented:", err);
                }
            });
        }
    }
  }, [downloadWavUrl]);

  // --- Handlers ---
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // User Management
  const handleLoginValidation = (u: string, p: string): boolean => {
    const user = users.find(user => user.username === u && user.password === p);
    return !!user;
  };

  const handleAddUser = (user: User) => {
    if (users.some(u => u.username === user.username)) {
      alert("Usuário já existe");
      return;
    }
    setUsers([...users, user]);
  };

  const handleDeleteUser = (username: string) => {
    if (users.length <= 1) {
      alert("Você não pode excluir o último administrador.");
      return;
    }
    setUsers(users.filter(u => u.username !== username));
  };

  const handleUpload = useCallback(async (files: File[], type: TrackType) => {
    const newTracks: Track[] = [];
    for (const file of files) {
      const duration = await audioProcessor.getFileDuration(file);
      newTracks.push({
        id: simpleId(),
        file,
        name: file.name.replace(/\.[^/.]+$/, ""),
        type,
        duration
      });
    }
    setTracks(prev => [...prev, ...newTracks]);
  }, []);

  const handleRecordToggle = async () => {
    if (isRecording) {
      try {
        const blob = await audioProcessor.stopRecording();
        const duration = await audioProcessor.getFileDuration(blob);
        const newTrack: Track = {
            id: simpleId(),
            file: blob,
            name: `Gravação_Voz_${new Date().toLocaleTimeString()}`,
            type: TrackType.VOICE,
            duration
        };
        setTracks(prev => [...prev, newTrack]);
        setIsRecording(false);
      } catch (e) {
        console.error(e);
        setIsRecording(false);
      }
    } else {
      try {
        await audioProcessor.startRecording();
        setIsRecording(true);
      } catch (e) {
        alert("Acesso ao microfone negado ou indisponível.");
      }
    }
  };

  const handleGenerate = async () => {
    const now = Date.now();
    if (now - lastGenTimeRef.current < 5000) {
        setStatusMessage("Aguarde um momento antes de gerar novamente.");
        return;
    }
    lastGenTimeRef.current = now;

    if (tracks.filter(t => t.type === TrackType.MUSIC).length < 5 && settings.targetBlockDuration > 10) {
      alert("Para blocos longos, por favor importe mais músicas para garantir a rotação.");
    }

    if (tracks.filter(t => t.type === TrackType.MUSIC).length < 2) {
       alert("Importe pelo menos 2 músicas.");
       return;
    }
    
    setIsGenerating(true);
    setPlaylist([]);
    setDownloadWavUrl(null);
    setMasterBuffer(null);
    setStatusMessage("IA analisando biblioteca e regras de rotação (60min)...");

    try {
      const recentTracks = history
        .slice(0, 5)
        .flatMap(b => b.entries)
        .map(e => e.trackName);

      const result = await generatePlaylistStructure(tracks, settings, recentTracks);
      setPlaylist(result);
      setStatusMessage("Agendamento gerado. Personalize ou Mixe.");
    } catch (e) {
      setStatusMessage("Erro ao gerar playlist. Verifique a API Key.");
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMix = async () => {
    if (playlist.length === 0) return;

    setIsMixing(true);
    setStatusMessage("Removendo silêncio (-25dB/-28dB), Normalizando e Mixando (-15dB)...");

    try {
      const buffer = await audioProcessor.generateMasterBuffer(playlist, tracks, settings);
      setMasterBuffer(buffer);

      const wavBlob = audioProcessor.bufferToWav(buffer);
      
      // Cleanup previous object URL
      if (previousWavUrlRef.current) {
        URL.revokeObjectURL(previousWavUrlRef.current);
      }

      const url = URL.createObjectURL(wavBlob);
      previousWavUrlRef.current = url;
      setDownloadWavUrl(url);
      
      // Save to History
      const newBlock: BlockHistory = {
          id: simpleId(),
          name: `Bloco_${new Date().toLocaleDateString()}_${new Date().toLocaleTimeString()}`,
          date: new Date().toISOString(),
          entries: playlist,
          totalDuration: settings.targetBlockDuration
      };
      setHistory(prev => [newBlock, ...prev].slice(0, 10));

      setStatusMessage("Mixagem completa! Pronto para download.");
    } catch (e) {
      setStatusMessage("Erro durante a mixagem.");
      console.error(e);
    } finally {
      setIsMixing(false);
    }
  };

  const handleDownloadMp3 = async () => {
    if (!masterBuffer) return;
    setIsEncodingMp3(true);
    setStatusMessage("Codificando MP3 320kbps (LameJS)...");
    
    // Give UI thread a tick to update message
    setTimeout(async () => {
        try {
            const mp3Blob = await audioProcessor.bufferToMp3(masterBuffer);
            const url = URL.createObjectURL(mp3Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "autodj-broadcast-master.mp3";
            a.click();
            
            // Clean up later to allow download to start
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            setStatusMessage("Download MP3 iniciado.");
        } catch (e) {
            console.error(e);
            setStatusMessage("Erro ao codificar MP3. Verifique se lame.min.js carregou.");
        } finally {
            setIsEncodingMp3(false);
        }
    }, 100);
  };

  const handleSavePlaylist = useCallback(() => {
    if (playlist.length === 0) return;
    
    const defaultName = `playlist_${new Date().toLocaleDateString().replace(/\//g, '-')}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`;
    const filename = prompt("Nome do arquivo para salvar (sem extensão):", defaultName);
    
    if (filename) {
      const json = JSON.stringify(playlist, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.endsWith('.json') ? filename : filename + '.json'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, [playlist]);

  const getCount = (type: TrackType) => tracks.filter(t => t.type === type).length;
  const getVoiceTracks = () => tracks.filter(t => t.type === TrackType.VOICE);

  const handlePlaylistReorder = (newPl: PlaylistEntry[]) => setPlaylist(newPl);
  const handlePlaylistRemove = (idx: number) => {
      const newPl = [...playlist];
      newPl.splice(idx, 1);
      setPlaylist(newPl);
  };
  const handlePlaylistInsert = (index: number, track: Track) => {
      const newEntry: PlaylistEntry = {
          trackId: track.id,
          trackName: track.name,
          type: track.type,
          crossfadeDuration: 1 
      };
      const newPl = [...playlist];
      newPl.splice(index, 0, newEntry);
      setPlaylist(newPl);
  };

  // --- Views ---

  if (view === 'admin') {
      return (
          <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white transition-colors duration-300">
               <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
                    <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('home')}>
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Mix<span className="text-blue-500">ToPlay</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={toggleTheme} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {isDarkMode ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            )}
                        </button>
                        <button onClick={() => setView('home')} className="text-sm font-bold text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-white">Voltar ao Estúdio</button>
                    </div>
                    </div>
                </header>
              <AdminPanel 
                history={history} 
                users={users}
                onDeleteHistory={(id) => setHistory(h => h.filter(x => x.id !== id))}
                onAddUser={handleAddUser}
                onDeleteUser={handleDeleteUser}
                onLogout={() => { setIsAuthenticated(false); setView('home'); }}
              />
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white pb-20 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Mix<span className="text-blue-500">ToPlay</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
              <button onClick={toggleTheme} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                {isDarkMode ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
              <button 
                onClick={() => isAuthenticated ? setView('admin') : setShowLogin(true)}
                className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                  {isAuthenticated ? "Painel Admin" : "Login Admin"}
              </button>
          </div>
        </div>
      </header>

      {showLogin && (
          <LoginModal 
            onLogin={handleLoginValidation}
            onSuccess={() => { setIsAuthenticated(true); setShowLogin(false); setView('admin'); }}
            onClose={() => setShowLogin(false)}
          />
      )}

      <main className="max-w-6xl mx-auto px-6 py-10">
        
        {/* Intro */}
        <div className="text-center mb-10">
          <h2 className="text-4xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 dark:from-blue-400 dark:via-purple-400 dark:to-amber-400">
            Automação de Rádio Inteligente
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
            Configure seu bloco, faça upload de arquivos, grave locuções e deixe a IA masterizar sua transmissão com regras profissionais de rotação.
          </p>
        </div>

        {/* Config Panel */}
        <ConfigPanel settings={settings} onChange={setSettings} />

        {/* Upload Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <UploadZone 
            type={TrackType.MUSIC} 
            count={getCount(TrackType.MUSIC)}
            onUpload={handleUpload}
            icon={
              <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            }
          />
          <UploadZone 
            type={TrackType.JINGLE} 
            count={getCount(TrackType.JINGLE)}
            onUpload={handleUpload}
            icon={
              <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            }
          />
          <UploadZone 
            type={TrackType.COMMERCIAL} 
            count={getCount(TrackType.COMMERCIAL)}
            onUpload={handleUpload}
            icon={
              <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <UploadZone 
            type={TrackType.OTHER} 
            count={getCount(TrackType.OTHER)}
            onUpload={handleUpload}
            icon={
              <svg className="w-10 h-10 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
          />
        </div>
        
        {/* Recorder / Voice Zone */}
        <div className="mb-10 relative group border-2 border-dashed border-red-200 dark:border-red-500/50 bg-red-50 dark:bg-red-900/5 hover:bg-red-100 dark:hover:bg-red-900/10 rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center h-48 max-w-2xl mx-auto">
            <div className="flex gap-4 items-center">
                <div className="flex flex-col items-center">
                    <UploadZone 
                        type={TrackType.VOICE} 
                        count={0} 
                        onUpload={handleUpload}
                        icon={<span className="hidden"></span>} 
                    />
                        <label className="cursor-pointer mb-2 p-2 bg-gray-200 dark:bg-gray-800 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 transition-colors">
                            Upload OFF
                            <input type="file" className="hidden" accept="audio/*" onChange={(e) => { if(e.target.files) handleUpload(Array.from(e.target.files), TrackType.VOICE); }} />
                        </label>
                </div>

                <div className="h-10 w-[1px] bg-red-200 dark:bg-red-800/50 mx-2"></div>

                <button 
                onClick={handleRecordToggle}
                className={`rounded-full w-14 h-14 flex items-center justify-center transition-all ${isRecording ? 'bg-red-600 animate-pulse shadow-red-500/50 shadow-lg' : 'bg-gray-200 dark:bg-gray-800 hover:bg-red-500 dark:hover:bg-red-600 text-gray-600 dark:text-white'}`}
                >
                    {isRecording ? (
                        <div className="w-4 h-4 bg-white rounded-sm" />
                    ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    )}
                </button>
            </div>
            <h3 className="font-bold text-lg mt-3 text-red-500 dark:text-red-400">Off / Gravação</h3>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
            {getCount(TrackType.VOICE)} faixas
        </p>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col items-center justify-center gap-4 mb-10">
          {statusMessage && (
            <div className="text-sm font-mono text-cyan-700 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-950/30 px-4 py-2 rounded-full border border-cyan-200 dark:border-cyan-900 animate-pulse">
              {statusMessage}
            </div>
          )}
          
          <div className="flex gap-4">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || tracks.length === 0}
              className={`px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-blue-900/20 transition-all transform active:scale-95 ${
                isGenerating || tracks.length === 0
                  ? "bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {isGenerating ? "Consultando IA..." : "1. Gerar Agendamento"}
            </button>

            {playlist.length > 0 && (
              <button
                onClick={handleMix}
                disabled={isMixing}
                className={`px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-purple-900/20 transition-all transform active:scale-95 ${
                  isMixing
                    ? "bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white"
                }`}
              >
                {isMixing ? "Processando..." : "2. Mixar & Masterizar"}
              </button>
            )}
          </div>

          {downloadWavUrl && (
            <div className="mt-6 flex flex-col items-center gap-4 bg-white dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-md">
                <audio ref={audioRef} src={downloadWavUrl} controls className="w-80 h-10 mb-2 rounded border border-gray-200 dark:border-gray-700" />
                <div className="flex gap-4">
                    <a
                        href={downloadWavUrl}
                        download="autodj-broadcast-master.wav" 
                        className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold text-sm shadow-xl flex items-center"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Master WAV
                    </a>
                    
                    <button
                        onClick={handleDownloadMp3}
                        disabled={isEncodingMp3}
                        className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-green-900/40 flex items-center disabled:opacity-50"
                    >
                        {isEncodingMp3 ? (
                            <span className="flex items-center"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> Codificando...</span>
                        ) : (
                            <>
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                                Baixar MP3 (320kbps)
                            </>
                        )}
                    </button>
                </div>
           </div>
          )}
        </div>

        {/* Playlist Visualization */}
        <PlaylistView 
            playlist={playlist} 
            tracks={tracks}
            availableVoiceTracks={getVoiceTracks()}
            onReorder={handlePlaylistReorder}
            onRemove={handlePlaylistRemove}
            onInsert={handlePlaylistInsert}
            onPreview={(b) => { /* Preview handled by main audio player now */ }}
            onSave={handleSavePlaylist}
        />

      </main>
    </div>
  );
}