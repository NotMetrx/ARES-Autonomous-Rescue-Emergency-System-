import React, { useEffect } from 'react';
import { useSwarmStore } from './store/useSwarmStore';
import { useSwarmWebSocket } from './hooks/useSwarmWebSocket';
import { Header } from './components/Header';
import { KpiRibbon } from './components/KpiRibbon';
import { FleetCards } from './components/FleetCards';
import { Viewport3D } from './components/Viewport3D';
import { OfflineMap } from './components/OfflineMap';
import { CameraView } from './components/CameraView';
import { MissionsPanel } from './components/MissionsPanel';
import { DefensePanel } from './components/DefensePanel';
import { DetectionsFeed } from './components/DetectionsFeed';
import { BlackBoxBar } from './components/BlackBoxBar';
import { Compass, Shield, Target, Film, Terminal } from 'lucide-react';
import { tacticalVoice } from './services/tacticalVoice';

export const App: React.FC = () => {
  // Activate WebSocket listener
  useSwarmWebSocket();

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

  // Keyboard Shortcuts (Space, 1-3, C, T, M, V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
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
        tacticalVoice.speak('Retorno a base de emergencia ejecutado por atajo de teclado', 'rth', true);
      } else if (e.key === '1') {
        setSelectedDroneId('ARES-01');
      } else if (e.key === '2') {
        setSelectedDroneId('ARES-02');
      } else if (e.key === '3') {
        setSelectedDroneId('ARES-03');
      } else if (e.key.toLowerCase() === 't') {
        const next = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
        setCameraMode(next);
        fetch(`/api/v1/camera/${selectedDroneId}/mode?mode=${next}`, { method: 'POST' }).catch(console.warn);
      } else if (e.key.toLowerCase() === 'c') {
        fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' }).catch(console.warn);
      } else if (e.key.toLowerCase() === 'm') {
        const modes: ('3d' | 'map' | 'camera' | 'split')[] = ['3d', 'map', 'camera', 'split'];
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
    <div className="min-h-screen p-3 lg:p-4 max-w-[1920px] mx-auto flex flex-col justify-between">
      <div>
        {/* Command Header */}
        <Header />

        {/* Global Fleet KPI Ribbon */}
        <KpiRibbon />

        {/* Central Display (3D Real / Map / Camera / Split) */}
        <div className="my-3">
          {viewMode === '3d' && (
            <div className="h-[520px]">
              <Viewport3D />
            </div>
          )}

          {viewMode === 'map' && (
            <div className="h-[520px]">
              <OfflineMap />
            </div>
          )}

          {viewMode === 'camera' && (
            <div className="h-[520px]">
              <CameraView />
            </div>
          )}

          {viewMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-[580px]">
              {/* Left: 3D Airspace */}
              <div className="lg:col-span-7 h-full">
                <Viewport3D />
              </div>
              {/* Right: Camera FPV & Map */}
              <div className="lg:col-span-5 h-full flex flex-col gap-3">
                <div className="flex-1 min-h-0">
                  <CameraView />
                </div>
                <div className="flex-1 min-h-0">
                  <OfflineMap />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fleet Realtime Cards */}
        <div className="mb-4">
          <FleetCards />
        </div>

        {/* Tactical Sub-Panels Navigation */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-2xl p-1.5 flex items-center space-x-1 mb-3 text-xs">
          <button
            onClick={() => setActiveTab('missions')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'missions'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Misiones SAR & Resiliencia</span>
          </button>

          <button
            onClick={() => setActiveTab('defense')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'defense'
                ? 'bg-cyan-600 text-white shadow-md'
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
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>Evidencias IA & Reporte AAR</span>
          </button>

          <button
            onClick={() => setActiveTab('blackbox')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-bold rounded-xl transition ${
              activeTab === 'blackbox'
                ? 'bg-cyan-600 text-white shadow-md'
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

      {/* Footer Status Bar with Keyboard Shortcuts */}
      <footer className="bg-[#0b1220] border border-slate-800 rounded-xl px-4 py-2 text-[11px] text-slate-400 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center space-x-4">
          <span className="flex items-center text-cyan-400 font-bold">
            <Terminal className="w-3.5 h-3.5 mr-1" /> ARES TACTICAL OS v3.0
          </span>
          <span>Base: Lima, Perú (WGS84)</span>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400">MAVLink UDP 14550 Nativo</span>
          <span className="text-slate-500">|</span>
          <span className="text-indigo-400">ATAK CoT 4242 Activo</span>
        </div>

        <div className="flex items-center space-x-3 text-[10px] text-slate-400 font-mono">
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">ESPACIO</kbd> RTH Total</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">1-3</kbd> Seleccionar Dron</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">T</kbd> FLIR/RGB</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">C</kbd> Snapshot</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">M</kbd> Cambiar Vista</span>
          <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">V</kbd> Voz</span>
        </div>
      </footer>
    </div>
  );
};
