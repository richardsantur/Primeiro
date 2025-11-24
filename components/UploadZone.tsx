import React, { useRef, useState } from 'react';
import { TrackType } from '../types';

interface UploadZoneProps {
  type: TrackType;
  onUpload: (files: File[], type: TrackType) => void;
  count: number;
  icon: React.ReactNode;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ type, onUpload, count, icon }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const validateAndProcess = async (files: File[]) => {
    // Client-side Validation
    const validAudioFiles = files.filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i));
    const invalidCount = files.length - validAudioFiles.length;

    if (invalidCount > 0) {
      setErrorMsg(`Arquivo inválido detectado. Apenas áudio permitido.`);
      setTimeout(() => setErrorMsg(null), 3000);
      
      if (validAudioFiles.length === 0) return;
    }

    setIsUploading(true);
    // Simulate processing delay for UI feedback
    await new Promise(r => setTimeout(r, 600)); 
    onUpload(validAudioFiles, type);
    setIsUploading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcess(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Explicitly cast to File[] to avoid TS inference issues with FileList in some environments
      const fileList = Array.from(e.dataTransfer.files) as File[];
      validateAndProcess(fileList);
    }
  };

  const getLabel = (t: TrackType) => {
    switch(t) {
      case TrackType.MUSIC: return "Músicas";
      case TrackType.JINGLE: return "Vinhetas";
      case TrackType.COMMERCIAL: return "Comerciais";
      case TrackType.VOICE: return "Off / Locução";
      case TrackType.OTHER: return "Outros / Quadros";
      case TrackType.OPENING_CLOSING: return "Abertura / Encerramento";
      default: return "Áudio";
    }
  };

  const getColor = (t: TrackType, drag: boolean, error: boolean) => {
    if (error) return "bg-red-50 border-red-500 animate-pulse";
    const base = drag ? "bg-gray-100 dark:bg-gray-800 scale-105 shadow-xl" : "bg-transparent";
    switch(t) {
      case TrackType.MUSIC: return `${base} border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400`;
      case TrackType.JINGLE: return `${base} border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400`;
      case TrackType.COMMERCIAL: return `${base} border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400`;
      case TrackType.VOICE: return `${base} border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400`;
      case TrackType.OTHER: return `${base} border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-teal-600 dark:text-teal-400`;
      case TrackType.OPENING_CLOSING: return `${base} border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400`;
      default: return base;
    }
  };

  return (
    <div 
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative cursor-pointer group border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center h-48 ${getColor(type, isDragOver, !!errorMsg)}`}
    >
      <input 
        type="file" 
        multiple 
        accept="audio/*" 
        className="hidden" 
        ref={inputRef} 
        onChange={handleChange}
      />
      
      {errorMsg ? (
        <div className="text-center">
            <svg className="w-10 h-10 mx-auto text-red-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm font-bold text-red-600">{errorMsg}</p>
        </div>
      ) : (
        <>
            <div className="mb-3 transform group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-100 text-center leading-tight">{getLabel(type)}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-widest font-semibold">
                {isUploading ? "Validando..." : `${count} carregadas`}
            </p>
        </>
      )}
      
      {isUploading && (
        <div className="absolute bottom-4 left-4 right-4 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 dark:bg-white animate-progress origin-left w-full"></div>
        </div>
      )}
    </div>
  );
};