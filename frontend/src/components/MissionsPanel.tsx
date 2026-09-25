import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { Compass, Download, ShieldAlert, RefreshCw, Zap, Play, CheckCircle2 } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

export const MissionsPanel: React.FC = () => {
  const { drones } = useSwarmStore();
  const [widthM, setWidthM] = useState(120);
  const [heightM, setHeightM] = useState(160);
  const [altitudeM, setAltitudeM] = useState(30);
  const [dronesCount, setDronesCount] = useState(3);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateGrid = async () => {
    setIsGenerating(true);
    try {
      const payload = {
        center_lat: -12.046374,
        center_lon: -77.042793,
        width_m: widthM,
        height_m: heightM,
        flight_alt_m: altitudeM,
        drones_count: dronesCount,
      };

      const res = await fetch('/api/v1/missions/generate-search-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setMissionStatus(`Misión ${data.mission_id} generada con ${data.total_waypoints} waypoints`);
        tacticalVoice.speak(`Misión de búsqueda Boustrophedon generada con ${data.total_waypoints} waypoints distribuidos`, 'sar');
      } else {
        setMissionStatus('Error al generar la misión');
      }
    } catch (e) {
      setMissionStatus('Fallo de red con el C2');
    } finally {
      setIsGenerating(false);
    }
  };

  const injectChaosFailure = async (droneId: string) => {
    try {
      await fetch(`/api/v1/chaos/inject-drone-failure?drone_id=${droneId}`, { method: 'POST' });
      tacticalVoice.speak(`Falla de motor simulada en ${droneId}. Algoritmo autocurativo activado`, 'chaos');
    } catch (e) {
      console.warn(e);
    }
  };

  const injectBatteryDrain = async (droneId: string) => {
    try {
      await fetch(`/api/v1/chaos/inject-battery-drain?drone_id=${droneId}&target_battery=15.0`, { method: 'POST' });
      tacticalVoice.speak(`Batería crítica inducida en ${droneId}. Evaluando relevo autónomo`, 'chaos');
    } catch (e) {
      console.warn(e);
    }
  };

  const restoreFleet = async () => {
    try {
      await fetch('/api/v1/chaos/restore-fleet', { method: 'POST' });
      tacticalVoice.speak('Flota restaurada a estado nominal completo', 'chaos');
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div className="bg-[#0b1220] border border-slate-800 rounded-2xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Compass className="w-5 h-5 text-cyan-400" />
          <h2 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            Planificador de Misiones SAR (Boustrophedon)
          </h2>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
          AUTÓNOMO
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Generador de Cuadrícula */}
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center">
            <Play className="w-3.5 h-3.5 mr-1.5 text-cyan-400" /> Parámetros del Área de Búsqueda
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Ancho (m)</label>
              <input
                type="number"
                value={widthM}
                onChange={e => setWidthM(parseInt(e.target.value) || 50)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Largo (m)</label>
              <input
                type="number"
                value={heightM}
                onChange={e => setHeightM(parseInt(e.target.value) || 50)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Altitud de Vuelo (m)</label>
              <input
                type="number"
                value={altitudeM}
                onChange={e => setAltitudeM(parseInt(e.target.value) || 10)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Drones Asignados</label>
              <select
                value={dronesCount}
                onChange={e => setDronesCount(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 outline-none"
              >
                <option value={1}>1 Drone</option>
                <option value={2}>2 Drones</option>
                <option value={3}>3 Drones (Enjambre)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerateGrid}
            disabled={isGenerating}
            className="w-full py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-extrabold text-xs rounded-xl transition shadow-md flex items-center justify-center space-x-1.5"
          >
            <Zap className="w-4 h-4" />
            <span>{isGenerating ? 'GENERANDO WAYPOINTS...' : 'GENERAR MISIÓN BOUSTROPHEDON'}</span>
          </button>

          {missionStatus && (
            <div className="mt-2.5 p-2 bg-cyan-950/80 border border-cyan-700 text-cyan-200 text-[11px] rounded-lg flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>{missionStatus}</span>
            </div>
          )}
        </div>

        {/* Chaos Engineering & Pruebas ante Jueces */}
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-amber-400 flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-400" /> Pruebas de Resiliencia (Chaos Engineering)
              </h3>
              <button
                onClick={restoreFleet}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded flex items-center space-x-1"
                title="Restaurar toda la flota a estado sano"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Restaurar Flota</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Demuestra a los jueces la capacidad de auto-curación del enjambre y relevo autónomo por batería crítica.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-300 font-semibold">Simular Falla de Motor (ARES-02)</span>
                <button
                  onClick={() => injectChaosFailure('ARES-02')}
                  className="px-2.5 py-1 bg-rose-950 border border-rose-600 hover:bg-rose-900 text-rose-200 font-bold rounded text-[11px] transition"
                >
                  Inyectar Falla
                </button>
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-300 font-semibold">Drenar Batería a 15% (ARES-01)</span>
                <button
                  onClick={() => injectBatteryDrain('ARES-01')}
                  className="px-2.5 py-1 bg-amber-950 border border-amber-600 hover:bg-amber-900 text-amber-200 font-bold rounded text-[11px] transition"
                >
                  Test Relevo
                </button>
              </div>
            </div>
          </div>

          {/* Export Waypoints */}
          <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">Exportar plan a autopilotos PX4:</span>
            <a
              href="/api/v1/missions/ARES-MISSION-01/export/qgc"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>QGC .waypoints</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
