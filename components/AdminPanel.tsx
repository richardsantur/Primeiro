import React, { useState } from 'react';
import { BlockHistory, User } from '../types';

interface AdminPanelProps {
  history: BlockHistory[];
  users: User[];
  onDeleteHistory: (id: string) => void;
  onAddUser: (user: User) => void;
  onDeleteUser: (username: string) => void;
  onLogout: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ 
  history, 
  users, 
  onDeleteHistory, 
  onAddUser, 
  onDeleteUser, 
  onLogout 
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'users'>('history');
  
  // New User Form State
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');

  const exportM3U = (block: BlockHistory) => {
    let content = "#EXTM3U\n";
    block.entries.forEach(entry => {
        content += `#EXTINF:-1,${entry.trackName}\n${entry.trackName}.mp3\n`;
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${block.name}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autodj_history_backup.json`;
      a.click();
      URL.revokeObjectURL(url);
  }

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(newUser && newPass) {
        onAddUser({ username: newUser, password: newPass, role: 'admin' });
        setNewUser('');
        setNewPass('');
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Administração</h2>
        <button onClick={onLogout} className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-white transition-colors">Sair</button>
      </div>

      <div className="flex gap-4 mb-6">
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            Histórico
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            Usuários
          </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm min-h-[400px]">
        
        {activeTab === 'history' && (
            <>
                <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white">Blocos Gerados</h3>
                    <button onClick={downloadJson} className="flex items-center gap-2 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Backup JSON
                    </button>
                </div>
                
                {history.length === 0 ? (
                    <div className="p-10 text-center text-gray-500 dark:text-gray-400">Nenhum bloco gerado ainda.</div>
                ) : (
                    <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-xs uppercase">
                        <tr>
                        <th className="px-6 py-4">Nome do Bloco</th>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">Faixas</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {history.map((block) => (
                        <tr key={block.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{block.name}</td>
                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">{new Date(block.date).toLocaleString()}</td>
                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">{block.entries.length} items</td>
                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button 
                                onClick={() => exportM3U(block)}
                                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded transition-colors"
                                title="Baixar lista .m3u para players externos">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Exportar .M3U
                            </button>
                            <button 
                                onClick={() => onDeleteHistory(block.id)}
                                className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 text-xs font-bold border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Excluir
                            </button>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                )}
            </>
        )}

        {activeTab === 'users' && (
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* List Users */}
                    <div className="md:col-span-2">
                        <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4">Usuários Cadastrados</h3>
                        <div className="bg-gray-50 dark:bg-gray-950 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                             <table className="w-full text-left">
                                <thead className="text-gray-500 dark:text-gray-400 text-xs uppercase border-b border-gray-200 dark:border-gray-800">
                                    <tr>
                                        <th className="px-4 py-3">Usuário</th>
                                        <th className="px-4 py-3">Função</th>
                                        <th className="px-4 py-3 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u, i) => (
                                        <tr key={i} className="border-b border-gray-200 dark:border-gray-800 last:border-0">
                                            <td className="px-4 py-3 font-medium">{u.username}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500">{u.role}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button 
                                                    onClick={() => onDeleteUser(u.username)}
                                                    className="text-red-500 hover:text-red-700 text-xs font-bold">
                                                    Remover
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                        </div>
                    </div>

                    {/* Add User */}
                    <div>
                        <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4">Novo Usuário</h3>
                        <form onSubmit={handleUserSubmit} className="space-y-4 bg-gray-50 dark:bg-gray-950 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome de Usuário</label>
                                <input 
                                    type="text" 
                                    value={newUser}
                                    onChange={e => setNewUser(e.target.value)}
                                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label>
                                <input 
                                    type="password" 
                                    value={newPass}
                                    onChange={e => setNewPass(e.target.value)}
                                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 text-sm"
                                    required
                                />
                            </div>
                            <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded text-sm transition-colors">
                                Adicionar
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};