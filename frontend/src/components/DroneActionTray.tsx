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

  return (
    <div className="bg-gradient-to-r from-[#090d18] via-[#0b1324] to-[#090d18] border-2 border-cyan-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden">
      {/* Top glowing cyber accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

      {/* Header: Drone Selector & Live Telemetry HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          {/* Drone Selector Pills */}
          <div className="flex items-center space-x-1.5 bg-slate-950/90 p-1 rounded-xl border border-slate-700/80">
            {['ARES-01', 'ARES-02', 'ARES-03'].map(id => {
              const d = drones.find(item => item.drone_id === id);
              const isSel = id === selectedDroneId;
              const isBreached = d?.in_safety_breach;

              return (
                <button
                  key={id}
                  onClick={() => setSelectedDroneId(id)}
                  className={`px-3 py-1.5 text-xs font-mono font-black rounded-lg transition flex items-center space-x-1.5 ${
                    isSel 
                      ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-lg shadow-cyan-500/30' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    isBreached ? 'bg-rose-500 animate-ping' : isSel ? 'bg-cyan-300' : 'bg-slate-600'
                  }`} />
                  <span>{id}</span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-extrabold tracking-widest text-slate-400 uppercase">
                Bandeja de Control Táctico
              </span>
              <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-cyan-950 border border-cyan-700 text-cyan-300 font-mono">
                {currentDrone.fsm_state}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center space-x-2 mt-0.5">
              <span>WGS84: <strong>{currentDrone.lat.toFixed(5)}, {currentDrone.lon.toFixed(5)}</strong></span>
              <span className="text-slate-600">•</span>
              <span>Rumbo: <strong>{currentDrone.orientation.yaw.toFixed(0)}°</strong></span>
            </div>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-center">
            <span className="text-[9px] text-slate-500 uppercase block font-semibold">Batería</span>
            <span className={`font-bold text-sm ${
              currentDrone.battery > 50 ? 'text-emerald-400' : currentDrone.battery > 22 ? 'text-amber-400' : 'text-rose-400 animate-pulse'
            }`}>
              {currentDrone.battery.toFixed(1)}%
            </span>
          </div>

          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-center">
            <span className="text-[9px] text-slate-500 uppercase block font-semibold">Altitud Z</span>
            <span className="font-bold text-sm text-cyan-300">{currentDrone.alt.toFixed(1)} m</span>
          </div>

          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-center">
            <span className="text-[9px] text-slate-500 uppercase block font-semibold">Velocidad</span>
            <span className="font-bold text-sm text-emerald-300">{currentDrone.speed_ms.toFixed(1)} m/s</span>
          </div>
        </div>
      </div>

      {/* Main Tactical Action Buttons Palette */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3.5">
        {/* 0. Ver Cámara FPV */}
        <button
          onClick={() => {
            setViewMode('camera');
            triggerFeedback(`Cámara FPV: ${currentDrone.drone_id}`, `Abriendo transmisión de cámara y analíticas para ${currentDrone.drone_id}`);
          }}
          className="p-2.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border-2 border-cyan-400 text-cyan-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-lg shadow-cyan-950/60"
          title="Ver transmisión de cámara en vivo y analíticas D-FINE"
        >
          <Camera className="w-5 h-5 text-cyan-300 animate-pulse" />
          <span className="text-[11px] leading-tight text-center font-black text-cyan-300">VER CÁMARA</span>
        </button>

        {/* 1. GOTO Designation */}
        <button
          onClick={() => setGotoMode(!gotoMode)}
          className={`p-2.5 rounded-xl border font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-lg ${
            gotoMode
              ? 'bg-amber-500 text-black border-amber-300 shadow-amber-500/40 animate-pulse'
              : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-amber-300 hover:border-amber-400'
          }`}
          title="Haz clic para activar el puntero de coordenadas en el plano 2D"
        >
          <Crosshair className="w-5 h-5" />
          <span className="text-[11px] leading-tight text-center">
            {gotoMode ? 'CANCELAR GOTO' : 'DESIGNAR GOTO'}
          </span>
        </button>

        {/* 2. RTH */}
        <button
          onClick={() => handleCommand('RTH', `${currentDrone.drone_id} iniciando retorno autónomo a la estación base`)}
          className="p-2.5 rounded-xl bg-amber-950/70 hover:bg-amber-900 border border-amber-600/70 text-amber-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          title="Ordena el regreso inmediato del dron a la estación base"
        >
          <Home className="w-5 h-5 text-amber-400" />
          <span className="text-[11px] leading-tight text-center">RETORNO A BASE</span>
        </button>

        {/* 3. Hold / Loiter */}
        <button
          onClick={handleHoldPosition}
          className="p-2.5 rounded-xl bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-600/70 text-cyan-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          title="Ordena mantener posición y realizar vigilancia orbital"
        >
          <RotateCw className="w-5 h-5 text-cyan-400" />
          <span className="text-[11px] leading-tight text-center">ÓRBITA / HOLD</span>
        </button>

        {/* 4. Despegar / Aterrizar */}
        {currentDrone.fsm_state === 'LANDED' || currentDrone.fsm_state === 'IDLE' ? (
          <button
            onClick={() => handleCommand('TAKEOFF', `Despegue autorizado para ${currentDrone.drone_id}`)}
            className="p-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600 text-emerald-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          >
            <PlaneTakeoff className="w-5 h-5 text-emerald-400" />
            <span className="text-[11px] leading-tight text-center">DESPEGAR</span>
          </button>
        ) : (
          <button
            onClick={() => handleCommand('LAND', `Iniciando secuencia de aterrizaje para ${currentDrone.drone_id}`)}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          >
            <PlaneLanding className="w-5 h-5 text-slate-400" />
            <span className="text-[11px] leading-tight text-center">ATERRIZAR</span>
          </button>
        )}

        {/* 5. Relevo de Batería */}
        <button
          onClick={handleBatteryHandover}
          className="p-2.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-600/70 text-indigo-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          title="Solicita que un dron de respaldo releve a este UAV en su sector"
        >
          <BatteryCharging className="w-5 h-5 text-indigo-400" />
          <span className="text-[11px] leading-tight text-center">RELEVO FLOTA</span>
        </button>

        {/* 6. Conmutar Sensor Óptico / Térmico */}
        <button
          onClick={toggleSensor}
          className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          title="Alterna entre visión óptica RGB y térmica FLIR"
        >
          {cameraMode === 'THERMAL_FLIR' ? <Flame className="w-5 h-5 text-amber-400" /> : <Eye className="w-5 h-5 text-cyan-400" />}
          <span className="text-[11px] leading-tight text-center">
            {cameraMode === 'THERMAL_FLIR' ? 'TÉRMICO FLIR' : 'ÓPTICO RGB'}
          </span>
        </button>

        {/* 7. Snapshot Evidencia Forense */}
        <button
          onClick={handleSnapshot}
          className="p-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-600/70 text-rose-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md"
          title="Captura evidencia forense con marcas de D-FINE en disco"
        >
          <Camera className="w-5 h-5 text-rose-400" />
          <span className="text-[11px] leading-tight text-center">SNAPSHOT (C)</span>
        </button>

        {/* 8. Parada de Emergencia */}
        <button
          onClick={() => handleCommand('EMERGENCY_STOP', `Parada de emergencia ejecutada en ${currentDrone.drone_id}`)}
          className="p-2.5 rounded-xl bg-red-900/80 hover:bg-red-800 border border-red-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition shadow-md shadow-red-950/50"
          title="Parada inmediata y estabilización en el aire"
        >
          <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
          <span className="text-[11px] leading-tight text-center">PARADA EMERG.</span>
        </button>
      </div>

      {/* Flight Parameter Controls (Altitude and Speed Sliders) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
        <div className="flex items-center space-x-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <ArrowUp className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-slate-400 shrink-0">Altitud Objetivo:</span>
          <input
            type="range"
            min="10"
            max="100"
            value={targetAlt}
            onChange={(e) => handleUpdateFlightParams(parseInt(e.target.value), targetSpeed)}
            className="flex-1 accent-cyan-400"
          />
          <span className="text-cyan-300 font-bold w-12 text-right">{targetAlt} m</span>
        </div>

        <div className="flex items-center space-x-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <Gauge className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-slate-400 shrink-0">Velocidad Crucero:</span>
          <input
            type="range"
            min="2.0"
            max="15.0"
            step="0.5"
            value={targetSpeed}
            onChange={(e) => handleUpdateFlightParams(targetAlt, parseFloat(e.target.value))}
            className="flex-1 accent-emerald-400"
          />
          <span className="text-emerald-300 font-bold w-14 text-right">{targetSpeed.toFixed(1)} m/s</span>
        </div>
      </div>

      {/* Action Notification Toast */}
      {lastActionStatus && (
        <div className="mt-3 p-2 bg-cyan-950/90 border border-cyan-500 text-cyan-200 text-xs rounded-xl flex items-center justify-between animate-fadeIn shadow-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span className="font-bold">{lastActionStatus}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">ENLACE ACTIVO</span>
        </div>
      )}
    </div>
  );
};
