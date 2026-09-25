import React, { useState, useEffect } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { Camera, Flame, Eye, Video, ZoomIn, Compass, ArrowDown } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

export const CameraView: React.FC = () => {
  const { selectedDroneId, cameraMode, setCameraMode, ptz, setGimbal } = useSwarmStore();
  const [frameTimestamp, setFrameTimestamp] = useState(Date.now());
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSnapshotMsg, setLastSnapshotMsg] = useState<string | null>(null);

  const currentPtz = ptz[selectedDroneId] || { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 };

  // Refresh frame at 8-10 FPS for video stream preview
  useEffect(() => {
    const interval = setInterval(() => {
      setFrameTimestamp(Date.now());
    }, 120);
    return () => clearInterval(interval);
  }, [selectedDroneId]);

  const toggleMode = async () => {
    const nextMode = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
    setCameraMode(nextMode);
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
    try {
      const res = await fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' });
      const data = await res.json();
      setLastSnapshotMsg(`Capturado: ${data.filename}`);
      tacticalVoice.speak('Evidencia forense capturada y almacenada en disco', 'snap');
      setTimeout(() => setLastSnapshotMsg(null), 4000);
    } catch (e) {
      setLastSnapshotMsg('Error al capturar');
    } finally {
      setIsCapturing(false);
    }
  };

  const frameUrl = `/api/v1/camera/${selectedDroneId}/frame?t=${frameTimestamp}`;

  return (
    <div className="relative w-full h-full min-h-[460px] bg-black rounded-2xl overflow-hidden border border-slate-700/60 shadow-inner flex flex-col justify-between">
      {/* Video Feed */}
      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
        <img
          src={frameUrl}
          alt={`FPV ${selectedDroneId}`}
          className="w-full h-full object-contain"
          onError={(e) => {
            // fallback placeholder if camera is initializing
            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="100%" height="100%" fill="%230b1220"/><text x="50%" y="50%" fill="%2338bdf8" font-family="monospace" font-size="18" text-anchor="middle">SINTETIZADOR DE CÁMARA FPV ARES</text></svg>';
          }}
        />

        {/* Tactical Crosshair Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-cyan-400/50 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-cyan-400 rounded-full" />
          </div>
          <div className="absolute w-36 h-[1px] bg-cyan-400/30" />
          <div className="absolute h-36 w-[1px] bg-cyan-400/30" />
        </div>

        {/* Camera Info Overlay */}
        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-mono text-cyan-300 flex items-center space-x-2">
          <Video className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="font-bold">FPV {selectedDroneId}</span>
          <span className="text-slate-500">|</span>
          <span className={cameraMode === 'THERMAL_FLIR' ? 'text-amber-400 font-bold' : 'text-cyan-300 font-bold'}>
            {cameraMode}
          </span>
          <span className="text-slate-500">|</span>
          <span>Zoom: {currentPtz.zoom.toFixed(1)}x</span>
        </div>

        {lastSnapshotMsg && (
          <div className="absolute top-12 left-3 bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs px-3 py-1.5 rounded-xl shadow-lg animate-bounce">
            📸 {lastSnapshotMsg}
          </div>
        )}
      </div>

      {/* PTZ and Camera Toolbar */}
      <div className="bg-slate-900/90 border-t border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Presets and Mode */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMode}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition shadow-sm ${
              cameraMode === 'THERMAL_FLIR'
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-cyan-700 hover:bg-cyan-600 text-white'
            }`}
          >
            {cameraMode === 'THERMAL_FLIR' ? <Flame className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{cameraMode === 'THERMAL_FLIR' ? 'MODO FLIR TÉRMICO' : 'MODO RGB ÓPTICO'}</span>
          </button>

          <button
            onClick={takeSnapshot}
            disabled={isCapturing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-sm"
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

          <div className="flex items-center space-x-1.5 border-l border-slate-700 pl-3">
            <button
              onClick={() => applyPreset('nadir')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-[11px]"
            >
              Nadir 90°
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
