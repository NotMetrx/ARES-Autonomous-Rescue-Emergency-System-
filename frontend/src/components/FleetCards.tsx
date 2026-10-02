import React from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { FSMState } from '../types/telemetry';
import { Plane, AlertCircle, Compass, Gauge, ShieldAlert } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

export const FleetCards: React.FC = () => {
  const { drones, selectedDroneId, setSelectedDroneId } = useSwarmStore();

  const getFsmBadge = (state: FSMState) => {
    switch (state) {
      case 'IN_FLIGHT':
        return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20', glow: 'shadow-emerald-500/10' };
      case 'ROUTING':
        return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', ring: 'ring-cyan-500/20', glow: 'shadow-cyan-500/10' };
      case 'AVOIDING':
        return { bg: 'bg-rose-500/10', text: 'text-rose-400', ring: 'ring-rose-500/20 animate-pulse', glow: 'shadow-rose-500/10' };
      case 'RTH':
        return { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/20', glow: 'shadow-amber-500/10' };
      case 'EMERGENCY':
        return { bg: 'bg-red-500/15', text: 'text-red-400', ring: 'ring-red-500/30 animate-pulse', glow: 'shadow-red-500/10' };
      default:
        return { bg: 'bg-slate-500/10', text: 'text-slate-400', ring: 'ring-slate-500/20', glow: '' };
    }
  };

  const handleDroneCommand = async (droneId: string, cmd: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/v1/drones/${droneId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      tacticalVoice.speak(`Comando ${cmd} enviado a ${droneId}`, 'cmd');
    } catch (err) {
      console.warn('Drone command error:', err);
    }
  };

  if (!drones.length) {
    return (
      <div className="backdrop-blur-xl bg-white/[0.03] ring-1 ring-white/[0.06] rounded-2xl p-6 text-center text-slate-400 text-xs animate-pulse">
        Esperando telemetría del enjambre...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {drones.map((d, idx) => {
        const isSelected = d.drone_id === selectedDroneId;
        const isBreached = d.in_safety_breach || (d.nearest_distance_m !== null && (d.nearest_distance_m ?? 999) < 15.0);
        const fsmStyle = getFsmBadge(d.fsm_state);

        return (
          <div
            key={d.drone_id}
            onClick={() => setSelectedDroneId(d.drone_id)}
            className={`
              cursor-pointer rounded-2xl p-4 transition-all duration-300 ease-out relative overflow-hidden
              backdrop-blur-xl ring-1 shadow-lg group
              hover:-translate-y-0.5 hover:shadow-xl
              active:scale-[0.98]
              ${isSelected
                ? 'bg-white/[0.06] ring-blue-500/30 shadow-blue-500/10'
                : 'bg-white/[0.03] ring-white/[0.06] hover:ring-white/[0.12] shadow-black/20'
              }
              ${isBreached ? 'ring-rose-500/40' : ''}
            `}
            style={{ animationDelay: `${idx * 80}ms` }}
          >
            {/* Top accent line for selected */}
            {isSelected && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 opacity-60" />
            )}

            {/* Safety breach pulsing glow */}
            {isBreached && (
              <div className="absolute inset-0 rounded-2xl ring-2 ring-rose-500/20 animate-pulse pointer-events-none" />
            )}

            {/* Header: Drone ID & FSM */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isSelected
                    ? 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20'
                    : 'bg-white/[0.06] ring-1 ring-white/10'
                }`}>
                  <Plane className={`w-4.5 h-4.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white flex items-center space-x-1.5">
                    <span>{d.drone_id}</span>
                    {isSelected && (
                      <span className="text-[10px] text-blue-400 font-normal bg-blue-500/10 px-1.5 py-0.5 rounded-md">Enfocado</span>
                    )}
                  </h3>
                </div>
              </div>

              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ring-1 ${fsmStyle.bg} ${fsmStyle.text} ${fsmStyle.ring}`}>
                {d.fsm_state}
              </span>
            </div>

            {/* Battery Progress Bar */}
            <div className="mb-3.5">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-slate-400 font-medium">Batería</span>
                <span className={`font-mono font-semibold ${
                  d.battery > 50 ? 'text-emerald-400' : d.battery > 22 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {d.battery.toFixed(1)}% {d.battery < 22 && '⚠️'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden ${
                    d.battery > 50 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : d.battery > 22 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-rose-500 to-rose-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, d.battery))}%` }}
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 bg-white/[0.03] p-2.5 rounded-xl ring-1 ring-white/[0.05] mb-3">
              <div className="text-center">
                <span className="text-[9px] text-slate-500 block font-medium uppercase tracking-wider">Altura</span>
                <span className="font-mono text-xs font-semibold text-blue-300">{d.alt.toFixed(1)} m</span>
              </div>
              <div className="text-center border-x border-white/[0.05]">
                <span className="text-[9px] text-slate-500 block font-medium uppercase tracking-wider">Velocidad</span>
                <span className="font-mono text-xs font-semibold text-emerald-300">{d.speed_ms.toFixed(1)} m/s</span>
              </div>
              <div className="text-center">
                <span className="text-[9px] text-slate-500 block font-medium uppercase tracking-wider">Heading</span>
                <span className="font-mono text-xs font-semibold text-sky-300">{d.orientation.yaw.toFixed(0)}°</span>
              </div>
            </div>

            {/* Peer Distance & Safety Status */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3 px-0.5">
              <span className="flex items-center">
                <Compass className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Par: <strong className="text-slate-300 ml-1">{d.nearest_peer_id || 'N/A'}</strong>
              </span>
              <span className={`font-mono font-semibold ${isBreached ? 'text-rose-400' : 'text-slate-300'}`}>
                {d.nearest_distance_m !== null ? `${d.nearest_distance_m?.toFixed(1)} m` : '--'}
              </span>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center space-x-2 pt-2.5 border-t border-white/[0.05]">
              <button
                onClick={(e) => handleDroneCommand(d.drone_id, 'TAKEOFF', e)}
                className="flex-1 py-1.5 px-2 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-200 text-[10px] font-medium rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Despegar
              </button>
              <button
                onClick={(e) => handleDroneCommand(d.drone_id, 'RTH', e)}
                className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 ring-1 ring-amber-500/20 text-amber-200 text-[10px] font-medium rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                RTH
              </button>
              <button
                onClick={(e) => handleDroneCommand(d.drone_id, 'LAND', e)}
                className="flex-1 py-1.5 px-2 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-200 text-[10px] font-medium rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Aterrizar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
