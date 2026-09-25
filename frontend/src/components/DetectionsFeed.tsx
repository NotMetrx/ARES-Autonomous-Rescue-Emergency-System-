import React from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { Target, FileText, Download, Flame, UserCheck, ShieldAlert, ExternalLink } from 'lucide-react';

export const DetectionsFeed: React.FC = () => {
  const { detections } = useSwarmStore();

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
            Centro de Evidencias IA & Reporte AAR Forense
          </h2>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
            {detections.length} Registros
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
        {detections.length > 0 ? (
          detections.map((d) => {
            const badge = getClassBadge(d.target_class);
            const snapshotFilename = d.snapshot_path ? d.snapshot_path.split('/').pop() : null;

            return (
              <div
                key={d.detection_id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex space-x-3 hover:border-slate-700 transition"
              >
                {/* Thumbnail Preview */}
                <div className="w-16 h-16 bg-black rounded-lg border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {snapshotFilename ? (
                    <img
                      src={`/api/v1/camera/snapshots/${snapshotFilename}`}
                      alt={d.detection_id}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Target className="w-6 h-6 text-slate-700" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-slate-200 truncate">
                      {d.detection_id}
                    </span>
                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border flex items-center space-x-1 ${badge.style}`}>
                      {badge.icon}
                      <span>{d.target_class}</span>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <div>
                      Certeza: <strong className="text-emerald-400 font-mono">{(d.confidence * 100).toFixed(0)}%</strong>
                      <span className="text-slate-500 mx-1">•</span>
                      Obs: <strong className="text-cyan-300 font-mono">{d.observation_count}x</strong>
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">
                      Lat: {d.lat.toFixed(5)}, Lon: {d.lon.toFixed(5)}
                    </div>
                  </div>
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
    </div>
  );
};
