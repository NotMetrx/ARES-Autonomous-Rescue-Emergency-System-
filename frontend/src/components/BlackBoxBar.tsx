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
    <div className="bg-[#0b1220] border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-amber-950 border border-amber-600 flex items-center justify-center text-amber-300 font-bold">
          <Film className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-bold text-slate-200">Reproductor Táctico de Caja Negra (Flight Recorder)</h3>
          <p className="text-[11px] text-slate-400">Revisión forense After-Action Review (AAR) para jueces</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 flex-wrap gap-2">
        {/* Session selector */}
        <select
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none"
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
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition shadow-md"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>PAUSAR / DETENER</span>
          </button>
        ) : (
          <button
            onClick={handleStartReplay}
            disabled={!selectedSession}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-md"
          >
            <Play className="w-3.5 h-3.5" />
            <span>REPRODUCIR</span>
          </button>
        )}

        {/* Speed multiplier buttons */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
          {[0.5, 1.0, 2.0, 5.0].map(s => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={`px-2 py-1 font-mono font-bold text-[11px] rounded-lg transition ${
                speed === s ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
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
