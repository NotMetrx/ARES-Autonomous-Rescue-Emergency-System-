import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { 
  Crosshair, 
  Home, 
  RotateCw, 
  PlaneTakeoff, 
  PlaneLanding, 
  BatteryCharging, 
  Camera, 
  Flame, 
  Eye, 
  ShieldAlert, 
  Sliders, 
  ArrowUp, 
  Gauge, 
  Radio, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

interface DroneActionTrayProps {
  gotoMode: boolean;
  setGotoMode: (val: boolean) => void;
}

export const DroneActionTray: React.FC<DroneActionTrayProps> = ({ gotoMode, setGotoMode }) => {
  const { 
    drones, 
    selectedDroneId, 
    setSelectedDroneId, 
    cameraMode, 
    setCameraMode,
    setViewMode 
  } = useSwarmStore();

  const [targetAlt, setTargetAlt] = useState<number>(30);
  const [targetSpeed, setTargetSpeed] = useState<number>(6.5);
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);

  const currentDrone = drones.find(d => d.drone_id === selectedDroneId) || drones[0];

  const triggerFeedback = (msg: string, voiceMsg: string) => {
    setLastActionStatus(msg);
    tacticalVoice.speak(voiceMsg, 'cmd');
    setTimeout(() => setLastActionStatus(null), 4000);
  };

  const handleCommand = async (command: string, voicePrompt: string) => {
    if (!currentDrone) return;
    try {
      const res = await fetch(`/api/v1/drones/${currentDrone.drone_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (res.ok) {
        triggerFeedback(`Comando ${command} ejecutado`, voicePrompt);
      }
    } catch (e) {
      console.warn('Error executing drone command:', e);
    }
  };

  const handleHoldPosition = async () => {
    if (!currentDrone) return;
    try {
      await fetch(`/api/v1/drones/${currentDrone.drone_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'HOLD' }),
      });
      triggerFeedback('Modo Órbita / Hold activado', `${currentDrone.drone_id} manteniendo posición en vigilancia orbital`);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleBatteryHandover = async () => {
    if (!currentDrone) return;
    try {
      await fetch(`/api/v1/chaos/inject-battery-drain?drone_id=${currentDrone.drone_id}&target_battery=15.0`, {
        method: 'POST',
      });
      triggerFeedback('Relevo de batería activado', `Iniciando protocolo de relevo autónomo para ${currentDrone.drone_id}`);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSnapshot = async () => {
    if (!currentDrone) return;
    try {
      const res = await fetch(`/api/v1/camera/${currentDrone.drone_id}/snapshot`, { method: 'POST' });
      const data = await res.json();
      triggerFeedback(`Evidencia forense: ${data.filename}`, 'Evidencia forense capturada y registrada');
    } catch (e) {
      console.warn(e);
    }
  };

  const toggleSensor = async () => {
    if (!currentDrone) return;
    const next = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
    setCameraMode(next);
    try {
      await fetch(`/api/v1/camera/${currentDrone.drone_id}/mode?mode=${next}`, { method: 'POST' });
      triggerFeedback(`Sensor: ${next}`, `Sensor conmutado a ${next === 'RGB' ? 'óptico RGB' : 'térmico FLIR'}`);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleUpdateFlightParams = async (newAlt: number, newSpeed: number) => {
    setTargetAlt(newAlt);
    setTargetSpeed(newSpeed);
    if (!currentDrone) return;
    try {
      await fetch(`/api/v1/drones/${currentDrone.drone_id}/goto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: currentDrone.lat,
          lon: currentDrone.lon,
          alt: newAlt,
          speed_ms: newSpeed,
        }),
      });
    } catch (e) {
      console.warn(e);
    }
  };

  if (!currentDrone) return null;

  // Circular SVG gauge helper
  const CircularGauge = ({ value, max, color, label, unit }: { value: number; max: number; color: string; label: string; unit: string }) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const r = 22;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;

    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative w-14 h-14 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="28" cy="28" r={r} className="fill-none stroke-white/[0.06]" strokeWidth="3" />
            <circle 
              cx="28" cy="28" r={r}
              className={`fill-none ${color} transition-all duration-700 ease-out`}
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-sm font-semibold text-white tabular-nums">{Math.round(value)}</span>
        </div>
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
          <div className="text-[10px] text-slate-400">{unit}</div>
        </div>
      </div>
    );
  };

  // Action button component
  const ActionBtn = ({ icon: Icon, label, onClick, active = false, variant = 'default' }: {
    icon: any; label: string; onClick: () => void; active?: boolean; variant?: string;
  }) => {
    const variants: Record<string, string> = {
      default: 'hover:bg-white/[0.08] ring-white/[0.06] text-slate-200',
      blue: 'hover:bg-blue-500/15 ring-blue-500/20 text-blue-100',
      amber: 'hover:bg-amber-500/15 ring-amber-500/20 text-amber-100',
      emerald: 'hover:bg-emerald-500/15 ring-emerald-500/20 text-emerald-100',
      rose: 'hover:bg-rose-500/15 ring-rose-500/20 text-rose-100',
    };

    return (
      <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl backdrop-blur-md ring-1 shadow-lg shadow-black/10
          transition-all duration-300 ease-out hover:scale-[1.03] active:scale-[0.97] group
          ${active ? 'bg-white/[0.1] ring-white/20' : 'bg-white/[0.03]'}
          ${variants[variant] || variants.default}
        `}
      >
        <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
        <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
      </button>
    );
  };

  return (
    <div className="relative rounded-3xl p-5 bg-slate-900/40 backdrop-blur-xl ring-1 ring-white/[0.08] shadow-2xl shadow-black/30 overflow-hidden">
      {/* Top accent gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

      {/* Header: Drone Selector & Live Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center space-x-3">
          {/* Drone Selector - Segmented Control */}
          <div className="flex items-center p-1 rounded-xl bg-black/30 ring-1 ring-white/[0.08] relative">
            {['ARES-01', 'ARES-02', 'ARES-03'].map(id => {
              const d = drones.find(item => item.drone_id === id);
              const isSel = id === selectedDroneId;
              const isBreached = d?.in_safety_breach;

              return (
                <button
                  key={id}
                  onClick={() => setSelectedDroneId(id)}
                  className={`relative z-10 px-3 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all duration-300 flex items-center space-x-1.5 ${
                    isSel 
                      ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/20' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isBreached ? 'bg-rose-500 animate-pulse' : isSel ? 'bg-blue-400' : 'bg-slate-600'
                  }`} />
                  <span>{id}</span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium tracking-wide text-slate-300">
                Bandeja de Control Táctico
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 font-mono">
                {currentDrone.fsm_state}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
              <span>WGS84: <strong className="text-slate-300">{currentDrone.lat.toFixed(5)}, {currentDrone.lon.toFixed(5)}</strong></span>
              <span className="text-white/10">•</span>
              <span>Rumbo: <strong className="text-slate-300">{currentDrone.orientation.yaw.toFixed(0)}°</strong></span>
            </div>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center space-x-4">
          <CircularGauge 
            value={currentDrone.battery} 
            max={100} 
            color={currentDrone.battery > 50 ? 'stroke-emerald-400' : currentDrone.battery > 22 ? 'stroke-amber-400' : 'stroke-rose-400'}
            label="Batería"
            unit="%"
          />
          <CircularGauge value={currentDrone.alt} max={120} color="stroke-blue-400" label="Altitud" unit="m" />
          <CircularGauge value={currentDrone.speed_ms} max={15} color="stroke-amber-400" label="Velocidad" unit="m/s" />
        </div>
      </div>

      {/* Main Action Buttons Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5 mb-4">
        <ActionBtn icon={Camera} label="Ver Cámara" onClick={() => { setViewMode('camera'); triggerFeedback(`Cámara FPV: ${currentDrone.drone_id}`, `Abriendo transmisión de cámara para ${currentDrone.drone_id}`); }} variant="blue" />
        <ActionBtn icon={Crosshair} label={gotoMode ? 'Cancelar GOTO' : 'Designar GOTO'} onClick={() => setGotoMode(!gotoMode)} variant="amber" active={gotoMode} />
        <ActionBtn icon={Home} label="Retorno Base" onClick={() => handleCommand('RTH', `${currentDrone.drone_id} iniciando retorno autónomo`)} variant="amber" />
        <ActionBtn icon={RotateCw} label="Órbita / Hold" onClick={handleHoldPosition} />
        {currentDrone.fsm_state === 'LANDED' || currentDrone.fsm_state === 'IDLE' ? (
          <ActionBtn icon={PlaneTakeoff} label="Despegar" onClick={() => handleCommand('TAKEOFF', `Despegue autorizado para ${currentDrone.drone_id}`)} variant="emerald" />
        ) : (
          <ActionBtn icon={PlaneLanding} label="Aterrizar" onClick={() => handleCommand('LAND', `Aterrizaje para ${currentDrone.drone_id}`)} />
        )}
        <ActionBtn icon={BatteryCharging} label="Relevo Flota" onClick={handleBatteryHandover} variant="amber" />
        <ActionBtn icon={cameraMode === 'THERMAL_FLIR' ? Flame : Eye} label={cameraMode === 'THERMAL_FLIR' ? 'FLIR Térmico' : 'Óptico RGB'} onClick={toggleSensor} />
        <ActionBtn icon={Camera} label="Snapshot (C)" onClick={handleSnapshot} variant="rose" />
        <ActionBtn icon={ShieldAlert} label="Emergencia" onClick={() => handleCommand('EMERGENCY_STOP', `Parada de emergencia en ${currentDrone.drone_id}`)} variant="rose" />
      </div>

      {/* Flight Parameter Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-white/[0.06] text-xs font-mono">
        <div className="flex items-center space-x-3 bg-white/[0.03] p-3 rounded-xl ring-1 ring-white/[0.06]">
          <ArrowUp className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-slate-400 shrink-0">Altitud:</span>
          <input
            type="range"
            min="10"
            max="100"
            value={targetAlt}
            onChange={(e) => handleUpdateFlightParams(parseInt(e.target.value), targetSpeed)}
            className="flex-1 accent-blue-400 h-1"
          />
          <span className="text-blue-300 font-semibold w-12 text-right">{targetAlt} m</span>
        </div>

        <div className="flex items-center space-x-3 bg-white/[0.03] p-3 rounded-xl ring-1 ring-white/[0.06]">
          <Gauge className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-slate-400 shrink-0">Velocidad:</span>
          <input
            type="range"
            min="2.0"
            max="15.0"
            step="0.5"
            value={targetSpeed}
            onChange={(e) => handleUpdateFlightParams(targetAlt, parseFloat(e.target.value))}
            className="flex-1 accent-amber-400 h-1"
          />
          <span className="text-amber-300 font-semibold w-14 text-right">{targetSpeed.toFixed(1)} m/s</span>
        </div>
      </div>

      {/* Toast Notification */}
      {lastActionStatus && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl backdrop-blur-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-100 shadow-2xl animate-slideUp">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium">{lastActionStatus}</span>
        </div>
      )}
    </div>
  );
};
