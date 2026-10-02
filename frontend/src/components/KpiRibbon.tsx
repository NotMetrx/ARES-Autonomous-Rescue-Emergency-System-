import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, BatteryMedium, Compass, Target, Radio, PlaneLanding } from 'lucide-react';
import { useSwarmStore } from '../store/useSwarmStore';
import { tacticalVoice } from '../services/tacticalVoice';

export const KpiRibbon: React.FC = () => {
  const drones = useSwarmStore(state => state.drones) || [];
  const alerts = useSwarmStore(state => state.alerts) || [];
  const coveragePct = useSwarmStore(state => state.coveragePct) || 0;
  const coveredAreaM2 = useSwarmStore(state => state.coveredAreaM2) || 0;
  const survivorsInView = useSwarmStore(state => state.survivorsInView) || 0;
  const hazardsInView = useSwarmStore(state => state.hazardsInView) || 0;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const activeDrones = drones.length;
  const avgBattery = drones.length > 0 
    ? Math.round(drones.reduce((acc, d) => acc + (d.battery || 0), 0) / drones.length) 
    : 0;

  // Assume safety breach if there are active alerts
  const isSafetyBreached = alerts.length > 0;
  
  const hasDetections = survivorsInView > 0 || hazardsInView > 0;

  const handleFleetRTH = async () => {
    try {
      tacticalVoice.speak("Initiating emergency return to home for active fleet.");
      await fetch('/api/v1/drones/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'RTH' })
      });
    } catch (error) {
      console.error('Failed to issue RTH command', error);
    }
  };

  const baseCardStyle = `
    relative overflow-hidden backdrop-blur-xl bg-slate-900/40 ring-1 ring-white/10 
    rounded-3xl p-5 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 ease-out flex flex-col justify-between
  `;

  return (
    <div className="w-full">
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes subtlePulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @keyframes breathRed {
          0%, 100% { background-color: rgba(220, 38, 38, 0.05); border-color: rgba(220, 38, 38, 0.2); box-shadow: 0 0 15px rgba(220, 38, 38, 0.1); }
          50% { background-color: rgba(220, 38, 38, 0.15); border-color: rgba(220, 38, 38, 0.4); box-shadow: 0 0 25px rgba(220, 38, 38, 0.3); }
        }
        .animate-card-enter {
          animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        .breathing-red-glow {
          animation: breathRed 3s ease-in-out infinite;
        }
      `}</style>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* 1. Flota Activa */}
        <div className={`${baseCardStyle} animate-card-enter`} style={{ animationDelay: '0ms' }}>
          <Radio className="absolute top-4 right-4 w-24 h-24 text-slate-100 opacity-5 -mt-4 -mr-4 pointer-events-none" />
          <div className="flex justify-between items-start mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Flota Activa</span>
            <Radio className="w-4 h-4 text-blue-400 opacity-80" />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-medium tabular-nums text-slate-100">{activeDrones}</span>
              <span className="text-sm font-medium text-slate-500">/ 3</span>
            </div>
          </div>
        </div>

        {/* 2. Batería Promedio */}
        <div className={`${baseCardStyle} animate-card-enter`} style={{ animationDelay: '50ms' }}>
          <BatteryMedium className="absolute top-4 right-4 w-24 h-24 text-slate-100 opacity-5 -mt-4 -mr-4 pointer-events-none" />
          <div className="flex justify-between items-start mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Batería Prom.</span>
            <BatteryMedium className={`w-4 h-4 opacity-80 ${avgBattery < 20 ? 'text-rose-500' : 'text-emerald-400'}`} />
          </div>
          <div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-mono font-medium tabular-nums text-slate-100">{avgBattery}</span>
              <span className="text-sm font-medium text-slate-500">%</span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${avgBattery < 20 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                style={{ width: `${avgBattery}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3. Cobertura SAR */}
        <div className={`${baseCardStyle} animate-card-enter`} style={{ animationDelay: '100ms' }}>
          <Compass className="absolute top-4 right-4 w-24 h-24 text-slate-100 opacity-5 -mt-4 -mr-4 pointer-events-none" />
          <div className="flex justify-between items-start mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Cobertura SAR</span>
            <Target className="w-4 h-4 text-purple-400 opacity-80" />
          </div>
          <div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-mono font-medium tabular-nums text-slate-100">{coveragePct.toFixed(1)}</span>
              <span className="text-sm font-medium text-slate-500">%</span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-purple-500 transition-all duration-1000 ease-out" 
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4. Detecciones IA */}
        <div 
          className={`${baseCardStyle} animate-card-enter ${hasDetections ? 'ring-emerald-500/30' : ''}`} 
          style={{ 
            animationDelay: '150ms',
            animation: hasDetections ? 'slideUpFade 0.6s cubic-bezier(0.16,1,0.3,1) forwards, subtlePulse 2s infinite' : undefined
          }}
        >
          <Target className="absolute top-4 right-4 w-24 h-24 text-slate-100 opacity-5 -mt-4 -mr-4 pointer-events-none" />
          <div className="flex justify-between items-start mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Detecciones IA</span>
            <div className="relative">
              {hasDetections && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
              <ShieldCheck className={`w-4 h-4 opacity-80 ${hasDetections ? 'text-emerald-400' : 'text-slate-500'}`} />
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <div className="text-[10px] text-slate-500 mb-1">VÍCTIMAS</div>
              <span className="text-2xl font-mono font-medium tabular-nums text-slate-100">{survivorsInView}</span>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 mb-1">PELIGROS</div>
              <span className="text-2xl font-mono font-medium tabular-nums text-slate-100">{hazardsInView}</span>
            </div>
          </div>
        </div>

        {/* 5. Burbuja 15m (Safety Breach) */}
        <div 
          className={`${baseCardStyle} animate-card-enter ${isSafetyBreached ? 'breathing-red-glow' : ''}`} 
          style={{ animationDelay: '200ms' }}
        >
          <AlertTriangle className="absolute top-4 right-4 w-24 h-24 text-slate-100 opacity-5 -mt-4 -mr-4 pointer-events-none" />
          <div className="flex justify-between items-start mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Burbuja 15m</span>
            <AlertTriangle className={`w-4 h-4 opacity-80 ${isSafetyBreached ? 'text-rose-400' : 'text-slate-500'}`} />
          </div>
          <div>
            <span className={`text-lg font-medium tracking-wide ${isSafetyBreached ? 'text-rose-300' : 'text-slate-300'}`}>
              {isSafetyBreached ? 'VULNERADA' : 'SEGURO'}
            </span>
          </div>
        </div>

        {/* 6. RTH Emergency Button */}
        <div className="animate-card-enter flex" style={{ animationDelay: '250ms' }}>
          <button 
            onClick={handleFleetRTH}
            className="w-full relative overflow-hidden rounded-3xl p-5 flex flex-col items-center justify-center gap-2 group transition-all duration-300 ease-out active:scale-95 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(220,38,38,0.3)] bg-gradient-to-br from-rose-600/90 to-red-900/90 ring-1 ring-white/20"
          >
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <PlaneLanding className="w-8 h-8 text-white drop-shadow-md group-hover:-translate-y-1 transition-transform duration-300" />
            <span className="text-xs font-bold uppercase tracking-widest text-white drop-shadow-sm">Emergencia</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-rose-200">Retorno a Base</span>
          </button>
        </div>

      </div>
    </div>
  );
};
