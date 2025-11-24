import React from 'react';
import { AppSettings } from '../types';

interface ConfigPanelProps {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ settings, onChange }) => {
  const handleChange = (key: keyof AppSettings, value: number) => {
    let finalValue = value;
    
    // Validation for Global Fades
    if (key === 'globalFadeIn' || key === 'globalFadeOut') {
        if (finalValue < 0) finalValue = 0;
        if (finalValue > 10) finalValue = 10;
    }

    onChange({ ...settings, [key]: finalValue });
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 mb-8 shadow-sm">
      <h3 className="text-gray-800 dark:text-white font-bold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        Regras de Geração (Rotação 60min Auto)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Duração do Bloco (min)</label>
          <input 
            type="number" 
            value={settings.targetBlockDuration}
            onChange={(e) => handleChange('targetBlockDuration', Number(e.target.value))}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Comerciais por Bloco</label>
          <input 
            type="number" 
            value={settings.commercialsPerBlock}
            onChange={(e) => handleChange('commercialsPerBlock', Number(e.target.value))}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Vinheta a cada (Músicas)</label>
          <input 
            type="number" 
            value={settings.jingleFrequency}
            onChange={(e) => handleChange('jingleFrequency', Number(e.target.value))}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
        
        <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-4 md:col-span-2 lg:col-span-3">
             <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Configurações de Mixagem</h4>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase block mb-1">Crossfade Padrão (s)</label>
                    <div className="flex items-center gap-2">
                        <input 
                        type="range" 
                        min="0" max="10" step="0.5"
                        value={settings.defaultCrossfade}
                        onChange={(e) => handleChange('defaultCrossfade', Number(e.target.value))}
                        className="w-full h-2 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                        <span className="text-sm font-mono w-8 text-gray-700 dark:text-gray-300">{settings.defaultCrossfade}s</span>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase block mb-1">Fade In Global (s)</label>
                    <input 
                        type="number" 
                        min="0" max="10" step="0.1"
                        value={settings.globalFadeIn}
                        onChange={(e) => handleChange('globalFadeIn', parseFloat(e.target.value))}
                        className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:border-green-500 transition-colors text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Limite: 0 a 10s</p>
                </div>
                <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase block mb-1">Fade Out Global (s)</label>
                    <input 
                        type="number" 
                        min="0" max="10" step="0.1"
                        value={settings.globalFadeOut}
                        onChange={(e) => handleChange('globalFadeOut', parseFloat(e.target.value))}
                        className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:border-green-500 transition-colors text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Limite: 0 a 10s</p>
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};