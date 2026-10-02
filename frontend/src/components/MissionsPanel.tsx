import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { 
  Compass, 
  Download, 
  ShieldAlert, 
  RefreshCw, 
  Zap, 
  Play, 
  CheckCircle2, 
  Layers, 
  FileText,
  Navigation,
  RotateCw
} from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';
import { AARReportModal } from './AARReportModal';

export const MissionsPanel: React.FC = () => {
  const { drones } = useSwarmStore();
  const [widthM, setWidthM] = useState(120);
  const [heightM, setHeightM] = useState(160);
  const [altitudeM, setAltitudeM] = useState(30);
  const [dronesCount, setDronesCount] = useState(3);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Formation controls
  const [formationSpacing, setFormationSpacing] = useState(25);
  const [formationMsg, setFormationMsg] = useState<string | null>(null);
  const [activeFormation, setActiveFormation] = useState<string | null>(null);

  // AAR Modal
  const [isAAROpen, setIsAAROpen] = useState(false);

  const handleGenerateGrid = async () => {
    setIsGenerating(true);
    tacticalAudio.playLockOn();
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

  const dispatchFormation = async (formation: 'DELTA' | 'LINE' | 'ECHELON' | 'ORBIT') => {
    setActiveFormation(formation);
    tacticalAudio.playLockOn();
    try {
      const res = await fetch('/api/v1/drones/formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation, spacing_m: formationSpacing }),
      });

      if (res.ok) {
        const data = await res.json();
        setFormationMsg(data.message);
        tacticalVoice.speak(
          `Formación ${formation === 'DELTA' ? 'Delta' : formation === 'LINE' ? 'Línea en Frente' : formation === 'ECHELON' ? 'Echelon' : 'Órbita'} ejecutada con éxito`,
          'formation',
          true
        );
      }
    } catch (e) {
      setFormationMsg('Error al coordinar formación');
    }
  };

  const injectChaosFailure = async (droneId: string) => {
    tacticalAudio.playButtonBeep();
    try {
      await fetch(`/api/v1/chaos/inject-drone-failure?drone_id=${droneId}`, { method: 'POST' });
      tacticalVoice.speak(`Falla de motor simulada en ${droneId}. Algoritmo autocurativo activado`, 'chaos');
    } catch (e) {
      console.warn(e);
    }
  };

  const injectBatteryDrain = async (droneId: string) => {
    tacticalAudio.playButtonBeep();
    try {
      await fetch(`/api/v1/chaos/inject-battery-drain?drone_id=${droneId}&target_battery=15.0`, { method: 'POST' });
      tacticalVoice.speak(`Batería crítica inducida en ${droneId}. Evaluando relevo autónomo`, 'chaos');
    } catch (e) {
      console.warn(e);
    }
  };

  const restoreFleet = async () => {
    tacticalAudio.playButtonBeep();
    try {
      await fetch('/api/v1/chaos/restore-fleet', { method: 'POST' });
      tacticalVoice.speak('Flota restaurada a estado nominal completo', 'chaos');
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div className="relative backdrop-blur-xl bg-slate-900/40 ring-1 ring-white/10 rounded-3xl p-5 shadow-2xl overflow-hidden select-none">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

      {/* Top Header & AAR Report Button */}
      <div className="flex flex-wrap items-center justify-between mb-5 border-b border-white/[0.08] pb-4 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
            <Compass className="w-4.5 h-4.5 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-white tracking-wide">
              Centro de Misiones SAR & Vuelo en Formación
            </h2>
            <p className="text-[11px] text-slate-400">Algoritmos Boustrophedon • Formaciones Autónomas • Informes Forenses AAR</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* AAR Report Generator Trigger */}
          <button
            onClick={() => { tacticalAudio.playButtonBeep(); setIsAAROpen(true); }}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-medium shadow-md shadow-blue-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>GENERAR INFORME AAR</span>
          </button>

          <span className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
            ENJAMBRE ACTIVO
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Generador de Cuadrícula SAR */}
        <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-2xl ring-1 ring-white/[0.06] flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-white mb-3 flex items-center">
              <Play className="w-3.5 h-3.5 mr-1.5 text-cyan-400" /> Búsqueda SAR (Boustrophedon)
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Ancho (m)</label>
                <input
                  type="number"
                  value={widthM}
                  onChange={e => setWidthM(parseInt(e.target.value) || 50)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-white font-mono focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Largo (m)</label>
                <input
                  type="number"
                  value={heightM}
                  onChange={e => setHeightM(parseInt(e.target.value) || 50)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-white font-mono focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Altitud (m)</label>
                <input
                  type="number"
                  value={altitudeM}
                  onChange={e => setAltitudeM(parseInt(e.target.value) || 10)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-white font-mono focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Drones</label>
                <select
                  value={dronesCount}
                  onChange={e => setDronesCount(parseInt(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-white font-mono focus:border-cyan-400 outline-none"
                >
                  <option value={1}>1 Dron</option>
                  <option value={2}>2 Drones</option>
                  <option value={3}>3 Drones (Todo el Swarm)</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={handleGenerateGrid}
              disabled={isGenerating}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md flex items-center justify-center space-x-1.5"
            >
              <Zap className="w-4 h-4" />
              <span>{isGenerating ? 'GENERANDO RUTA...' : 'GENERAR MISIÓN SAR'}</span>
            </button>

            {missionStatus && (
              <div className="mt-2.5 p-2.5 backdrop-blur-md bg-cyan-500/10 ring-1 ring-cyan-500/30 text-cyan-200 text-[11px] rounded-xl flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>{missionStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Coordinador de Vuelo en Formación */}
        <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-2xl ring-1 ring-white/[0.06] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-sky-400" /> Formaciones Tácticas Autónomas
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Espaciado: {formationSpacing}m</span>
            </div>

            <div className="mb-4">
              <input
                type="range"
                min="15"
                max="50"
                step="5"
                value={formationSpacing}
                onChange={e => setFormationSpacing(parseInt(e.target.value))}
                className="w-full accent-cyan-400 h-1 bg-white/10 rounded-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>15m (Cerrado)</span>
                <span>25m (Estándar)</span>
                <span>50m (Amplio)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => dispatchFormation('DELTA')}
                className={`p-2.5 rounded-xl ring-1 text-left font-medium transition-all duration-200 hover:scale-[1.02] flex items-center space-x-2.5 ${
                  activeFormation === 'DELTA'
                    ? 'bg-cyan-500/20 ring-cyan-500/40 text-white shadow-md'
                    : 'bg-white/[0.03] ring-white/[0.06] hover:bg-white/[0.06] text-slate-300'
                }`}
              >
                <span className="text-base text-cyan-400">▲</span>
                <div>
                  <div className="font-semibold text-xs text-white">DELTA (V)</div>
                  <div className="text-[10px] text-slate-400">Punta de flecha</div>
                </div>
              </button>

              <button
                onClick={() => dispatchFormation('LINE')}
                className={`p-2.5 rounded-xl ring-1 text-left font-medium transition-all duration-200 hover:scale-[1.02] flex items-center space-x-2.5 ${
                  activeFormation === 'LINE'
                    ? 'bg-cyan-500/20 ring-cyan-500/40 text-white shadow-md'
                    : 'bg-white/[0.03] ring-white/[0.06] hover:bg-white/[0.06] text-slate-300'
                }`}
              >
                <span className="text-base text-cyan-400">━</span>
                <div>
                  <div className="font-semibold text-xs text-white">LÍNEA EN FRENTE</div>
                  <div className="text-[10px] text-slate-400">Barrido paralelo</div>
                </div>
              </button>

              <button
                onClick={() => dispatchFormation('ECHELON')}
                className={`p-2.5 rounded-xl ring-1 text-left font-medium transition-all duration-200 hover:scale-[1.02] flex items-center space-x-2.5 ${
                  activeFormation === 'ECHELON'
                    ? 'bg-cyan-500/20 ring-cyan-500/40 text-white shadow-md'
                    : 'bg-white/[0.03] ring-white/[0.06] hover:bg-white/[0.06] text-slate-300'
                }`}
              >
                <span className="text-base text-cyan-400">⟋</span>
                <div>
                  <div className="font-semibold text-xs text-white">ECHELON</div>
                  <div className="text-[10px] text-slate-400">Escalonada</div>
                </div>
              </button>

              <button
                onClick={() => dispatchFormation('ORBIT')}
                className={`p-2.5 rounded-xl ring-1 text-left font-medium transition-all duration-200 hover:scale-[1.02] flex items-center space-x-2.5 ${
                  activeFormation === 'ORBIT'
                    ? 'bg-cyan-500/20 ring-cyan-500/40 text-white shadow-md'
                    : 'bg-white/[0.03] ring-white/[0.06] hover:bg-white/[0.06] text-slate-300'
                }`}
              >
                <RotateCw className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="font-semibold text-xs text-white">ÓRBITA 360°</div>
                  <div className="text-[10px] text-slate-400">Anillo perimétrico</div>
                </div>
              </button>
            </div>
          </div>

          {formationMsg && (
            <div className="mt-3 p-2.5 backdrop-blur-md bg-sky-500/10 ring-1 ring-sky-500/30 text-sky-200 text-[11px] rounded-xl">
              {formationMsg}
            </div>
          )}
        </div>

        {/* 3. Chaos Engineering & Resiliencia */}
        <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-2xl ring-1 ring-white/[0.06] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-amber-400 flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-400" /> Pruebas de Resiliencia (Chaos)
              </h3>
              <button
                onClick={restoreFleet}
                className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-200 text-[10px] font-medium rounded-lg flex items-center space-x-1 transition hover:scale-105 active:scale-95"
                title="Restaurar toda la flota a estado sano"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Restaurar Flota</span>
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 bg-black/30 rounded-xl ring-1 ring-white/[0.06] text-xs">
                <span className="text-slate-300 font-medium">Falla de Motor (ARES-02)</span>
                <button
                  onClick={() => injectChaosFailure('ARES-02')}
                  className="px-3 py-1 bg-rose-500/15 hover:bg-rose-500/25 ring-1 ring-rose-500/30 text-rose-200 font-medium rounded-lg text-[11px] transition-all hover:scale-105 active:scale-95"
                >
                  Inyectar Falla
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-black/30 rounded-xl ring-1 ring-white/[0.06] text-xs">
                <span className="text-slate-300 font-medium">Drenar Batería 15% (ARES-01)</span>
                <button
                  onClick={() => injectBatteryDrain('ARES-01')}
                  className="px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/30 text-amber-200 font-medium rounded-lg text-[11px] transition-all hover:scale-105 active:scale-95"
                >
                  Test Relevo
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.08] mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">Exportar plan QGC:</span>
            <a
              href="/api/v1/missions/ARES-MISSION-01/export/qgc"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-cyan-300 font-medium rounded-xl transition-all hover:scale-105 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.waypoints</span>
            </a>
          </div>
        </div>
      </div>

      {/* AAR Certified Report Modal */}
      <AARReportModal isOpen={isAAROpen} onClose={() => setIsAAROpen(false)} />
    </div>
  );
};
