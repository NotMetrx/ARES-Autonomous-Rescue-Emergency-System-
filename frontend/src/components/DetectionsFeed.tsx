import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { Target, FileText, Download, Flame, UserCheck, ShieldAlert, ExternalLink, X, ZoomIn, Eye, Sparkles } from 'lucide-react';

export const DetectionsFeed: React.FC = () => {
  const { detections } = useSwarmStore();
  const [enlargedTarget, setEnlargedTarget] = useState<any | null>(null);

  const getClassBadge = (cls: string) => {
    switch (cls) {
      case 'SURVIVOR':
        return {
          icon: <UserCheck className="w-3.5 h-3.5 text-emerald-400" />,
          style: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30',
        };
      case 'FIRE_HAZARD':
        return {
          icon: <Flame className="w-3.5 h-3.5 text-amber-400" />,
          style: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30',
        };
      default:
        return {
          icon: <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />,
          style: 'bg-white/[0.04] text-slate-300 ring-1 ring-white/10',
        };
    }
  };

  return (
    <div className="relative backdrop-blur-xl bg-slate-900/40 ring-1 ring-white/10 rounded-3xl p-5 shadow-2xl overflow-hidden select-none">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between mb-5 border-b border-white/[0.08] pb-4 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
            <Target className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-white tracking-wide flex items-center gap-2">
              <span>Centro de Evidencias IA & Historial de Rastreo</span>
              <span className="px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 flex items-center space-x-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{detections.length} Registros Activos</span>
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">Object Tracking continuo • Capturas de evidencia en tiempo real</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <a
            href="/api/v1/missions/ARES-MISSION-01/aar-report/html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>REPORTE AAR (JUECES)</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
          </a>

          <a
            href="/api/v1/missions/ARES-MISSION-01/export/dossier"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-medium text-xs rounded-xl ring-1 ring-white/[0.08] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>DOSSIER ZIP</span>
          </a>

          <a
            href="/api/v1/detections/geojson"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-medium text-xs rounded-xl ring-1 ring-white/[0.08] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>GeoJSON</span>
          </a>
        </div>
      </div>

      {/* Detections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
        {detections.length > 0 ? (
          detections.map((d, idx) => {
            const badge = getClassBadge(d.target_class);
            const snapshotFilename = d.snapshot_path ? d.snapshot_path.split('/').pop() : null;
            const photoSrc = d.snapshot_url || (snapshotFilename ? `/api/v1/camera/snapshots/${snapshotFilename}` : null);

            return (
              <div
                key={d.detection_id}
                className="backdrop-blur-md bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-white/[0.15] rounded-2xl p-3.5 flex space-x-3.5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl group relative overflow-hidden"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* Thumbnail Preview with Click-to-Enlarge */}
                <div 
                  onClick={() => photoSrc && setEnlargedTarget({ ...d, photoSrc })}
                  className={`w-20 h-20 bg-black/60 rounded-xl ring-1 ring-white/10 overflow-hidden shrink-0 flex items-center justify-center relative ${photoSrc ? 'cursor-pointer group-hover:ring-cyan-400/50' : ''}`}
                >
                  {photoSrc ? (
                    <>
                      <img
                        src={photoSrc}
                        alt={d.detection_id}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-cyan-300" />
                      </div>
                    </>
                  ) : (
                    <Target className="w-6 h-6 text-slate-600" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-semibold text-white truncate flex items-center">
                      {d.track_id ? (
                        <span className="text-emerald-400 font-bold mr-1.5">
                          TRK #{d.track_id}
                        </span>
                      ) : null}
                      <span className="truncate">{d.detection_id}</span>
                    </span>
                    <span className={`px-2 py-0.5 text-[9px] font-semibold rounded-lg flex items-center space-x-1 ${badge.style}`}>
                      {badge.icon}
                      <span>{d.target_class}</span>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center space-x-2">
                      <span>Certeza: <strong className="text-emerald-400 font-mono">{(d.confidence * 100).toFixed(0)}%</strong></span>
                      <span className="text-white/20">•</span>
                      <span>Obs: <strong className="text-cyan-300 font-mono">{d.observation_count}x</strong></span>
                      {d.drone_id && (
                        <>
                          <span className="text-white/20">•</span>
                          <span className="text-[10px] text-sky-400 font-mono">{d.drone_id}</span>
                        </>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">
                      Lat: {d.lat?.toFixed(5) ?? 0}, Lon: {d.lon?.toFixed(5) ?? 0}
                    </div>
                  </div>

                  {photoSrc && (
                    <button
                      onClick={() => setEnlargedTarget({ ...d, photoSrc })}
                      className="mt-2 flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Foto Forense</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs italic space-y-2">
            <Target className="w-8 h-8 text-slate-700 mx-auto" />
            <div>Esperando detecciones del motor de IA Edge...</div>
            <p className="text-[10px] text-slate-600">Apunta la cámara de un UAV hacia sobrevivientes para registrar evidencias.</p>
          </div>
        )}
      </div>

      {/* Enlarged Photo Modal */}
      {enlargedTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn">
          <div className="backdrop-blur-2xl bg-slate-900/85 ring-1 ring-white/15 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-200 space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {enlargedTarget.track_id ? `Persona Rastreada - Track #${enlargedTarget.track_id}` : enlargedTarget.detection_id}
                </h3>
                <span className="text-[11px] text-slate-400">Captura D-FINE Object Tracking • {enlargedTarget.target_class}</span>
              </div>
              <button 
                onClick={() => setEnlargedTarget(null)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full max-h-[360px] bg-black/60 rounded-2xl overflow-hidden flex items-center justify-center ring-1 ring-white/10">
              <img 
                src={enlargedTarget.photoSrc} 
                alt={enlargedTarget.detection_id} 
                className="w-full h-full object-contain max-h-[360px] rounded-xl"
              />
            </div>

            <div className="backdrop-blur-md bg-white/[0.03] ring-1 ring-white/[0.06] rounded-2xl p-3.5 text-[11px] grid grid-cols-2 gap-2.5 font-mono">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Certeza D-FINE:</span>
                <span className="text-emerald-400 font-bold text-xs">{(enlargedTarget.confidence * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Observaciones:</span>
                <span className="text-cyan-300 font-bold text-xs">{enlargedTarget.observation_count} cuadros</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Coordenadas WGS84:</span>
                <span className="text-slate-200 font-bold text-xs">{enlargedTarget.lat?.toFixed(5)}, {enlargedTarget.lon?.toFixed(5)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Detector UAV:</span>
                <span className="text-sky-300 font-bold text-xs">{enlargedTarget.drone_id || 'ARES-01'}</span>
              </div>
            </div>

            <button
              onClick={() => setEnlargedTarget(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl text-xs transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            >
              Cerrar Vista Forense
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
