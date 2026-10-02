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
import { TacticalAICopilot } from './components/TacticalAICopilot';
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
        setGotoMode(true);
      } else if (e.key.toLowerCase() === 'r') {
        fetch(`/api/v1/drones/${selectedDroneId}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'RTH' }),
        }).catch(console.warn);
        tacticalVoice.speak(`Retorno a base ordenado para ${selectedDroneId}`, 'rth', true);
      } else if (e.key.toLowerCase() === 'c') {
        // snapshot command (simulated)
        tacticalVoice.speak(`Capturando imagen desde ${selectedDroneId}`, 'alert', true);
      } else if (e.key.toLowerCase() === 't') {
        setCameraMode(cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB');
      } else if (e.key.toLowerCase() === 'm') {
        const modes: Array<'2d' | '3d' | 'map' | 'camera' | 'split'> = ['2d', '3d', 'map', 'camera', 'split'];
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
    <div className="min-h-screen p-4 sm:p-5 max-w-[1920px] mx-auto flex flex-col justify-between select-none bg-gradient-to-b from-slate-950 via-[#0a0f1a] to-slate-950 text-slate-100 font-sans antialiased overflow-x-hidden">
      <div className="flex flex-col gap-5">
        
        {/* Top Tactical Command Header */}
        <section className="animate-fadeIn">
          <Header />
        </section>

        {/* Global Fleet Telemetry Ribbon */}
        <section className="animate-fadeIn" style={{ animationDelay: '50ms' }}>
          <KpiRibbon />
        </section>

        {/* ========================================================================= */}
        {/* CENTRAL HERO VIEWPORT: High-Impact Tactical Display                        */}
        {/* ========================================================================= */}
        <section className="animate-fadeIn relative rounded-3xl p-1.5 backdrop-blur-xl bg-white/[0.02] ring-1 ring-white/10 shadow-2xl shadow-black/40" style={{ animationDelay: '100ms' }}>
          {/* Subtle corner accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-slate-500/30 rounded-tl-3xl pointer-events-none" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-slate-500/30 rounded-tr-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-slate-500/30 rounded-bl-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-slate-500/30 rounded-br-3xl pointer-events-none" />

          <div className="rounded-2xl overflow-hidden bg-slate-900/50">
            {viewMode === '2d' && (
              <div className="h-[540px] animate-fadeIn transition-all duration-300 ease-out">
                <TacticalRadar2D gotoMode={gotoMode} onTargetDesignated={handleTargetDesignated} />
              </div>
            )}

            {viewMode === '3d' && (
              <div className="h-[540px] animate-fadeIn transition-all duration-300 ease-out">
                <Viewport3D 
                  gotoMode={gotoMode} 
                  onTargetDesignated={handleTargetDesignated} 
                  onToggleGotoMode={() => setGotoMode(prev => !prev)}
                />
              </div>
            )}

            {viewMode === 'map' && (
              <div className="h-[540px] animate-fadeIn transition-all duration-300 ease-out">
                <OfflineMap />
              </div>
            )}

            {viewMode === 'camera' && (
              <div className="h-[540px] animate-fadeIn transition-all duration-300 ease-out">
                <CameraView />
              </div>
            )}

            {viewMode === 'split' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-[580px] p-2 animate-fadeIn transition-all duration-300 ease-out">
                {/* Left: 2D Tactical Plan */}
                <div className="lg:col-span-7 h-full rounded-2xl overflow-hidden shadow-inner bg-black/20 ring-1 ring-white/5">
                  <TacticalRadar2D gotoMode={gotoMode} onTargetDesignated={handleTargetDesignated} />
                </div>
                {/* Right: Camera FPV & 3D Preview */}
                <div className="lg:col-span-5 h-full flex flex-col gap-3">
                  <div className="flex-1 min-h-0 rounded-2xl overflow-hidden shadow-inner bg-black/20 ring-1 ring-white/5">
                    <CameraView />
                  </div>
                  <div className="flex-1 min-h-0 rounded-2xl overflow-hidden shadow-inner bg-black/20 ring-1 ring-white/5">
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
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-1" />

        {/* ========================================================================= */}
        {/* DEDICATED DRONE ACTION TRAY (Bandeja de Control Táctico del Dron)         */}
        {/* ========================================================================= */}
        <section className="animate-fadeIn" style={{ animationDelay: '150ms' }}>
          <DroneActionTray gotoMode={gotoMode} setGotoMode={setGotoMode} />
        </section>

        {/* Fleet Quick Status Cards */}
        <section className="animate-fadeIn" style={{ animationDelay: '200ms' }}>
          <FleetCards />
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-1" />

        {/* ========================================================================= */}
        {/* TACTICAL SUB-PANELS NAVIGATION                                            */}
        {/* ========================================================================= */}
        <div className="flex justify-center w-full animate-fadeIn" style={{ animationDelay: '250ms' }}>
          <div className="inline-flex items-center space-x-1 p-1.5 backdrop-blur-xl bg-white/[0.03] ring-1 ring-white/[0.06] rounded-full shadow-lg shadow-black/20">
            <button
              onClick={() => setActiveTab('missions')}
              className={`flex items-center space-x-2 px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] ${
                activeTab === 'missions'
                  ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 shadow-md ring-1 ring-blue-500/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Misiones SAR</span>
            </button>

            <button
              onClick={() => setActiveTab('defense')}
              className={`flex items-center space-x-2 px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] ${
                activeTab === 'defense'
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-md ring-1 ring-emerald-500/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Defensa EW</span>
            </button>

            <button
              onClick={() => setActiveTab('detections')}
              className={`flex items-center space-x-2 px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] ${
                activeTab === 'detections'
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 shadow-md ring-1 ring-amber-500/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>Evidencias D-FINE</span>
            </button>

            <button
              onClick={() => setActiveTab('blackbox')}
              className={`flex items-center space-x-2 px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] ${
                activeTab === 'blackbox'
                  ? 'bg-gradient-to-r from-rose-500/20 to-pink-500/20 text-rose-300 shadow-md ring-1 ring-rose-500/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Caja Negra</span>
            </button>
          </div>
        </div>

        {/* Active Sub-Panel Content */}
        <section className="min-h-[300px] w-full animate-fadeIn mb-8" style={{ animationDelay: '300ms' }}>
          <div key={activeTab} className="animate-fadeIn transition-all duration-300 ease-out h-full">
            {activeTab === 'missions' && <MissionsPanel />}
            {activeTab === 'defense' && <DefensePanel />}
            {activeTab === 'detections' && <DetectionsFeed />}
            {activeTab === 'blackbox' && <BlackBoxBar />}
          </div>
        </section>
      </div>

      {/* Tactical AI Copilot Floating Drawer */}
      <TacticalAICopilot />

      {/* Footer Tactical HUD Bar */}
      <footer className="mt-auto backdrop-blur-xl bg-white/[0.02] ring-1 ring-white/10 rounded-2xl px-5 py-3 text-xs text-slate-400 flex flex-wrap justify-between items-center gap-4 shadow-xl shadow-black/30 sticky bottom-4 z-50 transition-all duration-300">
        <div className="flex items-center space-x-4">
          <div className="flex items-center text-slate-200 font-semibold tracking-wide">
            <Radio className="w-4 h-4 mr-2 animate-pulse text-blue-400" />
            BIOSCAOUT TACTICAL OS v3.0
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span>Lima, Perú (WGS84)</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            <span className="text-emerald-400 font-medium">D-FINE Orin</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] animate-pulse" />
            <span className="text-indigo-400 font-medium">ATAK CoT 4242</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 font-mono text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-amber-300 font-medium shadow-sm">G</kbd> GOTO</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-amber-300 font-medium shadow-sm">R</kbd> RTH</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-rose-400 font-medium shadow-sm">ESP</kbd> RTH Total</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-blue-300 shadow-sm">1-3</kbd> Dron</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-blue-300 shadow-sm">T</kbd> FLIR</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-blue-300 shadow-sm">C</kbd> Snap</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-blue-300 shadow-sm">M</kbd> Vista</span>
          <span className="flex items-center gap-1.5 text-slate-400"><kbd className="bg-white/10 ring-1 ring-white/20 px-1.5 py-0.5 rounded-md text-blue-300 shadow-sm">V</kbd> Voz</span>
        </div>
      </footer>
    </div>
  );
};
