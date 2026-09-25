import React, { useState, useEffect } from 'react';
import { useSwarmStore } from './store/useSwarmStore';
import { useSwarmWebSocket } from './hooks/useSwarmWebSocket';
import { Header } from './components/Header';
import { KpiRibbon } from './components/KpiRibbon';
import { FleetCards } from './components/FleetCards';
import { TacticalRadar2D } from './components/TacticalRadar2D';
import { DroneActionTray } from './components/DroneActionTray';
import { Viewport3D } from './components/Viewport3D';
import { OfflineMap } from './components/OfflineMap';
import { CameraView } from './components/CameraView';
import { MissionsPanel } from './components/MissionsPanel';
import { DefensePanel } from './components/DefensePanel';
import { DetectionsFeed } from './components/DetectionsFeed';
import { BlackBoxBar } from './components/BlackBoxBar';
import { Compass, Shield, Target, Film, Terminal, Radio } from 'lucide-react';
import { tacticalVoice } from './services/tacticalVoice';

export const App: React.FC = () => {
  // Activate real-time WebSocket telemetry ingestion (20 Hz)
  useSwarmWebSocket();

  const [gotoMode, setGotoMode] = useState<boolean>(false);

  const {
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    selectedDroneId,
    setSelectedDroneId,
    cameraMode,
    setCameraMode,
    toggleVoice,
  } = useSwarmStore();

  // Target Destination Callback from 2D Tactical Plan Click
  const handleTargetDesignated = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/v1/drones/${selectedDroneId}/goto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, alt: 30.0, speed_ms: 7.0 }),
      });

      if (res.ok) {
        tacticalVoice.speak(
          `Coordenadas tácticas asignadas. ${selectedDroneId} navegando hacia nuevo vector de misión`,
          'goto',
          true
        );
      }
    } catch (e) {
      console.warn('GOTO dispatch error:', e);
    } finally {
      setGotoMode(false);
    }
  };

  // Tactical Keyboard Shortcuts (Space, 1-3, G, R, C, T, M, V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        fetch('/api/v1/drones/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'RTH' }),
        }).catch(console.warn);
        tacticalVoice.speak('Retorno a base de emergencia ordenado para toda la flota', 'rth', true);
      } else if (e.key === '1') {
        setSelectedDroneId('ARES-01');
      } else if (e.key === '2') {
        setSelectedDroneId('ARES-02');
      } else if (e.key === '3') {
        setSelectedDroneId('ARES-03');
      } else if (e.key.toLowerCase() === 'g') {
        setGotoMode(prev => !prev);
      } else if (e.key.toLowerCase() === 'r') {
        fetch(`/api/v1/drones/${selectedDroneId}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'RTH' }),
        }).catch(console.warn);
        tacticalVoice.speak(`Retorno a base ordenado para ${selectedDroneId}`, 'rth');
      } else if (e.key.toLowerCase() === 't') {
        const next = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
        setCameraMode(next);
        fetch(`/api/v1/camera/${selectedDroneId}/mode?mode=${next}`, { method: 'POST' }).catch(console.warn);
      } else if (e.key.toLowerCase() === 'c') {
        fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' }).catch(console.warn);
      } else if (e.key.toLowerCase() === 'm') {
        const modes: ('2d' | '3d' | 'map' | 'camera' | 'split')[] = ['2d', '3d', 'map', 'camera', 'split'];
        const nextIdx = (modes.indexOf(viewMode) + 1) % modes.length;
        setViewMode(modes[nextIdx]);
      } else if (e.key.toLowerCase() === 'v') {
        toggleVoice();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDroneId, cameraMode, viewMode, setCameraMode, setSelectedDroneId, setViewMode, toggleVoice]);

  return (
    <div className="min-h-screen p-2.5 sm:p-4 max-w-[1920px] mx-auto flex flex-col justify-between select-none">
      <div>
        {/* Top Tactical Command Header */}
        <Header />

        {/* Global Fleet Telemetry Ribbon */}
        <KpiRibbon />

        {/* ========================================================================= */}
        {/* CENTRAL HERO VIEWPORT: High-Impact Tactical Display                        */}
        {/* ========================================================================= */}
        <div className="my-3">
          {viewMode === '2d' && (
            <div className="h-[540px]">
              <TacticalRadar2D gotoMode={gotoMode} onTargetDesignated={handleTargetDesignated} />
            </div>
          )}

          {viewMode === '3d' && (
            <div className="h-[540px]">
              <Viewport3D 
                gotoMode={gotoMode} 
                onTargetDesignated={handleTargetDesignated} 
                onToggleGotoMode={() => setGotoMode(prev => !prev)}
              />
            </div>
          )}

          {viewMode === 'map' && (
            <div className="h-[540px]">
              <OfflineMap />
            </div>
          )}

          {viewMode === 'camera' && (
            <div className="h-[540px]">
              <CameraView />
            </div>
          )}

          {viewMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-[580px]">
              {/* Left: 2D Tactical Plan */}
              <div className="lg:col-span-7 h-full">
                <TacticalRadar2D gotoMode={gotoMode} onTargetDesignated={handleTargetDesignated} />
              </div>
              {/* Right: Camera FPV & 3D Preview */}
              <div className="lg:col-span-5 h-full flex flex-col gap-3">
                <div className="flex-1 min-h-0">
                  <CameraView />
                </div>
                <div className="flex-1 min-h-0">
                  <Viewport3D 
                    gotoMode={gotoMode} 
                    onTargetDesignated={handleTargetDesignated} 
                    onToggleGotoMode={() => setGotoMode(prev => !prev)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* DEDICATED DRONE ACTION TRAY (Bandeja de Control Táctico del Dron)         */}
        {/* ========================================================================= */}
        <div className="mb-4">
          <DroneActionTray gotoMode={gotoMode} setGotoMode={setGotoMode} />
        </div>

        {/* Fleet Quick Status Cards */}
        <div className="mb-4">
          <FleetCards />
        </div>

        {/* ========================================================================= */}
        {/* TACTICAL SUB-PANELS NAVIGATION                                            */}
        {/* ========================================================================= */}
        <div className="bg-[#0b1220] border border-cyan-500/30 rounded-2xl p-1.5 flex items-center space-x-1 mb-3 text-xs shadow-xl">
          <button
            onClick={() => setActiveTab('missions')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'missions'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Misiones SAR (Boustrophedon)</span>
          </button>

          <button
            onClick={() => setActiveTab('defense')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'defense'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Defensa EW & ATAK CoT</span>
          </button>

          <button
            onClick={() => setActiveTab('detections')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'detections'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>Evidencias D-FINE & Reporte AAR</span>
          </button>

          <button
            onClick={() => setActiveTab('blackbox')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'blackbox'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Caja Negra & Replay</span>
          </button>
        </div>

        {/* Active Sub-Panel Content */}
        <div className="mb-4">
          {activeTab === 'missions' && <MissionsPanel />}
          {activeTab === 'defense' && <DefensePanel />}
          {activeTab === 'detections' && <DetectionsFeed />}
          {activeTab === 'blackbox' && <BlackBoxBar />}
        </div>
      </div>

      {/* Footer Tactical HUD Bar */}
      <footer className="bg-[#0b1220] border border-cyan-500/25 rounded-xl px-4 py-2.5 text-[11px] text-slate-400 flex flex-wrap justify-between items-center gap-2 shadow-lg">
        <div className="flex items-center space-x-4">
          <span className="flex items-center text-cyan-400 font-extrabold tracking-wide">
            <Radio className="w-3.5 h-3.5 mr-1.5 animate-pulse text-cyan-400" /> ARES TACTICAL OS v3.0
          </span>
          <span>Base: Lima, Perú (WGS84)</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-bold">D-FINE (RT-DETR) Jetson Orin</span>
          <span className="text-slate-600">|</span>
          <span className="text-indigo-400 font-bold">ATAK CoT 4242 Activo</span>
        </div>

        <div className="flex items-center space-x-3 text-[10px] text-slate-300 font-mono">
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-amber-300 font-bold">G</kbd> Designar GOTO</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-amber-300 font-bold">R</kbd> RTH Dron</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-rose-300 font-bold">ESPACIO</kbd> RTH Total</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">1-3</kbd> Dron</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">T</kbd> FLIR</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">C</kbd> Snap</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">M</kbd> Vista</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">V</kbd> Voz</span>
        </div>
      </footer>
    </div>
  );
};
