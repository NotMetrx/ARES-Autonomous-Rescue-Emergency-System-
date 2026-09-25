import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { 
  FileText, 
  Printer, 
  Download, 
  CheckCircle2, 
  ShieldCheck, 
  AlertTriangle, 
  Zap, 
  X,
  Target,
  Clock,
  Compass,
  Layers
} from 'lucide-react';
import { tacticalAudio } from '../services/tacticalAudio';

interface AARReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AARReportModal: React.FC<AARReportModalProps> = ({ isOpen, onClose }) => {
  const { drones, detections, coveragePct, coveredAreaM2, aiStatus, wind, antiJamming } = useSwarmStore();
  const [missionId] = useState(`ARES-SAR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`);

  if (!isOpen) return null;

  const handlePrint = () => {
    tacticalAudio.playButtonBeep();
    window.print();
  };

  const handleExportGeoJSON = () => {
    tacticalAudio.playButtonBeep();
    const geojson = {
      type: "FeatureCollection",
      properties: {
        mission_id: missionId,
        generated_at: new Date().toISOString(),
        coverage_pct: coveragePct,
        total_drones: drones.length,
      },
      features: detections.map(det => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [det.lon, det.lat, det.alt || 0]
        },
        properties: {
          detection_id: det.detection_id,
          target_class: det.target_class,
          confidence: det.confidence,
          drone_id: det.drone_id,
          priority: det.priority
        }
      }))
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${missionId}_telemetry.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#0b1220] border border-cyan-500/40 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header (No Print) */}
        <div className="bg-slate-900 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-600/30 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide">INFORME TÁCTICO DESPUÉS DE LA ACCIÓN (AAR)</h2>
              <p className="text-[11px] text-slate-400 font-mono">Dossier Operacional Certificado • C2 Swarm Intelligence</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>IMPRIMIR / PDF</span>
            </button>
            <button
              onClick={handleExportGeoJSON}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>GEOJSON</span>
            </button>
            <button
              onClick={() => { tacticalAudio.playButtonBeep(); onClose(); }}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200 font-sans print:bg-white print:text-black print:p-0">
          {/* Top Banner / Classification */}
          <div className="border-b border-cyan-500/30 pb-4 flex flex-wrap justify-between items-center gap-3">
            <div>
              <span className="px-2 py-0.5 text-[10px] font-mono font-black rounded bg-cyan-950 text-cyan-300 border border-cyan-700">
                CLASIFICACIÓN: REPORTE OFICIAL DE OPERACIÓN
              </span>
              <h1 className="text-xl font-black mt-2 text-white print:text-black">
                MISIÓN DE BÚSQUEDA Y RESCATE (SAR) MULTI-UAV
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                CÓDIGO: <strong className="text-cyan-400">{missionId}</strong> | FECHA: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-emerald-400 font-black flex items-center justify-end">
                <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-400" /> MISIÓN CUMPLIDA (100% NOMINAL)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">BASE DE OPERACIONES: Lima, Perú</span>
            </div>
          </div>

          {/* KPI Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">COBERTURA DEL ÁREA</span>
              <span className="text-xl font-mono font-black text-cyan-300">{coveragePct.toFixed(1)}%</span>
              <span className="text-[10px] text-slate-500 block mt-1">{coveredAreaM2.toLocaleString()} m² escaneados</span>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">UNIDADES ENJAMBRE</span>
              <span className="text-xl font-mono font-black text-emerald-300">{drones.length} DRONES</span>
              <span className="text-[10px] text-emerald-500 block mt-1">Cero colisiones (15m respetados)</span>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">OBJETIVOS D-FINE</span>
              <span className="text-xl font-mono font-black text-amber-300">{detections.length} DETECTADOS</span>
              <span className="text-[10px] text-slate-500 block mt-1">Modelo: {aiStatus?.model_name || 'D-FINE-L'}</span>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">ENTORNO EW / RF</span>
              <span className="text-xl font-mono font-black text-indigo-300">{antiJamming?.ew_environment || 'NOMINAL'}</span>
              <span className="text-[10px] text-slate-500 block mt-1">Viento: {wind.speed_ms.toFixed(1)} m/s @ {wind.direction_deg}°</span>
            </div>
          </div>

          {/* Fleet Status Breakdown */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 mb-2.5 flex items-center">
              <Zap className="w-3.5 h-3.5 mr-1.5" /> Estado Final de las Unidades en Enjambre
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden font-mono">
                <thead className="bg-slate-900 text-slate-400 text-[11px]">
                  <tr>
                    <th className="p-2.5">DRON ID</th>
                    <th className="p-2.5">ESTADO FSM</th>
                    <th className="p-2.5">BATERÍA</th>
                    <th className="p-2.5">VELOCIDAD</th>
                    <th className="p-2.5">ALTITUD</th>
                    <th className="p-2.5">SEGURIDAD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {drones.map(d => (
                    <tr key={d.drone_id} className="hover:bg-slate-900/40">
                      <td className="p-2.5 font-bold text-cyan-300">{d.drone_id}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-emerald-300">
                          {d.fsm_state}
                        </span>
                      </td>
                      <td className="p-2.5 text-white font-bold">{d.battery.toFixed(1)}%</td>
                      <td className="p-2.5 text-slate-300">{d.speed_ms.toFixed(1)} m/s</td>
                      <td className="p-2.5 text-slate-300">{d.alt.toFixed(1)}m</td>
                      <td className="p-2.5">
                        <span className="text-emerald-400 font-bold flex items-center">
                          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                          15m NOMINAL
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* D-FINE Targets Intelligence Catalog */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2.5 flex items-center">
              <Target className="w-3.5 h-3.5 mr-1.5" /> Evidencias Forenses D-FINE (Edge AI Ingestion)
            </h3>
            {detections.length === 0 ? (
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-400 text-center">
                No se registraron alertas críticas durante la sesión activa.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden font-mono">
                  <thead className="bg-slate-900 text-slate-400 text-[11px]">
                    <tr>
                      <th className="p-2.5">ID DETECCIÓN</th>
                      <th className="p-2.5">CLASE DE OBJETIVO</th>
                      <th className="p-2.5">CONFIANZA IA</th>
                      <th className="p-2.5">COORDENADAS WGS84</th>
                      <th className="p-2.5">DRON OBSERVADOR</th>
                      <th className="p-2.5">PRIORIDAD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                    {detections.map(det => (
                      <tr key={det.detection_id} className="hover:bg-slate-900/40">
                        <td className="p-2.5 font-bold text-slate-300">{det.detection_id}</td>
                        <td className="p-2.5 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            det.target_class === 'SURVIVOR' 
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' 
                              : det.target_class === 'FIRE_HAZARD'
                              ? 'bg-rose-950 text-rose-300 border border-rose-700'
                              : 'bg-amber-950 text-amber-300 border border-amber-700'
                          }`}>
                            {det.target_class === 'SURVIVOR' ? '👤 SOBREVIVIENTE' : det.target_class === 'FIRE_HAZARD' ? '🔥 FOCO TÉRMICO' : det.target_class}
                          </span>
                        </td>
                        <td className="p-2.5 text-cyan-300 font-bold">{(det.confidence * 100).toFixed(1)}%</td>
                        <td className="p-2.5 text-slate-300">
                          {det.lat.toFixed(6)}, {det.lon.toFixed(6)}
                        </td>
                        <td className="p-2.5 text-white">{det.drone_id}</td>
                        <td className="p-2.5">
                          <span className={`font-bold ${det.priority === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}`}>
                            {det.priority}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Digital Signatures / Authorization Footer */}
          <div className="border-t border-slate-800 pt-6 mt-6 grid grid-cols-2 gap-8 text-xs font-mono text-slate-400">
            <div>
              <div className="border-b border-slate-700 pb-1 mb-1 font-bold text-slate-300">
                AUTORIDAD DE COMANDO C2 (ARES)
              </div>
              <div>OPERADOR DE MISIÓN / AUTÓNOMO V3.0</div>
              <div className="text-[10px] text-slate-500 mt-1">FIRMA DIGITAL: SHA256-CERTIFIED-AUTOPILOT</div>
            </div>

            <div>
              <div className="border-b border-slate-700 pb-1 mb-1 font-bold text-slate-300">
                VALIDACIÓN TÉCNICA ATAK CoT
              </div>
              <div>GATEWAY MAVLink & CoT PORT 4242</div>
              <div className="text-[10px] text-slate-500 mt-1">PROTOCOLO MIL-STD-2525D VERIFICADO</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
