import React, { useEffect } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { 
  Zap, 
  Volume2, 
  VolumeX, 
  CircleDot, 
  Sun, 
  Moon, 
  Layers, 
  Map as MapIcon, 
  Camera as CameraIcon, 
  Grid2X2,
  Wind,
  ShieldCheck,
  Cpu,
  Radio,
  Bot
} from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';

export const Header: React.FC = () => {
  const { 
    wsConnected, 
    wsHz, 
    viewMode, 
    setViewMode, 
    theme, 
    toggleTheme, 
    voiceEnabled, 
    toggleVoice,
    recordingBlackBox,
    setRecordingBlackBox,
    recordingDurationSec,
    incrementRecTimer,
    aiStatus,
    wind,
    antiJamming,
    copilotOpen,
    toggleCopilot
  } = useSwarmStore();

  useEffect(() => {
    let interval: number;
    if (recordingBlackBox) {
      interval = window.setInterval(() => {
        incrementRecTimer();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recordingBlackBox, incrementRecTimer]);

  const toggleRecording = async () => {
    const nextRec = !recordingBlackBox;
    setRecordingBlackBox(nextRec);
    try {
      if (nextRec) {
        await fetch('/api/v1/recorder/start?session_name=ARES_LIVE_OPS', { method: 'POST' });
        tacticalVoice.speak('Caja negra iniciada. Grabando telemetría de vuelo en disco', 'rec');
      } else {
        await fetch('/api/v1/recorder/stop', { method: 'POST' });
        tacticalVoice.speak('Caja negra detenida. Registro de vuelo guardado', 'rec');
      }
    } catch (e) {
      console.warn('Recorder toggle error:', e);
    }
  };

  const formatSec = (totalSec: number) => {
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.15); }
        }
        @keyframes redGlowPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(244, 63, 94, 0.2), inset 0 0 8px rgba(244, 63, 94, 0.1); }
          50% { box-shadow: 0 0 16px rgba(244, 63, 94, 0.5), inset 0 0 12px rgba(244, 63, 94, 0.2); }
        }
      `}</style>
      <header className="backdrop-blur-2xl bg-slate-900/60 ring-1 ring-white/[0.08] rounded-3xl px-5 py-3 shadow-2xl shadow-black/40 flex flex-wrap justify-between items-center gap-4 transition-all duration-300 ease-out z-50">
        {/* Brand & Fleet Info */}
        <div className="flex items-center space-x-4">
          <div 
            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20"
            style={{ animation: 'float 4s ease-in-out infinite' }}
          >
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-[15px] font-semibold tracking-wide bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                BIOSCAOUT TACTICAL C2
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-medium tracking-wide rounded-full backdrop-blur-md bg-white/5 text-blue-200 ring-1 ring-white/10 shadow-inner">
                SWARM v3.0
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-medium tracking-wide rounded-full backdrop-blur-md bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20 shadow-inner">
                EN VUELO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5 tracking-wide">
              Control de Enjambre 3D • Evasión Sub-Milisegundo • ATAK & MAVLink Gateway
            </p>
          </div>
        </div>

        {/* Auxiliary Tactical Status Badges */}
        <div className="flex items-center space-x-2.5 text-xs">
          {/* WebSocket Telemetry Status */}
          <div className="flex items-center space-x-2 backdrop-blur-xl bg-white/5 px-3.5 py-1.5 rounded-full ring-1 ring-white/10 shadow-inner transition-all duration-300">
            <span 
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-500'}`} 
              style={{ animation: wsConnected ? 'breathe 3s ease-in-out infinite' : 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
            />
            <span className="text-slate-400 font-medium">WS:</span>
            <span className={`font-semibold ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {wsConnected ? 'CONECTADO' : 'RECONECTANDO'}
            </span>
            <span className="font-mono text-blue-300 font-medium ml-1.5 opacity-80">{wsHz} Hz</span>
          </div>

          {/* AI Edge Engine */}
          {aiStatus && (
            <div className="hidden xl:flex items-center space-x-2 backdrop-blur-xl bg-white/5 px-3.5 py-1.5 rounded-full ring-1 ring-white/10 shadow-inner transition-all duration-300">
              <Cpu className="w-3.5 h-3.5 text-blue-400 opacity-80" />
              <span className="font-medium text-blue-200">{aiStatus.model_name}</span>
              <span className="font-mono text-slate-300 ml-1">{aiStatus.fps.toFixed(1)} FPS</span>
              <span className="text-white/20 mx-1">|</span>
              <span className="font-mono text-slate-400">{aiStatus.gpu_temp_c.toFixed(1)}°C</span>
            </div>
          )}

          {/* Wind Status */}
          <div className="hidden lg:flex items-center space-x-2 backdrop-blur-xl bg-white/5 px-3.5 py-1.5 rounded-full ring-1 ring-white/10 shadow-inner transition-all duration-300">
            <Wind className="w-3.5 h-3.5 text-sky-400 opacity-80" />
            <span className="text-slate-400 font-medium">Viento:</span>
            <span className="font-mono font-medium text-sky-200">
              {wind.speed_ms.toFixed(1)} m/s @ {wind.direction_deg}°
            </span>
          </div>

          {/* EW / Jamming Status */}
          <div className="hidden md:flex items-center space-x-2 backdrop-blur-xl bg-white/5 px-3.5 py-1.5 rounded-full ring-1 ring-white/10 shadow-inner transition-all duration-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 opacity-80" />
            <span className="text-slate-400 font-medium">EW:</span>
            <span className="font-medium text-emerald-300">{antiJamming?.ew_environment || 'NOMINAL'}</span>
          </div>
        </div>

        {/* View Mode & Tactical Controls */}
        <div className="flex items-center space-x-3">
          {/* Airspace View Mode Switcher - iOS Segmented Control Style */}
          <div className="flex items-center backdrop-blur-2xl bg-black/20 p-1 rounded-full ring-1 ring-white/5 shadow-inner">
            {[
              { id: '2d', icon: Radio, label: '2D Radar' },
              { id: '3d', icon: Layers, label: '3D Real' },
              { id: 'map', icon: MapIcon, label: 'Mapa' },
              { id: 'camera', icon: CameraIcon, label: 'Cámara' },
              { id: 'split', icon: Grid2X2, label: 'Split' },
            ].map((mode) => {
              const Icon = mode.icon;
              const isActive = viewMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                    isActive 
                      ? 'bg-white/15 text-white shadow-md ring-1 ring-white/20' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-300' : 'text-slate-500'}`} />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tactical AI Copilot Toggle */}
          <button
            onClick={() => {
              tacticalAudio.playButtonBeep();
              toggleCopilot();
            }}
            className={`group flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 relative overflow-hidden ${
              copilotOpen
                ? 'text-white'
                : 'backdrop-blur-md bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white ring-1 ring-white/10'
            }`}
            title="Abrir Copiloto Táctico IA con reconocimiento de voz y lenguaje natural"
          >
            {copilotOpen && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 opacity-100" />
            )}
            {copilotOpen && (
              <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-xl" />
            )}
            <Bot className={`w-4 h-4 relative z-10 transition-colors duration-300 ${copilotOpen ? 'text-blue-300' : 'text-slate-400 group-hover:text-blue-300'}`} />
            <span className="hidden sm:inline relative z-10">COPILOTO IA</span>
          </button>

          {/* Tactical Voice Toggle */}
          <button
            onClick={toggleVoice}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 backdrop-blur-md ring-1 ${
              voiceEnabled
                ? 'bg-blue-500/10 ring-blue-500/30 text-blue-200'
                : 'bg-white/5 ring-white/10 text-slate-400 hover:text-slate-300 hover:bg-white/10'
            }`}
            title="Voz Táctica Automática (V)"
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden md:inline">{voiceEnabled ? 'VOZ ON' : 'VOZ OFF'}</span>
          </button>

          {/* Black Box REC Button */}
          <button
            onClick={toggleRecording}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 backdrop-blur-md ring-1 ${
              recordingBlackBox
                ? 'bg-rose-500/10 ring-rose-500/30 text-rose-300'
                : 'bg-white/5 ring-white/10 text-slate-400 hover:text-slate-300 hover:bg-white/10'
            }`}
            style={recordingBlackBox ? { animation: 'redGlowPulse 2s ease-in-out infinite' } : {}}
            title="Grabación Caja Negra en Disco"
          >
            <CircleDot className={`w-3.5 h-3.5 ${recordingBlackBox ? 'text-rose-400' : ''}`} />
            <span>{recordingBlackBox ? `REC ${formatSec(recordingDurationSec)}` : 'REC'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 backdrop-blur-md bg-white/5 ring-1 ring-white/10 text-slate-400 hover:text-white hover:bg-white/10"
            title="Alternar Modo Visual"
          >
            {theme === 'dark' && <Moon className="w-4 h-4 text-blue-200" />}
            {theme === 'nvg' && <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />}
            {theme === 'amber' && <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />}
            {theme === 'light' && <Sun className="w-4 h-4 text-amber-200" />}
          </button>
        </div>
      </header>
    </>
  );
};
