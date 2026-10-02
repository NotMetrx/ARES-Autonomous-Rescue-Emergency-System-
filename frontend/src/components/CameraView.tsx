import React, { useState, useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { 
  Camera, 
  Flame, 
  Eye, 
  Video, 
  ZoomIn, 
  Compass, 
  ArrowDown, 
  Target, 
  ShieldCheck,
  Smartphone,
  QrCode,
  Wifi,
  Activity,
  Check,
  Copy,
  ExternalLink,
  X,
  Radio,
  Zap,
  TrendingUp,
  Sliders,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';

type FlirPalette = 'RGB' | 'WHITE_HOT' | 'BLACK_HOT' | 'IRONBOW';

interface CameraAnalytics {
  drone_id: string;
  is_external_active: boolean;
  source: string;
  fps: number;
  latency_ms: number;
  sla_compliant: boolean;
  survivors_count: number;
  total_survivors_detected: number;
  detections: Array<{
    class_name: string;
    confidence: number;
    uncertainty: number;
    bbox: [number, number, number, number];
    distance_m: number;
    geo: { lat: number; lon: number; alt: number };
    source: string;
    track_id?: number;
    hit_count?: number;
  }>;
  tracked_history?: Array<{
    track_id: number;
    detection_id: string;
    drone_id: string;
    bbox: number[];
    confidence: number;
    uncertainty: number;
    distance_m: number;
    geo: { lat: number; lon: number; alt: number };
    first_seen: number;
    last_seen: number;
    hit_count: number;
    crop_filename?: string;
    crop_url?: string;
    is_active: boolean;
    created_at?: string;
  }>;
  active_tracks_count?: number;
  history: Array<{
    t: number;
    latency_ms: number;
    fps: number;
    targets_count: number;
    max_conf: number;
    avg_unc: number;
  }>;
  mode: string;
}

export const CameraView: React.FC = () => {
  const { 
    selectedDroneId, 
    setSelectedDroneId, 
    cameraMode, 
    setCameraMode, 
    ptz, 
    setGimbal, 
    drones 
  } = useSwarmStore();

  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSnapshotMsg, setLastSnapshotMsg] = useState<string | null>(null);
  const [palette, setPalette] = useState<FlirPalette>('RGB');
  
  // Real-time Analytics & Modal States
  const [analytics, setAnalytics] = useState<CameraAnalytics | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [ipStreamUrl, setIpStreamUrl] = useState('');
  const [isConnectingIp, setIsConnectingIp] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'metrics' | 'tracking'>('metrics');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  
  // Local Webcam Ingestion State
  const [isWebcamStreaming, setIsWebcamStreaming] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localWebcamInterval = useRef<any>(null);

  const currentPtz = ptz[selectedDroneId] || { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 };
  const curDrone = drones.find(d => d.drone_id === selectedDroneId);

  // Flight Telemetry Calculations
  const pitchRad = Math.abs(currentPtz.pitch_deg) * (Math.PI / 180.0);
  const alt = curDrone?.alt || 30.0;
  const slantRangeM = pitchRad > 0.05 ? (alt / Math.sin(pitchRad)).toFixed(1) : '---';
  const headingDeg = curDrone ? Math.round((curDrone.orientation.yaw + 360) % 360) : 0;
  const rollDeg = curDrone?.orientation.roll || 0;
  const dronePitchDeg = curDrone?.orientation.pitch || 0;

  // Compute Mobile URL for QR Code & Direct Access
  const host = window.location.hostname || 'localhost';
  const mobileCamUrl = `http://${host}:8000/mobile-cam?drone=${selectedDroneId}`;

  // Poll Real-Time Camera & D-FINE Analytics
  useEffect(() => {
    let isMounted = true;
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`/api/v1/camera/${selectedDroneId}/analytics`);
        if (res.ok) {
          const data: CameraAnalytics = await res.json();
          if (isMounted) {
            setAnalytics(data);
            useSwarmStore.getState().setSurvivorsInView(data.survivors_count ?? 0, 0);
          }
        }
      } catch (e) {
        // Silently continue
      }
    };

    fetchAnalytics();
    const timer = setInterval(fetchAnalytics, 750);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [selectedDroneId]);

  // Clean up local webcam stream on unmount
  useEffect(() => {
    return () => {
      stopLocalWebcam();
    };
  }, []);

  const toggleBackendMode = async () => {
    const nextMode = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
    setCameraMode(nextMode);
    setPalette(nextMode === 'THERMAL_FLIR' ? 'IRONBOW' : 'RGB');
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
      setLastSnapshotMsg(`Capturado: ${data.filepath ? data.filepath.split('/').pop() : 'Evidencia'}`);
      tacticalVoice.speak('Evidencia forense capturada y guardada', 'snap');
      setTimeout(() => setLastSnapshotMsg(null), 4000);
    } catch (e) {
      setLastSnapshotMsg('Error al capturar evidencia');
    } finally {
      setIsCapturing(false);
    }
  };

  // Local Device Webcam Streaming Handler
  const startLocalWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }

      setIsWebcamStreaming(true);
      tacticalVoice.speak(`Webcam local vinculada a ${selectedDroneId}`, 'cam');

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      localWebcamInterval.current = setInterval(() => {
        if (!localVideoRef.current || localVideoRef.current.readyState < 2) return;
        ctx?.drawImage(localVideoRef.current, 0, 0, 640, 360);
        canvas.toBlob((blob) => {
          if (!blob) return;
          fetch(`/api/v1/camera/${selectedDroneId}/feed?source=WEBCAM_LOCAL`, {
            method: 'POST',
            body: blob,
            headers: { 'Content-Type': 'image/jpeg' }
          }).catch(() => {});
        }, 'image/jpeg', 0.75);
      }, 1000 / 22);
    } catch (err: any) {
      console.error('Webcam access error:', err);
      alert('No se pudo acceder a la webcam local: ' + err.message);
    }
  };

  const stopLocalWebcam = () => {
    if (localWebcamInterval.current) {
      clearInterval(localWebcamInterval.current);
      localWebcamInterval.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setIsWebcamStreaming(false);
  };

  const handleConnectIpStream = async () => {
    if (!ipStreamUrl) return;
    setIsConnectingIp(true);
    try {
      const res = await fetch(`/api/v1/camera/${selectedDroneId}/connect-stream?url=${encodeURIComponent(ipStreamUrl)}`, {
        method: 'POST'
      });
      if (res.ok) {
        tacticalVoice.speak(`Cámara IP conectada a ${selectedDroneId}`, 'cam');
        setShowConnectModal(false);
      }
    } catch (e) {
      console.warn('IP Camera error:', e);
    } finally {
      setIsConnectingIp(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(mobileCamUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const streamUrl = `/api/v1/camera/${selectedDroneId}/stream`;

  let paletteFilter = 'none';
  if (palette === 'WHITE_HOT') {
    paletteFilter = 'grayscale(1) invert(0) contrast(1.35) brightness(1.1)';
  } else if (palette === 'BLACK_HOT') {
    paletteFilter = 'grayscale(1) invert(1) contrast(1.4) brightness(0.9)';
  } else if (palette === 'IRONBOW') {
    paletteFilter = 'contrast(1.4) saturate(2.4) hue-rotate(185deg)';
  }

  const detectedTargets = analytics?.detections || [];
  const primarySurvivor = detectedTargets.find(t => t.class_name === 'SURVIVOR') || detectedTargets[0];
  const isExternalLive = Boolean(analytics?.is_external_active);
  const latencyMs = analytics?.latency_ms ?? 11.4;
  const fps = analytics?.fps ?? 20.0;
  const slaOk = latencyMs < 50.0;

  return (
    <div className="relative w-full h-full min-h-[520px] bg-slate-950 rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-2xl flex flex-col justify-between select-none">
      <video ref={localVideoRef} playsInline muted className="hidden" />

      {/* --------------------------------------------------------------------- */}
      {/* TOP TACTICAL CONTROL BAR: Apple-style Glass Header                    */}
      {/* --------------------------------------------------------------------- */}
      <div className="backdrop-blur-2xl bg-slate-900/60 ring-1 ring-white/[0.08] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
        {/* Drone Selector - iOS Segmented Control */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mr-1">UAV:</span>
          <div className="flex p-0.5 rounded-xl bg-black/40 ring-1 ring-white/10 backdrop-blur-md">
            {(['ARES-01', 'ARES-02', 'ARES-03'] as const).map(id => {
              const isSel = id === selectedDroneId;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setSelectedDroneId(id);
                    tacticalAudio.playButtonBeep();
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all duration-300 ease-out flex items-center space-x-1.5 ${
                    isSel
                      ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-cyan-400 shadow-sm shadow-cyan-400' : 'bg-slate-600'}`} />
                  <span>{id}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Source status & actions */}
        <div className="flex items-center space-x-2.5">
          {/* External Source Indicator */}
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] font-mono text-[11px]">
            <Radio className={`w-3.5 h-3.5 ${isExternalLive ? 'text-emerald-400 animate-pulse' : 'text-cyan-400'}`} />
            <span className="text-slate-400">FUENTE:</span>
            <span className={isExternalLive ? 'text-emerald-300 font-semibold' : 'text-cyan-300 font-semibold'}>
              {analytics?.source || (isExternalLive ? 'CÁMARA CELULAR' : 'PROCEDURAL')}
            </span>
          </div>

          {/* Connect Mobile Camera Button */}
          <button
            onClick={() => setShowConnectModal(true)}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm ${
              isExternalLive 
                ? 'bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25' 
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-blue-500/20 shadow-md'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{isExternalLive ? '📱 CELULAR CONECTADO' : '📱 VINCULAR CELULAR / WEBCAM'}</span>
          </button>

          {/* Toggle Analytics Sidebar */}
          <button
            onClick={() => setShowAnalyticsPanel(prev => !prev)}
            className={`p-1.5 rounded-xl ring-1 transition-all duration-200 hover:scale-105 active:scale-95 ${
              showAnalyticsPanel 
                ? 'bg-white/15 ring-white/20 text-cyan-300' 
                : 'bg-white/[0.04] ring-white/[0.08] text-slate-400 hover:text-white'
            }`}
            title="Alternar panel de analíticas D-FINE"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MAIN VIEWPORT: Video Stream + Tactical OSD + Analytics Drawer         */}
      {/* --------------------------------------------------------------------- */}
      <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden bg-[#030712]">
        {/* Main Live MJPEG Video Stream */}
        <img
          src={streamUrl}
          alt={`FPV Gimbal ${selectedDroneId}`}
          className="w-full h-full object-contain"
          style={{ filter: paletteFilter }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="100%" height="100%" fill="%230b1220"/><text x="50%" y="50%" fill="%2338bdf8" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">INICIALIZANDO TRANSMISIÓN FPV MJPEG ARES...</text></svg>';
          }}
        />

        {/* ------------------------------------------------------------- */}
        {/* MILITARY TARGETING POD OSD (AN/AAS-52 MTS HUD OVERLAY)        */}
        {/* ------------------------------------------------------------- */}

        {/* Top Compass Heading Tape */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 backdrop-blur-xl bg-black/50 px-4 py-1.5 rounded-2xl ring-1 ring-white/15 text-[11px] font-mono text-cyan-300 flex items-center space-x-3 pointer-events-none shadow-xl">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>HDG: <strong className="text-white">{headingDeg.toString().padStart(3, '0')}°</strong></span>
          <span className="text-white/20">|</span>
          <span className="text-amber-300 font-semibold">
            {headingDeg >= 337 || headingDeg < 23 ? 'Norte [N]' : headingDeg < 68 ? 'Noreste [NE]' : headingDeg < 113 ? 'Este [E]' : headingDeg < 158 ? 'Sureste [SE]' : headingDeg < 203 ? 'Sur [S]' : headingDeg < 248 ? 'Suroeste [SW]' : headingDeg < 293 ? 'Oeste [W]' : 'Noroeste [NW]'}
          </span>
          <span className="text-white/20">|</span>
          <span>LRF SLANT: <strong className="text-emerald-400">{slantRangeM}m</strong></span>
        </div>

        {/* Left Flight Data HUD Ladder */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 backdrop-blur-xl bg-black/50 p-3 rounded-2xl ring-1 ring-white/10 text-[11px] font-mono text-slate-300 space-y-1.5 pointer-events-none shadow-2xl">
          <div className="text-cyan-400 font-semibold flex items-center mb-1">
            <Target className="w-3 h-3 mr-1.5" />
            TELEMETRÍA GIMBAL
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">ALT:</span>
            <span className="text-white font-semibold">{alt.toFixed(1)}m</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">VEL:</span>
            <span className="text-white font-semibold">{curDrone?.speed_ms.toFixed(1) || '0.0'} m/s</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">PITCH:</span>
            <span className="text-cyan-300 font-semibold">{currentPtz.pitch_deg}°</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">YAW:</span>
            <span className="text-cyan-300 font-semibold">{currentPtz.yaw_deg}°</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">ZOOM:</span>
            <span className="text-amber-300 font-semibold">{currentPtz.zoom.toFixed(1)}x</span>
          </div>
        </div>

        {/* Artificial Horizon & Center Reticle */}
        <div 
          className="absolute inset-0 pointer-events-none flex items-center justify-center transition-transform duration-75"
          style={{ transform: `rotate(${-rollDeg}deg)` }}
        >
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
          <div className="w-16 h-16 border border-cyan-400/50 rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping opacity-60" />
            <div className="w-1.5 h-1.5 bg-white rounded-full absolute shadow-sm shadow-cyan-400" />
          </div>
          <div className="absolute w-48 h-[1px] bg-cyan-400/20" />
          <div className="absolute h-48 w-[1px] bg-cyan-400/20" />
        </div>

        {/* Top Left FPV Status Badge */}
        <div className="absolute top-4 left-4 backdrop-blur-xl bg-black/50 px-3.5 py-1.5 rounded-2xl ring-1 ring-white/10 text-xs font-mono text-cyan-300 flex items-center space-x-2.5 shadow-xl">
          <Video className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">FPV {selectedDroneId}</span>
          <span className="text-white/20">|</span>
          <span className="text-slate-300 font-medium">{cameraMode}</span>
          <span className="text-white/20">|</span>
          <span className="text-emerald-400 font-semibold">{fps.toFixed(0)} FPS</span>
        </div>

        {/* Snapshot Notification Alert */}
        {lastSnapshotMsg && (
          <div className="absolute top-16 left-4 backdrop-blur-2xl bg-emerald-500/20 ring-1 ring-emerald-500/40 text-emerald-100 text-xs px-4 py-2 rounded-2xl shadow-2xl animate-slideUp flex items-center space-x-2">
            <span>📸</span>
            <span className="font-semibold">{lastSnapshotMsg}</span>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* RIGHT SIDE: REAL-TIME D-FINE AI ANALYTICS SIDEBAR             */}
        {/* ------------------------------------------------------------- */}
        {showAnalyticsPanel && (
          <aside className="absolute right-4 top-4 bottom-4 w-76 backdrop-blur-2xl bg-slate-950/70 ring-1 ring-white/10 rounded-3xl p-3.5 shadow-2xl flex flex-col justify-between text-xs font-sans z-10 overflow-y-auto">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                <div className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-white tracking-wide text-xs">ANALÍTICAS D-FINE</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-semibold font-mono ring-1 ${
                  slaOk ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-rose-500/10 text-rose-400 ring-rose-500/20'
                }`}>
                  {slaOk ? 'SLA <50ms OK' : 'SLA EXCEDIDO'}
                </span>
              </div>

              {/* Sub-tab Switcher: iOS Segmented Control */}
              <div className="flex bg-black/40 rounded-xl p-0.5 ring-1 ring-white/10 text-[10px] font-medium">
                <button
                  onClick={() => setSidebarTab('metrics')}
                  className={`flex-1 py-1.5 rounded-lg transition-all duration-200 ${
                    sidebarTab === 'metrics'
                      ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📊 Telemetría
                </button>
                <button
                  onClick={() => setSidebarTab('tracking')}
                  className={`flex-1 py-1.5 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1 ${
                    sidebarTab === 'tracking'
                      ? 'bg-emerald-500/20 text-emerald-200 shadow-sm ring-1 ring-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🎯 Tracking</span>
                  {(analytics?.tracked_history?.length || 0) > 0 && (
                    <span className="px-1.5 py-0.2 bg-black/40 text-emerald-300 rounded-full text-[9px] font-bold">
                      {analytics?.tracked_history?.length}
                    </span>
                  )}
                </button>
              </div>

              {sidebarTab === 'metrics' ? (
                <>
                  {/* Neural Head Inference Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="backdrop-blur-md bg-white/[0.03] p-2.5 rounded-2xl ring-1 ring-white/[0.06]">
                      <div className="text-slate-400 text-[9px] uppercase tracking-wider">LATENCIA INFERENCIA</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">{latencyMs.toFixed(1)} ms</div>
                      <div className="w-full bg-white/[0.06] h-1.5 rounded-full mt-2 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${slaOk ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, (latencyMs / 50.0) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="backdrop-blur-md bg-white/[0.03] p-2.5 rounded-2xl ring-1 ring-white/[0.06]">
                      <div className="text-slate-400 text-[9px] uppercase tracking-wider">FPS TRANSMISIÓN</div>
                      <div className="text-base font-bold text-cyan-300 mt-0.5 font-mono">{fps.toFixed(1)} FPS</div>
                      <div className="text-[9px] text-slate-500 mt-1">Tiempo real 20Hz+</div>
                    </div>
                  </div>

                  {/* Survivor Acquisition Card */}
                  {primarySurvivor ? (
                    <div className="bg-gradient-to-b from-emerald-500/10 to-slate-900/60 ring-1 ring-emerald-500/30 rounded-2xl p-3 shadow-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center">
                          <Target className="w-3 h-3 mr-1 animate-pulse" />
                          OBJETIVO IDENTIFICADO
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[9px] font-bold rounded-lg ring-1 ring-emerald-500/30">
                          CRÍTICO P1
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-200 font-semibold text-xs">{primarySurvivor.class_name}</span>
                        <span className="text-sm font-bold text-white font-mono">
                          {(primarySurvivor.confidence * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 space-y-1 pt-1.5 border-t border-white/[0.08] font-mono">
                        <div className="flex justify-between">
                          <span>Incertidumbre FDR (σ):</span>
                          <strong className="text-amber-300">{primarySurvivor.uncertainty.toFixed(3)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Distancia Estimada:</span>
                          <strong className="text-white">{primarySurvivor.distance_m} m</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Coordenadas WGS84:</span>
                          <strong className="text-cyan-300">
                            {primarySurvivor.geo.lat.toFixed(5)}, {primarySurvivor.geo.lon.toFixed(5)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="backdrop-blur-md bg-white/[0.02] ring-1 ring-white/[0.06] rounded-2xl p-4 text-center space-y-1.5">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse mx-auto" />
                      <div className="text-slate-300 font-semibold text-xs">BÚSQUEDA NEURONAL ACTIVA</div>
                      <p className="text-[10px] text-slate-500">Escaneando sector con D-FINE RT-DETR...</p>
                    </div>
                  )}

                  {/* Sparkline / Historical Analytics Graph */}
                  <div className="backdrop-blur-md bg-white/[0.03] p-3 rounded-2xl ring-1 ring-white/[0.06] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 flex items-center font-medium">
                        <TrendingUp className="w-3 h-3 mr-1 text-cyan-400" />
                        HISTORIAL DE LATENCIA (ms)
                      </span>
                      <span className="text-slate-500 text-[9px] font-mono">&lt;50ms SLA</span>
                    </div>
                    {/* SVG Mini Latency Chart */}
                    <div className="w-full h-12 flex items-end space-x-1 pt-1">
                      {(analytics?.history || Array(15).fill({ latency_ms: 12.0 })).slice(-15).map((h, i) => {
                        const heightPct = Math.min(100, Math.max(10, (h.latency_ms / 60.0) * 100));
                        const isSpike = h.latency_ms >= 50.0;
                        return (
                          <div key={i} className="flex-1 flex flex-col justify-end items-center h-full">
                            <div 
                              className={`w-full rounded-t transition-all duration-300 ${isSpike ? 'bg-rose-500' : 'bg-gradient-to-t from-blue-500 to-cyan-400'}`}
                              style={{ height: `${heightPct}%` }}
                              title={`${h.latency_ms.toFixed(1)} ms`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* Object Tracking Gallery */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-white/[0.06] pb-1.5">
                    <span>HISTORIAL DE PERSONAS:</span>
                    <strong className="text-emerald-400 font-mono">{analytics?.tracked_history?.length || 0} Registros</strong>
                  </div>

                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {analytics?.tracked_history && analytics.tracked_history.length > 0 ? (
                      analytics.tracked_history.map((trk) => (
                        <div
                          key={trk.track_id}
                          onClick={() => trk.crop_url && setSelectedPhoto(trk.crop_url)}
                          className="backdrop-blur-md bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-emerald-500/40 rounded-2xl p-2.5 flex space-x-3 transition-all duration-200 cursor-pointer group hover:-translate-y-0.5"
                        >
                          {/* Person Crop Photo */}
                          <div className="w-14 h-14 bg-black rounded-xl ring-1 ring-white/10 overflow-hidden shrink-0 flex items-center justify-center relative">
                            {trk.crop_url ? (
                              <>
                                <img
                                  src={trk.crop_url}
                                  alt={`Track ${trk.track_id}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ZoomIn className="w-4 h-4 text-cyan-300" />
                                </div>
                              </>
                            ) : (
                              <Target className="w-5 h-5 text-slate-600" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 text-[10px] space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-emerald-300 flex items-center">
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${trk.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                TRACK #{trk.track_id}
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">{trk.created_at || 'En vivo'}</span>
                            </div>
                            <div className="text-slate-300">
                              Certeza: <strong className="text-emerald-400 font-mono">{(trk.confidence * 100).toFixed(0)}%</strong>
                              <span className="text-slate-500 mx-1">•</span>
                              <strong className="text-cyan-300 font-mono">{trk.hit_count}x hits</strong>
                            </div>
                            <div className="text-slate-400 text-[9px]">
                              LRF: <span className="text-white font-mono">{trk.distance_m}m</span> | FDR: <span className="text-amber-300 font-mono">{trk.uncertainty.toFixed(3)}</span>
                            </div>
                            <div className="text-slate-500 text-[8px] truncate font-mono">
                              Lat: {trk.geo?.lat?.toFixed(5)}, Lon: {trk.geo?.lon?.toFixed(5)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-slate-500 text-[10px] italic space-y-1.5">
                        <Target className="w-6 h-6 text-slate-700 mx-auto" />
                        <div>Sin personas rastreadas aún.</div>
                        <p className="text-[9px] text-slate-600">Apunta la cámara hacia personas para activar el seguimiento.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action Dispatch Button */}
            <div className="pt-2.5 border-t border-white/[0.08]">
              <button
                onClick={() => {
                  if (primarySurvivor) {
                    tacticalVoice.speak(`Despachando unidad de rescate a coordenadas de sobreviviente`, 'goto', true);
                  }
                }}
                className="w-full py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>DESPACHAR RESCATE A COORDENADAS</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* BOTTOM TACTICAL TOOLBAR: Apple-style Glass Toolbar                    */}
      {/* --------------------------------------------------------------------- */}
      <div className="backdrop-blur-2xl bg-slate-900/60 ring-1 ring-white/[0.08] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
        {/* Palettes & Capture */}
        <div className="flex items-center space-x-2.5">
          {/* FLIR Mode Toggle */}
          <button
            onClick={toggleBackendMode}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm ${
              cameraMode === 'THERMAL_FLIR'
                ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-500/30'
                : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15'
            }`}
          >
            {cameraMode === 'THERMAL_FLIR' ? <Flame className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-cyan-400" />}
            <span>{cameraMode === 'THERMAL_FLIR' ? 'MODO FLIR TÉRMICO' : 'MODO RGB ÓPTICO'}</span>
          </button>

          {/* Palette Selector - Segmented Style */}
          <div className="p-0.5 rounded-xl bg-black/40 ring-1 ring-white/10 backdrop-blur-md flex items-center space-x-0.5 text-[11px]">
            {(['RGB', 'WHITE_HOT', 'BLACK_HOT', 'IRONBOW'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setPalette(p); tacticalAudio.playButtonBeep(); }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all duration-200 ${
                  palette === p 
                    ? p === 'IRONBOW' 
                      ? 'bg-gradient-to-r from-purple-500 to-amber-500 text-white shadow-sm' 
                      : 'bg-white/15 text-white shadow-sm ring-1 ring-white/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === 'WHITE_HOT' ? 'White-Hot' : p === 'BLACK_HOT' ? 'Black-Hot' : p === 'IRONBOW' ? 'Ironbow' : 'RGB'}
              </button>
            ))}
          </div>

          {/* Snapshot Button */}
          <button
            onClick={takeSnapshot}
            disabled={isCapturing}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-rose-600/20"
          >
            <Camera className="w-4 h-4" />
            <span>{isCapturing ? 'CAPTURANDO...' : 'SNAPSHOT (C)'}</span>
          </button>
        </div>

        {/* Gimbal Sliders & Presets */}
        <div className="flex items-center space-x-3.5">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 flex items-center text-[11px]"><ArrowDown className="w-3 h-3 mr-1" /> Pitch:</span>
            <input
              type="range"
              min="-90"
              max="20"
              value={currentPtz.pitch_deg}
              onChange={(e) => handleGimbalChange(parseFloat(e.target.value), currentPtz.yaw_deg, currentPtz.zoom)}
              className="w-16 accent-blue-400 h-1 bg-white/10 rounded-full"
            />
            <span className="font-mono text-cyan-300 w-7 text-[11px] text-right">{currentPtz.pitch_deg}°</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 flex items-center text-[11px]"><Compass className="w-3 h-3 mr-1" /> Yaw:</span>
            <input
              type="range"
              min="-90"
              max="90"
              value={currentPtz.yaw_deg}
              onChange={(e) => handleGimbalChange(currentPtz.pitch_deg, parseFloat(e.target.value), currentPtz.zoom)}
              className="w-16 accent-blue-400 h-1 bg-white/10 rounded-full"
            />
            <span className="font-mono text-cyan-300 w-7 text-[11px] text-right">{currentPtz.yaw_deg}°</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 flex items-center text-[11px]"><ZoomIn className="w-3 h-3 mr-1" /> Zoom:</span>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.1"
              value={currentPtz.zoom}
              onChange={(e) => handleGimbalChange(currentPtz.pitch_deg, currentPtz.yaw_deg, parseFloat(e.target.value))}
              className="w-14 accent-blue-400 h-1 bg-white/10 rounded-full"
            />
            <span className="font-mono text-cyan-300 w-7 text-[11px] text-right">{currentPtz.zoom.toFixed(1)}x</span>
          </div>

          {/* Presets - iOS Pill Buttons */}
          <div className="flex items-center space-x-1 border-l border-white/10 pl-3">
            <button
              onClick={() => applyPreset('nadir')}
              className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-200 rounded-lg font-medium text-[10px] transition-all hover:scale-105 active:scale-95"
            >
              Nadir 90°
            </button>
            <button
              onClick={() => applyPreset('search_forward')}
              className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-200 rounded-lg font-medium text-[10px] transition-all hover:scale-105 active:scale-95"
            >
              45° Búsqueda
            </button>
            <button
              onClick={() => applyPreset('horizon')}
              className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-200 rounded-lg font-medium text-[10px] transition-all hover:scale-105 active:scale-95"
            >
              Horizonte
            </button>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: VINCULAR CÁMARA (CELULAR QR / WEBCAM LOCAL / IP CAMERA)         */}
      {/* --------------------------------------------------------------------- */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn">
          <div className="backdrop-blur-2xl bg-slate-900/80 ring-1 ring-white/15 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-200 font-sans space-y-5 animate-scaleIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center space-x-2.5">
                <Smartphone className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-white tracking-wide">
                  Vincular Cámara a {selectedDroneId}
                </h3>
              </div>
              <button 
                onClick={() => setShowConnectModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Option 1: Mobile Phone QR Code Broadcast */}
            <div className="backdrop-blur-md bg-white/[0.03] ring-1 ring-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-300 flex items-center">
                  <QrCode className="w-4 h-4 mr-1.5" />
                  OPCIÓN A: ESCANEAR CON LA CÁMARA DE TU CELULAR
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                  RECOMENDADO
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* QR Code Container */}
                <div className="bg-white p-2.5 rounded-2xl shrink-0 shadow-lg">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(mobileCamUrl)}`}
                    alt="QR Transmisor Móvil"
                    className="w-32 h-32 object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>

                <div className="space-y-2 text-xs text-slate-300">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Abre la cámara de tu celular conectado a la misma red Wi-Fi y escanea este código. Abrirá automáticamente el transmisor FPV y vinculará la cámara al dron <strong className="text-cyan-300">{selectedDroneId}</strong>.
                  </p>
                  
                  {/* Direct Link Input with Copy & Open Buttons */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input 
                      type="text" 
                      readOnly 
                      value={mobileCamUrl} 
                      className="bg-black/50 border border-white/10 text-cyan-300 text-[11px] font-mono rounded-xl px-3 py-2 flex-1 select-all outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center space-x-1 transition"
                      title="Copiar enlace"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <a
                      href={mobileCamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl flex items-center space-x-1 transition shadow-sm"
                      title="Abrir en pestaña"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Option 2: Use Local Webcam (Laptop / PC) */}
            <div className="backdrop-blur-md bg-white/[0.03] ring-1 ring-white/[0.08] rounded-2xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-200 flex items-center">
                  <Video className="w-4 h-4 mr-1.5 text-amber-400" />
                  OPCIÓN B: CÁMARA DE ESTE EQUIPO (WEBCAM)
                </div>
                <p className="text-[11px] text-slate-400">
                  Prueba la detección en tiempo real con la webcam de tu laptop.
                </p>
              </div>
              <button
                onClick={isWebcamStreaming ? stopLocalWebcam : startLocalWebcam}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 flex items-center space-x-1.5 ${
                  isWebcamStreaming
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                }`}
              >
                <span>{isWebcamStreaming ? '⏹ DETENER WEBCAM' : '▶ ACTIVAR WEBCAM'}</span>
              </button>
            </div>

            {/* Option 3: Remote IP Camera URL (DroidCam / IP Webcam App) */}
            <div className="backdrop-blur-md bg-white/[0.03] ring-1 ring-white/[0.08] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-200 flex items-center">
                  <Wifi className="w-4 h-4 mr-1.5 text-cyan-400" />
                  OPCIÓN C: DROIDCAM / CÁMARA IP (STREAM ULTRA-BAJA LATENCIA)
                </div>
                <span className="px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30 flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>CERO-BUFFER &lt;25ms</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Abre la app DroidCam en tu celular en la misma red Wi-Fi e ingresa la URL o IP:
              </p>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="ej. http://192.168.105.125:4747/video"
                  value={ipStreamUrl}
                  onChange={(e) => setIpStreamUrl(e.target.value)}
                  className="bg-black/50 border border-white/10 text-white text-xs rounded-xl px-3 py-2 flex-1 focus:outline-none focus:border-cyan-400 font-mono"
                />
                <button
                  onClick={handleConnectIpStream}
                  disabled={isConnectingIp || !ipStreamUrl}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition flex items-center space-x-1"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isConnectingIp ? 'CONECTANDO...' : 'VINCULAR DROIDCAM'}</span>
                </button>
              </div>
              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500">Presets rápidos:</span>
                <button
                  type="button"
                  onClick={() => setIpStreamUrl(`http://${window.location.hostname}:4747/video`)}
                  className="px-2.5 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-300 hover:text-white rounded-lg text-[10px] font-mono transition"
                >
                  DroidCam ({window.location.hostname}:4747)
                </button>
                <button
                  type="button"
                  onClick={() => setIpStreamUrl('http://192.168.105.125:4747/video')}
                  className="px-2.5 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-cyan-300 hover:text-white rounded-lg text-[10px] font-mono transition"
                >
                  192.168.105.125:4747
                </button>
                <button
                  type="button"
                  onClick={() => setIpStreamUrl(`http://${window.location.hostname}:8080/video`)}
                  className="px-2.5 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-slate-300 hover:text-white rounded-lg text-[10px] font-mono transition"
                >
                  IP Webcam (:8080)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* FORENSIC PHOTO MODAL (ENLARGED TRACKED PERSON SNAPSHOT)       */}
      {/* ------------------------------------------------------------- */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedPhoto(null)}
        >
          <div 
            className="backdrop-blur-2xl bg-slate-900/90 ring-1 ring-white/15 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-3 p-5 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center space-x-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-white text-sm">Captura Forense - Tracking Real-Time</span>
              </div>
              <button 
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-black/60 rounded-2xl overflow-hidden ring-1 ring-white/10 flex items-center justify-center min-h-[280px]">
              <img 
                src={selectedPhoto} 
                alt="Tracked Person Capture" 
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span className="font-mono text-[11px] text-cyan-400 truncate max-w-xs">{selectedPhoto}</span>
              <a
                href={selectedPhoto}
                download="forensic_capture.jpg"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 flex items-center space-x-1.5 shadow-md shadow-emerald-600/20"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>DESCARGAR FOTO</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
