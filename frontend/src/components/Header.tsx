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
  Radio
} from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

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
    antiJamming
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
    <header className="bg-[#0b1220] border border-cyan-500/20 rounded-2xl px-4 py-2.5 shadow-xl backdrop-blur-md flex flex-wrap justify-between items-center gap-3">
      {/* Brand & Fleet Info */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 font-black text-xl">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
              ARES TACTICAL C2
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-700/60 shadow-sm">
              SWARM v3.0
            </span>
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-600 shadow-sm">
              EN VUELO
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Control de Enjambre 3D • Evasión Sub-Milisegundo • ATAK & MAVLink Gateway
          </p>
        </div>
      </div>

      {/* Auxiliary Tactical Status Badges */}
      <div className="flex items-center space-x-2 text-xs">
        {/* WebSocket Telemetry Status */}
        <div className="flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/70">
          <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-400 shadow-glow-emerald' : 'bg-rose-500 animate-ping'}`} />
          <span className="text-slate-400 font-medium">WS:</span>
          <span className={`font-bold ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
            {wsConnected ? 'CONECTADO' : 'RECONECTANDO'}
          </span>
          <span className="font-mono text-cyan-300 font-bold ml-1">{wsHz} Hz</span>
        </div>

        {/* AI Edge Engine */}
        {aiStatus && (
          <div className="hidden xl:flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/70">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-cyan-300">{aiStatus.model_name}</span>
            <span className="font-mono text-amber-300 font-bold">{aiStatus.fps.toFixed(1)} FPS</span>
            <span className="text-slate-500">|</span>
            <span className="font-mono text-slate-300">{aiStatus.gpu_temp_c.toFixed(1)}°C</span>
          </div>
        )}

        {/* Wind Status */}
        <div className="hidden lg:flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/70">
          <Wind className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-slate-400">Viento:</span>
          <span className="font-mono font-bold text-sky-300">
            {wind.speed_ms.toFixed(1)} m/s @ {wind.direction_deg}°
          </span>
        </div>

        {/* EW / Jamming Status */}
        <div className="hidden md:flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/70">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">EW:</span>
          <span className="font-bold text-emerald-400">{antiJamming?.ew_environment || 'NOMINAL'}</span>
        </div>
      </div>

      {/* View Mode & Tactical Controls */}
      <div className="flex items-center space-x-2">
        {/* Airspace View Mode Switcher */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-700/70">
          <button
            onClick={() => setViewMode('2d')}
            className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-black rounded-lg transition ${
              viewMode === '2d' 
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/25 ring-1 ring-cyan-400' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-cyan-300" />
            <span>2D Radar</span>
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === '3d' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D Real</span>
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === 'map' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Mapa</span>
          </button>
          <button
            onClick={() => setViewMode('camera')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === 'camera' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CameraIcon className="w-3.5 h-3.5" />
            <span>Cámara</span>
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === 'split' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Grid2X2 className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
        </div>

        {/* Tactical Voice Toggle */}
        <button
          onClick={toggleVoice}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-sm ${
            voiceEnabled
              ? 'bg-slate-900 border-slate-700 text-cyan-300 hover:bg-slate-800'
              : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
          }`}
          title="Voz Táctica Automática (V)"
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          <span>{voiceEnabled ? 'VOZ ON' : 'VOZ OFF'}</span>
        </button>

        {/* Black Box REC Button */}
        <button
          onClick={toggleRecording}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-sm ${
            recordingBlackBox
              ? 'bg-rose-900 border-rose-500 text-rose-100 animate-pulse'
              : 'bg-rose-950/70 hover:bg-rose-900 border-rose-700 text-rose-200'
          }`}
          title="Grabación Caja Negra en Disco"
        >
          <CircleDot className="w-3.5 h-3.5 text-rose-400" />
          <span>{recordingBlackBox ? `REC ${formatSec(recordingDurationSec)}` : 'REC CAJA NEGRA'}</span>
        </button>

        {/* Theme Toggle (Night Ops / Sunlight Field) */}
        <button
          onClick={toggleTheme}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white transition text-xs font-bold"
          title="Alternar Modo Noche OLED / Modo Luz Campo"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
          <span className="hidden sm:inline">{theme === 'dark' ? 'MODO LUZ' : 'MODO NOCHE'}</span>
        </button>
      </div>
    </header>
  );
};
