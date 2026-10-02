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
        return 'bg-emerald-950 text-emerald-300 border-emerald-600';
      case 'ROUTING':
        return 'bg-cyan-950 text-cyan-300 border-cyan-600';
      case 'AVOIDING':
        return 'bg-rose-950 text-rose-300 border-rose-500 animate-pulse';
      case 'RTH':
        return 'bg-amber-950 text-amber-300 border-amber-600';
      case 'EMERGENCY':
        return 'bg-red-950 text-red-200 border-red-600 animate-bounce';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-600';
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
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-4 text-center text-slate-400 text-xs">
        Esperando telemetría del enjambre...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {drones.map((d) => {
        const isSelected = d.drone_id === selectedDroneId;
        const isBreached = d.in_safety_breach || (d.nearest_distance_m !== null && (d.nearest_distance_m ?? 999) < 15.0);

        return (
          <div
            key={d.drone_id}
            onClick={() => setSelectedDroneId(d.drone_id)}
            className={`cursor-pointer rounded-2xl p-3.5 transition border relative shadow-md ${
              isSelected
                ? 'bg-gradient-to-b from-[#111c30] to-[#0b1220] border-cyan-400 shadow-cyan-950/50'
                : 'bg-[#0b1220] hover:bg-[#0f172a] border-slate-800'
            }`}
          >
            {/* Header: Drone ID & FSM */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                  isSelected ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                  <Plane className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-1">
                    <span>{d.drone_id}</span>
                    {isSelected && <span className="text-[10px] text-cyan-400 font-normal">(Enfocado)</span>}
                  </h3>
                </div>
              </div>

              <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full border shadow-sm ${getFsmBadge(d.fsm_state)}`}>
                {d.fsm_state}
              </span>
            </div>

            {/* Battery Progress Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Batería</span>
                <span className={`font-mono font-bold ${
                  d.battery > 50 ? 'text-emerald-400' : d.battery > 22 ? 'text-amber-400' : 'text-rose-400 animate-pulse'
                }`}>
                  {d.battery.toFixed(1)}% {d.battery < 22 && '⚠️ RELEVO'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    d.battery > 50 ? 'bg-emerald-400' : d.battery > 22 ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, d.battery))}%` }}
                />
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-900/70 p-2 rounded-xl border border-slate-800/80 text-center mb-3">
              <div>
                <span className="text-[9px] text-slate-400 block font-semibold">ALTURA</span>
                <span className="font-mono text-xs font-bold text-cyan-300">{d.alt.toFixed(1)} m</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block font-semibold">VELOCIDAD</span>
                <span className="font-mono text-xs font-bold text-emerald-300">{d.speed_ms.toFixed(1)} m/s</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block font-semibold">HEADING</span>
                <span className="font-mono text-xs font-bold text-sky-300">{d.orientation.yaw.toFixed(0)}°</span>
              </div>
            </div>

            {/* Peer Distance & Safety Status */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3 px-1">
              <span className="flex items-center">
                <Compass className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Par: <strong className="text-slate-300 ml-1">{d.nearest_peer_id || 'N/A'}</strong>
              </span>
              <span className={`font-mono font-bold ${isBreached ? 'text-rose-400 animate-pulse' : 'text-slate-300'}`}>
                {d.nearest_distance_m !== null ? `${d.nearest_distance_m?.toFixed(1)} m` : '--'}
              </span>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center space-x-1.5 pt-1 border-t border-slate-800/80">
              <button
                onClick={(e) => handleDroneCommand(d.drone_id, 'TAKEOFF', e)}
                className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg transition"
              >
                Despegar
              </button>
              <button
                onClick={(e) => handleDroneCommand(d.drone_id, 'RTH', e)}
                className="flex-1 py-1 px-2 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-200 text-[10px] font-bold rounded-lg transition"
              >
                RTH
              </button>
              <button
                onClick={(e) => handleDroneCommand(d.drone_id, 'LAND', e)}
                className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg transition"
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
