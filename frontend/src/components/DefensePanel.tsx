import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { ShieldCheck, ShieldAlert, Wind, Radio, Send, RefreshCw, AlertTriangle } from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';

export const DefensePanel: React.FC = () => {
  const { antiJamming, wind, pnrList, setWind } = useSwarmStore();
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [rfDistance, setRfDistance] = useState(1500);

  const handleSimulateJamming = async (type: 'RF_JAMMING' | 'SPOOFING_TELEPORT') => {
    try {
      await fetch(`/api/v1/defense/anti-jamming/simulate-attack?attack_type=${type}&drone_id=ARES-01`, {
        method: 'POST',
      });
      tacticalVoice.speak(`Ataque de guerra electrónica simulado: ${type}. Conmutando a navegación inercial`, 'ew');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleClearAttack = async () => {
    try {
      await fetch('/api/v1/defense/anti-jamming/clear-attack?drone_id=ARES-01', { method: 'POST' });
      tacticalVoice.speak('Ataque electrónico mitigado. Enlace GPS restablecido', 'ew');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleBroadcastCoT = async () => {
    setIsBroadcasting(true);
    try {
      const res = await fetch('/api/v1/defense/cot/broadcast-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setBroadcastMsg(`Transmitidos ${data.events_transmitted} eventos CoT XML a ATAK (UDP 4242)`);
      tacticalVoice.speak('Eventos Cursor-on-Target transmitidos a dispositivos tácticos ATAK', 'cot');
      setTimeout(() => setBroadcastMsg(null), 4000);
    } catch (e) {
      setBroadcastMsg('Error al transmitir CoT');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleUpdateWind = async (speed: number, dir: number) => {
    setWind({ speed_ms: speed, direction_deg: dir });
    try {
      await fetch('/api/v1/defense/aerodynamics/wind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed_ms: speed, direction_deg: dir }),
      });
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div className="relative backdrop-blur-xl bg-slate-900/40 ring-1 ring-white/10 rounded-3xl p-5 shadow-2xl overflow-hidden select-none">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5 border-b border-white/[0.08] pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-white tracking-wide">
              Defensa Táctica, Guerra Electrónica & Gateway ATAK (MIL-STD)
            </h2>
            <p className="text-[11px] text-slate-400">Protección EW • Navegación inercial • Gateway táctico CoT</p>
          </div>
        </div>
        <span className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 font-mono">
          ATAK / CoT 4242 UDP
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Módulo Anti-Jamming & Navegación Inercial */}
        <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-2xl ring-1 ring-white/[0.06] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-white flex items-center">
                <Radio className="w-3.5 h-3.5 mr-1.5 text-cyan-400" /> Anti-Jamming & Anti-Spoofing GPS
              </h3>
              <span className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full font-mono ring-1 ${
                antiJamming?.jamming_active || antiJamming?.spoofing_active
                  ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40 animate-pulse'
                  : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
              }`}>
                {antiJamming?.gps_mode || 'GPS_FIX_3D'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mb-3">
              Detecta saltos anómalos o ráfagas espurias de posición y conmuta a Dead Reckoning inercial.
            </p>

            <div className="bg-black/30 p-3 rounded-xl ring-1 ring-white/[0.06] space-y-1.5 text-xs mb-4 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Satélites Visibles:</span>
                <span className="text-cyan-300 font-semibold">{antiJamming?.sats_visible ?? 16} sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Incertidumbre:</span>
                <span className="text-slate-200 font-semibold">±{antiJamming?.position_uncertainty_m.toFixed(1) ?? '0.8'} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ambiente EW:</span>
                <span className="font-semibold text-emerald-400">{antiJamming?.ew_environment ?? 'SEGURO'}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.08]">
            <div className="flex space-x-2">
              <button
                onClick={() => handleSimulateJamming('RF_JAMMING')}
                className="flex-1 py-1.5 px-2 bg-rose-500/15 hover:bg-rose-500/25 ring-1 ring-rose-500/30 text-rose-200 text-[10px] font-medium rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                Inyectar Jamming
              </button>
              <button
                onClick={() => handleSimulateJamming('SPOOFING_TELEPORT')}
                className="flex-1 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/30 text-amber-200 text-[10px] font-medium rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                Inyectar Spoofing
              </button>
            </div>
            <button
              onClick={handleClearAttack}
              className="w-full py-1.5 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] text-cyan-300 text-[10px] font-medium rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center space-x-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Restablecer GPS Seguro</span>
            </button>
          </div>
        </div>

        {/* 2. Estimador Aerodinámico & Punto de No Retorno (PNR) */}
        <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-2xl ring-1 ring-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-white flex items-center">
              <Wind className="w-3.5 h-3.5 mr-1.5 text-sky-400" /> Vector de Viento & PNR Dinámico
            </h3>
            <span className="font-mono text-[11px] font-semibold text-sky-300">
              {wind.speed_ms.toFixed(1)} m/s @ {wind.direction_deg}°
            </span>
          </div>

          <p className="text-[11px] text-slate-400 mb-3">
            Calcula la batería mínima requerida para superar vientos en contra al retornar a base.
          </p>

          {/* Wind Sliders */}
          <div className="grid grid-cols-2 gap-3 mb-3 bg-black/30 p-3 rounded-xl ring-1 ring-white/[0.06] text-[11px]">
            <div>
              <span className="text-slate-400 block mb-1">Velocidad: {wind.speed_ms.toFixed(1)} m/s</span>
              <input
                type="range"
                min="0"
                max="18"
                step="0.5"
                value={wind.speed_ms}
                onChange={e => handleUpdateWind(parseFloat(e.target.value), wind.direction_deg)}
                className="w-full accent-sky-400 h-1 bg-white/10 rounded-full"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Dirección: {wind.direction_deg}°</span>
              <input
                type="range"
                min="0"
                max="360"
                step="15"
                value={wind.direction_deg}
                onChange={e => handleUpdateWind(wind.speed_ms, parseInt(e.target.value))}
                className="w-full accent-sky-400 h-1 bg-white/10 rounded-full"
              />
            </div>
          </div>

          {/* PNR Table */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Margen PNR por Dron:</span>
            {pnrList.length > 0 ? (
              pnrList.map(p => (
                <div key={p.drone_id} className="flex items-center justify-between text-xs bg-black/30 px-3 py-1.5 rounded-xl ring-1 ring-white/[0.05]">
                  <span className="font-semibold text-white">{p.drone_id}</span>
                  <span className="text-slate-400 text-[11px]">Bat Req: {p.rth_battery_required.toFixed(1)}%</span>
                  <span className={`font-mono font-semibold text-[11px] ${
                    p.margin_pct > 30 ? 'text-emerald-400' : p.margin_pct > 0 ? 'text-amber-400' : 'text-rose-400 animate-pulse'
                  }`}>
                    Margen: {p.margin_pct.toFixed(0)}%
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 italic text-center py-3">
                Todos los UAVs en margen seguro (&gt;50%)
              </div>
            )}
          </div>
        </div>

        {/* 3. Gateway Militar ATAK & Cursor-on-Target (CoT) */}
        <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-2xl ring-1 ring-white/[0.06] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-white flex items-center">
                <Send className="w-3.5 h-3.5 mr-1.5 text-indigo-400" /> ATAK / WinTAK CoT XML Gateway
              </h3>
              <span className="px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                UDP 4242
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mb-3">
              Transmite en tiempo real el enjambre militar (`a-f-A-M-F-Q`) y víctimas (`b-m-p-s-p-loc`) a dispositivos ATAK de los equipos de campo.
            </p>

            {/* RF Link simulator */}
            <div className="bg-black/30 p-3 rounded-xl ring-1 ring-white/[0.06] text-xs mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Enlace RF LoRa 915MHz:</span>
                <span className="font-mono text-cyan-300 font-semibold">{rfDistance}m</span>
              </div>
              <input
                type="range"
                min="200"
                max="5000"
                step="100"
                value={rfDistance}
                onChange={e => setRfDistance(parseInt(e.target.value))}
                className="w-full accent-cyan-400 h-1 bg-white/10 rounded-full"
              />
              <div className="flex justify-between text-[11px] pt-1">
                <span className="text-emerald-400 font-semibold">Compresión Binaria: 97.0%</span>
                <span className="text-slate-400">73 bytes / frame</span>
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={handleBroadcastCoT}
              disabled={isBroadcasting}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-medium text-xs rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md flex items-center justify-center space-x-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isBroadcasting ? 'TRANSMITIENDO A ATAK...' : 'BROADCAST CoT AHORA (UDP)'}</span>
            </button>

            {broadcastMsg && (
              <div className="mt-2 text-center text-xs text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 py-1.5 px-3 rounded-xl animate-fadeIn">
                ✓ {broadcastMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
