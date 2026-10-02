import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, FastForward, Film } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

export const BlackBoxBar: React.FC = () => {
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1.0);

  useEffect(() => {
    fetch('/api/v1/recorder/sessions')
      .then(r => r.json())
      .then((data: string[]) => {
        setSessions(data);
        if (data.length > 0) setSelectedSession(data[0]);
      })
      .catch(console.warn);
  }, []);

  const handleStartReplay = async () => {
    if (!selectedSession) return;
    try {
      await fetch(`/api/v1/recorder/replay/start?session_name=${selectedSession}&speed_mult=${speed}`, {
        method: 'POST',
      });
      setIsPlaying(true);
      tacticalVoice.speak(`Reproduciendo sesión de caja negra ${selectedSession} a velocidad ${speed}x`, 'replay');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleStopReplay = async () => {
    try {
      await fetch('/api/v1/recorder/replay/stop', { method: 'POST' });
      setIsPlaying(false);
      tacticalVoice.speak('Reproducción de caja negra finalizada. Volviendo a telemetría en vivo', 'replay');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    setSpeed(newSpeed);
    if (isPlaying) {
      await fetch(`/api/v1/recorder/replay/speed?speed_mult=${newSpeed}`, { method: 'POST' });
    }
  };

  return (
    <div className="relative backdrop-blur-xl bg-slate-900/40 ring-1 ring-white/10 rounded-3xl p-5 shadow-2xl overflow-hidden select-none flex flex-wrap items-center justify-between gap-4 text-xs">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center text-amber-300 font-bold">
          <Film className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-white">Reproductor Táctico de Caja Negra (Flight Recorder)</h3>
          <p className="text-[11px] text-slate-400">Revisión forense After-Action Review (AAR) para jueces</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 flex-wrap gap-2">
        {/* Session selector */}
        <select
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
          className="bg-black/40 border border-white/10 text-white rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-amber-400"
        >
          {sessions.length > 0 ? (
            sessions.map(s => <option key={s} value={s}>{s}</option>)
          ) : (
            <option value="">No hay grabaciones previas</option>
          )}
        </select>

        {/* Play / Pause */}
        {isPlaying ? (
          <button
            onClick={handleStopReplay}
            className="flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-md shadow-amber-600/20"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>PAUSAR / DETENER</span>
          </button>
        ) : (
          <button
            onClick={handleStartReplay}
            disabled={!selectedSession}
            className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-md shadow-blue-500/20"
          >
            <Play className="w-3.5 h-3.5" />
            <span>REPRODUCIR</span>
          </button>
        )}

        {/* Speed multiplier buttons - iOS Segmented Control */}
        <div className="flex items-center bg-black/40 ring-1 ring-white/10 rounded-xl p-0.5">
          {[0.5, 1.0, 2.0, 5.0].map(s => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={`px-3 py-1.5 rounded-lg font-mono text-[11px] font-medium transition-all duration-200 ${
                speed === s
                  ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
