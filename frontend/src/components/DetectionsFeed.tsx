import React, { useState } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { Target, FileText, Download, Flame, UserCheck, ShieldAlert, ExternalLink, X, ZoomIn, Eye } from 'lucide-react';

export const DetectionsFeed: React.FC = () => {
  const { detections } = useSwarmStore();
  const [enlargedTarget, setEnlargedTarget] = useState<any | null>(null);

  const getClassBadge = (cls: string) => {
    switch (cls) {
      case 'SURVIVOR':
        return {
          icon: <UserCheck className="w-3.5 h-3.5 text-emerald-400" />,
          style: 'bg-emerald-950 text-emerald-300 border-emerald-700',
        };
      case 'FIRE_HAZARD':
        return {
          icon: <Flame className="w-3.5 h-3.5 text-amber-400" />,
          style: 'bg-amber-950 text-amber-300 border-amber-600',
        };
      default:
        return {
          icon: <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />,
          style: 'bg-slate-800 text-slate-300 border-slate-700',
        };
    }
  };

  return (
    <div className="bg-[#0b1220] border border-slate-800 rounded-2xl p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between mb-4 border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center space-x-2">
          <Target className="w-5 h-5 text-emerald-400" />
          <h2 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            Centro de Evidencias IA & Historial de Rastreo (Object Tracking)
          </h2>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{detections.length} Registros en Tiempo Real</span>
          </span>
        </div>

        {/* Action Buttons for Judges */}
        <div className="flex items-center space-x-2">
          <a
            href="/api/v1/missions/ARES-MISSION-01/aar-report/html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>REPORTE AAR (JUECES)</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>

          <a
            href="/api/v1/missions/ARES-MISSION-01/export/dossier"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>DOSSIER ZIP (SHA-256)</span>
          </a>

          <a
            href="/api/v1/detections/geojson"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition"
          >
            <span>GeoJSON</span>
          </a>
        </div>
      </div>

      {/* Detections List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
        {detections.length > 0 ? (
          detections.map((d) => {
            const badge = getClassBadge(d.target_class);
            const snapshotFilename = d.snapshot_path ? d.snapshot_path.split('/').pop() : null;
            const photoSrc = d.snapshot_url || (snapshotFilename ? `/api/v1/camera/snapshots/${snapshotFilename}` : null);

            return (
              <div
                key={d.detection_id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex space-x-3 hover:border-cyan-500/50 transition group relative"
              >
                {/* Thumbnail Preview with Click-to-Enlarge */}
                <div 
                  onClick={() => photoSrc && setEnlargedTarget({ ...d, photoSrc })}
                  className={`w-18 h-18 bg-black rounded-lg border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative ${photoSrc ? 'cursor-pointer hover:border-cyan-400 group-hover:shadow-md group-hover:shadow-cyan-500/20' : ''}`}
                >
                  {photoSrc ? (
                    <>
                      <img
                        src={photoSrc}
                        alt={d.detection_id}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <ZoomIn className="w-4 h-4 text-cyan-300" />
                      </div>
                    </>
                  ) : (
                    <Target className="w-6 h-6 text-slate-700" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-black text-slate-200 truncate flex items-center">
                      {d.track_id ? (
                        <span className="text-emerald-400 font-extrabold mr-1">
                          [TRK #{d.track_id}]
                        </span>
                      ) : null}
                      {d.detection_id}
                    </span>
                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border flex items-center space-x-1 ${badge.style}`}>
                      {badge.icon}
                      <span>{d.target_class}</span>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span>Certeza: <strong className="text-emerald-400 font-mono">{(d.confidence * 100).toFixed(0)}%</strong></span>
                      <span className="text-slate-500">•</span>
                      <span>Obs: <strong className="text-cyan-300 font-mono">{d.observation_count}x</strong></span>
                      {d.drone_id && (
                        <>
                          <span className="text-slate-500">•</span>
                          <span className="text-[10px] text-sky-400 font-bold">{d.drone_id}</span>
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
                      className="mt-1.5 flex items-center space-x-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-bold transition"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Ver Foto Forense</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-8 text-center text-slate-500 text-xs italic">
            Esperando detecciones del motor de IA Edge...
          </div>
        )}
      </div>

      {/* Enlarged Photo Modal */}
      {enlargedTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#090d16] border-2 border-cyan-500/60 rounded-3xl max-w-lg w-full p-5 shadow-2xl relative font-mono text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-black text-cyan-300">
                  {enlargedTarget.track_id ? `PERSONA RASTREADA - TRACK #${enlargedTarget.track_id}` : enlargedTarget.detection_id}
                </h3>
                <span className="text-[10px] text-slate-400">Captura D-FINE Object Tracking • {enlargedTarget.target_class}</span>
              </div>
              <button 
                onClick={() => setEnlargedTarget(null)}
                className="p-1 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full max-h-[360px] bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
              <img 
                src={enlargedTarget.photoSrc} 
                alt={enlargedTarget.detection_id} 
                className="w-full h-full object-contain max-h-[360px]"
              />
            </div>

            <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-[11px] grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500">Certeza D-FINE:</span>
                <div className="text-emerald-400 font-bold">{(enlargedTarget.confidence * 100).toFixed(1)}%</div>
              </div>
              <div>
                <span className="text-slate-500">Observaciones:</span>
                <div className="text-cyan-300 font-bold">{enlargedTarget.observation_count} cuadros confirmados</div>
              </div>
              <div>
                <span className="text-slate-500">Coordenadas WGS84:</span>
                <div className="text-slate-300 font-bold">{enlargedTarget.lat?.toFixed(5)}, {enlargedTarget.lon?.toFixed(5)}</div>
              </div>
              <div>
                <span className="text-slate-500">Detector UAV:</span>
                <div className="text-sky-300 font-bold">{enlargedTarget.drone_id || 'ARES-01'}</div>
              </div>
            </div>

            <button
              onClick={() => setEnlargedTarget(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
            >
              Cerrar Vista Forense
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
