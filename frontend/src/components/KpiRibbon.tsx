import React from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { ShieldCheck, AlertTriangle, BatteryMedium, Compass, Target, Radio, PlaneLanding } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

export const KpiRibbon: React.FC = () => {
  const { drones, alerts, coveragePct, coveredAreaM2, survivorsInView, hazardsInView } = useSwarmStore();

  const activeCount = drones.length;
  const avgBattery = activeCount > 0 
    ? (drones.reduce((sum, d) => sum + d.battery, 0) / activeCount).toFixed(1)
    : '0';

  // Real-time in-view vision detections (non-cumulative: counts real persons in current frame)
  const survivorsCount = survivorsInView;
  const hazardsCount = hazardsInView;

  const isSafetyBreached = drones.some(d => d.in_safety_breach || (d.nearest_distance_m !== null && (d.nearest_distance_m ?? 999) < 15.0));

  const handleFleetRTH = async () => {
    try {
      await fetch('/api/v1/drones/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'RTH' }),
      });
      tacticalVoice.speak('Atención: Retorno a base de emergencia ordenado para toda la flota', 'rth', true);
    } catch (e) {
      console.warn('RTH error:', e);
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 my-3">
      {/* 1. Drones Activos */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Flota Activa</span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <span className="text-xl font-black text-cyan-400">{activeCount}</span>
            <span className="text-xs text-slate-500 font-semibold">/ 3 UAVs</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">Formación Mesh 3D</span>
        </div>
        <Radio className="w-6 h-6 text-cyan-500/40" />
      </div>

      {/* 2. Batería Promedio */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Batería Promedio</span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <span className="text-xl font-black text-emerald-400 font-mono">{avgBattery}%</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Autonomía: ~24 min</span>
        </div>
        <BatteryMedium className="w-6 h-6 text-emerald-500/40" />
      </div>

      {/* 3. Cobertura SAR */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cobertura SAR</span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <span className="text-xl font-black text-sky-400 font-mono">{coveragePct.toFixed(1)}%</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{coveredAreaM2.toFixed(0)} m² barridos</span>
        </div>
        <Compass className="w-6 h-6 text-sky-500/40" />
      </div>

      {/* 4. Víctimas y Objetivos */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Detecciones IA</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <span className={`text-xl font-black ${survivorsCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`}>
              {survivorsCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">víctimas</span>
            <span className="text-sm font-black text-amber-400">{hazardsCount}</span>
            <span className="text-xs text-slate-400 font-medium">fuego</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-medium">
            {survivorsCount > 0 ? '● En Tiempo Real (En Toma)' : 'D-FINE (RT-DETR) Escaneando'}
          </span>
        </div>
        <Target className={`w-6 h-6 ${survivorsCount > 0 ? 'text-emerald-400' : 'text-indigo-500/40'}`} />
      </div>

      {/* 5. Burbuja de Seguridad Táctica */}
      <div className={`border rounded-xl p-3 flex items-center justify-between shadow-sm ${
        isSafetyBreached 
          ? 'bg-rose-950/70 border-rose-500 animate-pulse' 
          : 'bg-[#0b1220] border-slate-800'
      }`}>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Burbuja 15m</span>
          <div className="mt-0.5">
            <span className={`text-base font-black ${isSafetyBreached ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isSafetyBreached ? '⚠️ EVASIÓN REACTIVA' : 'SEGURA'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {isSafetyBreached ? '< 50ms anti-colisión' : 'Separación óptima'}
          </span>
        </div>
        {isSafetyBreached ? (
          <AlertTriangle className="w-6 h-6 text-rose-400 animate-bounce" />
        ) : (
          <ShieldCheck className="w-6 h-6 text-emerald-500/40" />
        )}
      </div>

      {/* 6. Parada de Emergencia / RTH Flota */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-2.5 flex items-center justify-center">
        <button
          onClick={handleFleetRTH}
          className="w-full h-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold rounded-lg text-xs py-2 px-3 flex items-center justify-center space-x-2 transition shadow-lg shadow-rose-900/30"
          title="Ordena Return-To-Home inmediato a todos los drones (ESPACIO)"
        >
          <PlaneLanding className="w-4 h-4" />
          <span>RTH DE EMERGENCIA (ESPACIO)</span>
        </button>
      </div>
    </div>
  );
};
