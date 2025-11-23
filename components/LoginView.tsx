import React, { useState } from 'react';
import { GoogleIcon, BookIcon } from './Icons';
import { UserProfile } from '../types';

interface LoginViewProps {
  onLogin: (user: UserProfile) => void;
}

const LOGO_URL = "https://cdn-icons-png.flaticon.com/512/2232/2232688.png";

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    // Simulating a Google Login object
    const user: UserProfile = {
      email: email.trim(),
      name: name.trim(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name.trim())}&background=6366f1&color=fff`,
    };

    onLogin(user);
  };

  return (
    <div className="h-screen w-screen bg-darker flex items-center justify-center relative overflow-hidden">
      {/* Background Effects */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.1,
          filter: 'grayscale(80%)'
        }}
      />
      
      <div className="relative z-10 w-full max-w-md p-8 bg-surface/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-transparent rounded-2xl flex items-center justify-center mb-4 transform rotate-3">
            <img src={LOGO_URL} alt="Logo" className="w-full h-full drop-shadow-lg" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Bem-vindo ao<br/>ESTUDE MAIS</h1>
          <p className="text-slate-400 text-sm">Organize seus estudos com Inteligência Artificial.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Nome</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como você se chama?"
              className="w-full bg-darker/50 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Email do Google</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@gmail.com"
              className="w-full bg-darker/50 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
            />
          </div>

          <button 
            type="submit"
            className="w-full mt-4 bg-white hover:bg-slate-100 text-slate-900 font-medium py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 group"
          >
            <GoogleIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span>Entrar com Google</span>
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-700/50 text-center">
           <p className="text-xs text-slate-500">
             Suas matérias e PDFs serão salvos separadamente para este e-mail neste dispositivo.
           </p>
        </div>
      </div>
    </div>
  );
};

export default LoginView;