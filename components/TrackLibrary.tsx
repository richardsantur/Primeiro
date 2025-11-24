import React from 'react';
import { Track, TrackType } from '../types';

interface TrackLibraryProps {
  tracks: Track[];
  onRemoveTrack: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TrackLibrary: React.FC<TrackLibraryProps> = ({ 
  tracks, 
  onRemoveTrack, 
  searchQuery, 
  onSearchChange 
}) => {
  if (tracks.length === 0) return null;

  const filteredTracks = tracks.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeColor = (t: TrackType) => {
    switch(t) {
      case TrackType.MUSIC: return "text-blue-500 bg-blue-50 dark:bg-blue-900/20";
      case TrackType.JINGLE: return "text-purple-500 bg-purple-50 dark:bg-purple-900/20";
      case TrackType.COMMERCIAL: return "text-amber-500 bg-amber-50 dark:bg-amber-900/20";
      case TrackType.VOICE: return "text-red-500 bg-red-50 dark:bg-red-900/20";
      case TrackType.OTHER: return "text-teal-500 bg-teal-50 dark:bg-teal-900/20";
      case TrackType.OPENING_CLOSING: return "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="mb-10 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Biblioteca de Áudio ({filteredTracks.length})
        </h3>
        <div className="relative w-full md:w-64">
          <input 
            type="text" 
            placeholder="Filtrar por nome ou artista..." 
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto custom-scrollbar">
        {filteredTracks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm italic">
            {tracks.length > 0 ? "Nenhum arquivo encontrado com este filtro." : "Nenhum arquivo importado."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTracks.map(track => (
              <div key={track.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${getTypeColor(track.type)}`}>
                    {track.type.substring(0, 3)}
                  </span>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate" title={track.name}>
                      {track.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {Math.floor(track.duration)}s
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => onRemoveTrack(track.id)}
                  className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                  title="Remover da biblioteca"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};