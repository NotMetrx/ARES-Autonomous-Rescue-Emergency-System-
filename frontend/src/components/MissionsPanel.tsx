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
    <div className="bg-[#0b1220] border border-cyan-500/30 rounded-2xl p-4 shadow-xl select-none">
      {/* Top Header & AAR Report Button */}
      <div className="flex flex-wrap items-center justify-between mb-4 border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center space-x-2.5">
          <Compass className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              Centro de Misiones SAR & Vuelo en Formación
            </h2>
            <p className="text-[11px] text-slate-400">Algoritmos Boustrophedon • Formaciones Autónomas • Informes Forenses AAR</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* AAR Report Generator Trigger */}
          <button
            onClick={() => { tacticalAudio.playButtonBeep(); setIsAAROpen(true); }}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition"
          >
            <FileText className="w-4 h-4" />
            <span>GENERAR INFORME AAR</span>
          </button>

          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
            ENJAMBRE ACTIVO
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Generador de Cuadrícula SAR */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center">
              <Play className="w-3.5 h-3.5 mr-1.5 text-cyan-400" /> Búsqueda SAR (Boustrophedon)
            </h3>

            <div className="grid grid-cols-2 gap-2.5 text-xs mb-3">
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
                <label className="text-[11px] text-slate-400 block mb-1">Altitud (m)</label>
                <input
                  type="number"
                  value={altitudeM}
                  onChange={e => setAltitudeM(parseInt(e.target.value) || 10)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Drones</label>
                <select
                  value={dronesCount}
                  onChange={e => setDronesCount(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 outline-none"
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
              className="w-full py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-extrabold text-xs rounded-xl transition shadow-md flex items-center justify-center space-x-1.5"
            >
              <Zap className="w-4 h-4" />
              <span>{isGenerating ? 'GENERANDO RUTA...' : 'GENERAR MISIÓN SAR'}</span>
            </button>

            {missionStatus && (
              <div className="mt-2 p-2 bg-cyan-950/80 border border-cyan-700 text-cyan-200 text-[11px] rounded-lg flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>{missionStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Coordinador de Vuelo en Formación */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-sky-400 flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-sky-400" /> Formaciones Tácticas Autónomas
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Espaciado: {formationSpacing}m</span>
            </div>

            <div className="mb-3">
              <input
                type="range"
                min="15"
                max="50"
                step="5"
                value={formationSpacing}
                onChange={e => setFormationSpacing(parseInt(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>15m (Cerrado)</span>
                <span>25m (Estándar)</span>
                <span>50m (Amplio)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => dispatchFormation('DELTA')}
                className={`p-2 rounded-xl border text-left font-bold transition flex items-center space-x-2 ${
                  activeFormation === 'DELTA'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-200 ring-1 ring-cyan-400'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <span className="text-base">▲</span>
                <div>
                  <div className="font-extrabold text-xs">DELTA (V)</div>
                  <div className="text-[10px] text-slate-400">Punta de flecha</div>
                </div>
              </button>

              <button
                onClick={() => dispatchFormation('LINE')}
                className={`p-2 rounded-xl border text-left font-bold transition flex items-center space-x-2 ${
                  activeFormation === 'LINE'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-200 ring-1 ring-cyan-400'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <span className="text-base">━</span>
                <div>
                  <div className="font-extrabold text-xs">LÍNEA EN FRENTE</div>
                  <div className="text-[10px] text-slate-400">Barrido paralelo</div>
                </div>
              </button>

              <button
                onClick={() => dispatchFormation('ECHELON')}
                className={`p-2 rounded-xl border text-left font-bold transition flex items-center space-x-2 ${
                  activeFormation === 'ECHELON'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-200 ring-1 ring-cyan-400'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <span className="text-base">⟋</span>
                <div>
                  <div className="font-extrabold text-xs">ECHELON</div>
                  <div className="text-[10px] text-slate-400">Escalonada</div>
                </div>
              </button>

              <button
                onClick={() => dispatchFormation('ORBIT')}
                className={`p-2 rounded-xl border text-left font-bold transition flex items-center space-x-2 ${
                  activeFormation === 'ORBIT'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-200 ring-1 ring-cyan-400'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <RotateCw className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="font-extrabold text-xs">ÓRBITA 360°</div>
                  <div className="text-[10px] text-slate-400">Anillo perimétrico</div>
                </div>
              </button>
            </div>
          </div>

          {formationMsg && (
            <div className="mt-2.5 p-2 bg-sky-950/80 border border-sky-700 text-sky-200 text-[11px] rounded-lg">
              {formationMsg}
            </div>
          )}
        </div>

        {/* 3. Chaos Engineering & Resiliencia */}
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-amber-400 flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-400" /> Pruebas de Resiliencia (Chaos)
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

          <div className="pt-3 border-t border-slate-800 mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">Exportar plan QGC:</span>
            <a
              href="/api/v1/missions/ARES-MISSION-01/export/qgc"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-lg transition"
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
