import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { Camera, Flame, Eye, Video, ZoomIn, Compass, ArrowDown, Crosshair, Target, ShieldCheck } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';

type FlirPalette = 'RGB' | 'WHITE_HOT' | 'BLACK_HOT' | 'IRONBOW';

export const CameraView: React.FC = () => {
  const { selectedDroneId, cameraMode, setCameraMode, ptz, setGimbal, drones, aiStatus } = useSwarmStore();
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSnapshotMsg, setLastSnapshotMsg] = useState<string | null>(null);
  const [palette, setPalette] = useState<FlirPalette>('RGB');

  const currentPtz = ptz[selectedDroneId] || { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 };
  const curDrone = drones.find(d => d.drone_id === selectedDroneId);

  // Slant range (Laser Rangefinder LRF estimation)
  const pitchRad = Math.abs(currentPtz.pitch_deg) * (Math.PI / 180.0);
  const alt = curDrone?.alt || 30.0;
  const slantRangeM = pitchRad > 0.05 ? (alt / Math.sin(pitchRad)).toFixed(1) : '---';
  const headingDeg = curDrone ? Math.round((curDrone.orientation.yaw + 360) % 360) : 0;
  const rollDeg = curDrone?.orientation.roll || 0;
  const dronePitchDeg = curDrone?.orientation.pitch || 0;

  const toggleBackendMode = async () => {
    const nextMode = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
    setCameraMode(nextMode);
    if (nextMode === 'THERMAL_FLIR') {
      setPalette('IRONBOW');
    } else {
      setPalette('RGB');
    }
    try {
      await fetch(`/api/v1/camera/${selectedDroneId}/mode?mode=${nextMode}`, { method: 'POST' });
      tacticalVoice.speak(`Cámara conmutada a modo ${nextMode === 'RGB' ? 'óptico RGB' : 'térmico FLIR'}`, 'cam');
    } catch (e) {
      console.warn('Failed to switch camera mode:', e);
    }
  };

  const handleGimbalChange = async (pitch: number, yaw: number, zoom: number) => {
    setGimbal(selectedDroneId, { pitch_deg: pitch, yaw_deg: yaw, zoom });
    try {
      await fetch(`/api/v1/camera/${selectedDroneId}/gimbal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch_deg: pitch, yaw_deg: yaw, zoom }),
      });
    } catch (e) {
      console.warn('Gimbal error:', e);
    }
  };

  const applyPreset = async (preset: 'nadir' | 'horizon' | 'search_forward') => {
    tacticalAudio.playButtonBeep();
    try {
      await fetch(`/api/v1/camera/${selectedDroneId}/preset/${preset}`, { method: 'POST' });
      if (preset === 'nadir') {
        setGimbal(selectedDroneId, { pitch_deg: -90, yaw_deg: 0 });
      } else if (preset === 'horizon') {
        setGimbal(selectedDroneId, { pitch_deg: 0, yaw_deg: 0 });
      } else {
        setGimbal(selectedDroneId, { pitch_deg: -45, yaw_deg: 0 });
      }
    } catch (e) {
      console.warn('Preset error:', e);
    }
  };

  const takeSnapshot = async () => {
    setIsCapturing(true);
    tacticalAudio.playCameraShutter();
    try {
      const res = await fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' });
      const data = await res.json();
      setLastSnapshotMsg(`Capturado: ${data.filename}`);
      tacticalVoice.speak('Evidencia forense capturada y guardada', 'snap');
      setTimeout(() => setLastSnapshotMsg(null), 4000);
    } catch (e) {
      setLastSnapshotMsg('Error al capturar evidencia');
    } finally {
      setIsCapturing(false);
    }
  };

  // Direct live MJPEG stream
  const streamUrl = `/api/v1/camera/${selectedDroneId}/stream`;

  // Palette filter CSS
  let paletteFilter = 'none';
  if (palette === 'WHITE_HOT') {
    paletteFilter = 'grayscale(1) invert(0) contrast(1.35) brightness(1.1)';
  } else if (palette === 'BLACK_HOT') {
    paletteFilter = 'grayscale(1) invert(1) contrast(1.4) brightness(0.9)';
  } else if (palette === 'IRONBOW') {
    paletteFilter = 'contrast(1.4) saturate(2.4) hue-rotate(185deg)';
  }

  return (
    <div className="relative w-full h-full min-h-[480px] bg-black rounded-2xl overflow-hidden border border-cyan-500/30 shadow-2xl flex flex-col justify-between select-none">
      {/* 1. Main Live Targeting Pod Video Feed */}
      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden bg-[#030712]">
        <img
          src={streamUrl}
          alt={`FPV Gimbal ${selectedDroneId}`}
          className="w-full h-full object-contain"
          style={{ filter: paletteFilter }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="100%" height="100%" fill="%230b1220"/><text x="50%" y="50%" fill="%2338bdf8" font-family="monospace" font-size="16" text-anchor="middle">INICIALIZANDO TRANSMISIÓN FPV MJPEG ARES...</text></svg>';
          }}
        />

        {/* ------------------------------------------------------------- */}
        {/* MILITARY TARGETING POD OSD (AN/AAS-52 MTS HUD OVERLAY)        */}
        {/* ------------------------------------------------------------- */}

        {/* Top Compass Heading Tape */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-4 py-1 rounded-xl border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center space-x-3 pointer-events-none shadow-lg">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>HDG: <strong className="text-white">{headingDeg.toString().padStart(3, '0')}°</strong></span>
          <span className="text-slate-500">|</span>
          <span className="text-amber-300 font-bold">
            {headingDeg >= 337 || headingDeg < 23 ? 'Norte [N]' : headingDeg < 68 ? 'Noreste [NE]' : headingDeg < 113 ? 'Este [E]' : headingDeg < 158 ? 'Sureste [SE]' : headingDeg < 203 ? 'Sur [S]' : headingDeg < 248 ? 'Suroeste [SW]' : headingDeg < 293 ? 'Oeste [W]' : 'Noroeste [NW]'}
          </span>
          <span className="text-slate-500">|</span>
          <span>LRF SLANT: <strong className="text-emerald-400">{slantRangeM}m</strong></span>
        </div>

        {/* Left Flight Data HUD Ladder */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-slate-950/75 backdrop-blur-md p-2 rounded-xl border border-cyan-500/30 text-[11px] font-mono text-slate-300 space-y-1 pointer-events-none shadow-xl">
          <div className="text-cyan-400 font-bold flex items-center">
            <Target className="w-3 h-3 mr-1" />
            TELEMETRÍA GIMBAL
          </div>
          <div>ALT: <span className="text-white font-bold">{alt.toFixed(1)}m</span></div>
          <div>VEL: <span className="text-white font-bold">{curDrone?.speed_ms.toFixed(1) || '0.0'} m/s</span></div>
          <div>PITCH: <span className="text-cyan-300 font-bold">{currentPtz.pitch_deg}°</span></div>
          <div>YAW: <span className="text-cyan-300 font-bold">{currentPtz.yaw_deg}°</span></div>
          <div>ZOOM: <span className="text-amber-300 font-bold">{currentPtz.zoom.toFixed(1)}x</span></div>
        </div>

        {/* Right Edge AI Status HUD */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-slate-950/75 backdrop-blur-md p-2 rounded-xl border border-cyan-500/30 text-[11px] font-mono text-slate-300 space-y-1 pointer-events-none shadow-xl text-right">
          <div className="text-emerald-400 font-bold flex items-center justify-end">
            <ShieldCheck className="w-3 h-3 mr-1" />
            INFERENCIA D-FINE
          </div>
          <div>MODELO: <span className="text-white font-bold">RT-DETR-L</span></div>
          <div>FPS IA: <span className="text-amber-300 font-bold">{aiStatus?.fps.toFixed(1) || '30.0'} FPS</span></div>
          <div>GPU ORIN: <span className="text-cyan-300 font-bold">{aiStatus?.gpu_temp_c.toFixed(1) || '48.2'}°C</span></div>
          <div>PALETA: <span className="text-emerald-300 font-bold">{palette}</span></div>
        </div>

        {/* Dynamic Artificial Horizon & Center Reticle */}
        <div 
          className="absolute inset-0 pointer-events-none flex items-center justify-center transition-transform duration-75"
          style={{ transform: `rotate(${-rollDeg}deg)` }}
        >
          {/* Pitch Ladder Bar */}
          <div 
            className="absolute w-44 flex items-center justify-between"
            style={{ transform: `translateY(${dronePitchDeg * 2}px)` }}
          >
            <div className="w-14 h-[2px] bg-cyan-400/60 flex items-center">
              <div className="w-[2px] h-3 bg-cyan-400/60" />
            </div>
            <span className="text-[10px] font-mono text-cyan-300 font-bold opacity-75">
              {dronePitchDeg > 0 ? `+${dronePitchDeg.toFixed(0)}°` : `${dronePitchDeg.toFixed(0)}°`}
            </span>
            <div className="w-14 h-[2px] bg-cyan-400/60 flex items-center justify-end">
              <div className="w-[2px] h-3 bg-cyan-400/60" />
            </div>
          </div>

          {/* Central Targeting Reticle */}
          <div className="w-16 h-16 border border-cyan-400/70 rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
            <div className="w-1.5 h-1.5 bg-white rounded-full absolute" />
          </div>
          <div className="absolute w-48 h-[1px] bg-cyan-400/30" />
          <div className="absolute h-48 w-[1px] bg-cyan-400/30" />
          <div className="absolute w-28 h-28 border border-dashed border-cyan-500/30 rounded-full pointer-events-none" />
        </div>

        {/* Top Left FPV Status Badge */}
        <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center space-x-2 shadow-lg">
          <Video className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="font-extrabold">FPV {selectedDroneId}</span>
          <span className="text-slate-500">|</span>
          <span className="text-white font-bold">{cameraMode}</span>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400 font-bold">20 FPS LIVE</span>
        </div>

        {/* Snapshot Success Notification */}
        {lastSnapshotMsg && (
          <div className="absolute top-14 left-3 bg-emerald-950/95 border border-emerald-500 text-emerald-200 text-xs px-3.5 py-2 rounded-xl shadow-2xl animate-bounce flex items-center space-x-2">
            <span>📸</span>
            <span className="font-bold">{lastSnapshotMsg}</span>
          </div>
        )}
      </div>

      {/* 2. PTZ & Camera Tactical Toolbar */}
      <div className="bg-slate-900/95 border-t border-cyan-500/30 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Palettes & Capture */}
        <div className="flex items-center space-x-2">
          {/* FLIR Mode Toggle */}
          <button
            onClick={toggleBackendMode}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition shadow-sm ${
              cameraMode === 'THERMAL_FLIR'
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-cyan-700 hover:bg-cyan-600 text-white'
            }`}
          >
            {cameraMode === 'THERMAL_FLIR' ? <Flame className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{cameraMode === 'THERMAL_FLIR' ? 'MODO FLIR TÉRMICO' : 'MODO RGB ÓPTICO'}</span>
          </button>

          {/* Palette Selector Buttons */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-700 flex items-center space-x-1 text-[11px]">
            <button
              onClick={() => { setPalette('RGB'); tacticalAudio.playButtonBeep(); }}
              className={`px-2 py-1 rounded-lg font-bold transition ${palette === 'RGB' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              RGB
            </button>
            <button
              onClick={() => { setPalette('WHITE_HOT'); tacticalAudio.playButtonBeep(); }}
              className={`px-2 py-1 rounded-lg font-bold transition ${palette === 'WHITE_HOT' ? 'bg-slate-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              White-Hot
            </button>
            <button
              onClick={() => { setPalette('BLACK_HOT'); tacticalAudio.playButtonBeep(); }}
              className={`px-2 py-1 rounded-lg font-bold transition ${palette === 'BLACK_HOT' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
            >
              Black-Hot
            </button>
            <button
              onClick={() => { setPalette('IRONBOW'); tacticalAudio.playButtonBeep(); }}
              className={`px-2 py-1 rounded-lg font-bold transition ${palette === 'IRONBOW' ? 'bg-gradient-to-r from-purple-600 to-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Ironbow
            </button>
          </div>

          {/* Snapshot Button */}
          <button
            onClick={takeSnapshot}
            disabled={isCapturing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg"
          >
            <Camera className="w-4 h-4" />
            <span>{isCapturing ? 'CAPTURANDO...' : 'SNAPSHOT EVIDENCIA (C)'}</span>
          </button>
        </div>

        {/* Gimbal Sliders & Presets */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 flex items-center"><ArrowDown className="w-3.5 h-3.5 mr-1" /> Pitch:</span>
            <input
              type="range"
              min="-90"
              max="20"
              value={currentPtz.pitch_deg}
              onChange={(e) => handleGimbalChange(parseFloat(e.target.value), currentPtz.yaw_deg, currentPtz.zoom)}
              className="w-20 accent-cyan-400"
            />
            <span className="font-mono text-cyan-300 w-8">{currentPtz.pitch_deg}°</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400 flex items-center"><Compass className="w-3.5 h-3.5 mr-1" /> Yaw:</span>
            <input
              type="range"
              min="-90"
              max="90"
              value={currentPtz.yaw_deg}
              onChange={(e) => handleGimbalChange(currentPtz.pitch_deg, parseFloat(e.target.value), currentPtz.zoom)}
              className="w-20 accent-cyan-400"
            />
            <span className="font-mono text-cyan-300 w-8">{currentPtz.yaw_deg}°</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400 flex items-center"><ZoomIn className="w-3.5 h-3.5 mr-1" /> Zoom:</span>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.1"
              value={currentPtz.zoom}
              onChange={(e) => handleGimbalChange(currentPtz.pitch_deg, currentPtz.yaw_deg, parseFloat(e.target.value))}
              className="w-16 accent-cyan-400"
            />
            <span className="font-mono text-cyan-300 w-8">{currentPtz.zoom.toFixed(1)}x</span>
          </div>

          {/* Presets */}
          <div className="flex items-center space-x-1.5 border-l border-slate-700 pl-3">
            <button
              onClick={() => applyPreset('nadir')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-[11px]"
            >
              Nadir 90°
            </button>
            <button
              onClick={() => applyPreset('search_forward')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-[11px]"
            >
              45° Búsqueda
            </button>
            <button
              onClick={() => applyPreset('horizon')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-[11px]"
            >
              Horizonte
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
