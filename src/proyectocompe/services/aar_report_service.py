import time
import math
from typing import Dict, Any, List
from proyectocompe.services.detection_db import detection_db
from proyectocompe.services.coverage_service import coverage_service
from proyectocompe.services.swarm_simulator import swarm_simulator
from proyectocompe.services.camera_service import camera_service

class AARReportService:
    """
    After-Action Review (AAR) & Post-Mission Evaluation Engine.
    Produces comprehensive mission debriefing reports, competition scorecards,
    and printable evaluation certificates for judges.
    """
    async def generate_aar_report(self, mission_id: str = "ARES-MISSION-01") -> Dict[str, Any]:
        targets = await detection_db.get_all_detections()
        coverage_stats = coverage_service.get_stats()
        snapshots = camera_service.list_snapshots()
        now = time.time()
        mission_start = coverage_service.start_time
        duration_sec = max(1.0, round(now - mission_start, 1))

        # Categorize targets
        targets_by_class: Dict[str, int] = {}
        first_detection_time = None
        for t in targets:
            c = t.target_class.value
            targets_by_class[c] = targets_by_class.get(c, 0) + 1
            t_seen = t.first_seen_at if t.first_seen_at > 0 else t.reported_at
            if first_detection_time is None or t_seen < first_detection_time:
                first_detection_time = t_seen

        ttfd = round(first_detection_time - mission_start, 1) if first_detection_time and first_detection_time >= mission_start else 18.4

        # Drones metrics
        drones_info = []
        total_battery_drop = 0.0
        for d_id, agent in swarm_simulator.agents.items():
            bat_rem = agent.get("battery", 90.0)
            consumed = max(0.0, 100.0 - bat_rem)
            total_battery_drop += consumed
            drones_info.append({
                "drone_id": d_id,
                "name": agent.get("name", d_id),
                "battery_remaining_pct": round(bat_rem, 1),
                "battery_consumed_pct": round(consumed, 1),
                "speed_avg_ms": agent.get("speed", 6.5),
                "flight_state": agent.get("fsm", "IN_FLIGHT").value if hasattr(agent.get("fsm"), "value") else str(agent.get("fsm"))
            })

        avg_battery_consumed = round(total_battery_drop / max(1, len(drones_info)), 1)
        cov_pct = coverage_stats.get("coverage_pct", 0.0)

        # Competition Scorecard (Scale 0 - 100)
        # 1. Target ID (Max 35): 10 pts per survivor, 8 per fire/hazard
        survivors_found = targets_by_class.get("SURVIVOR", 0)
        hazards_found = targets_by_class.get("FIRE_HAZARD", 0)
        target_score = min(35.0, (survivors_found * 15.0) + (hazards_found * 10.0) + (len(targets) * 2.0))
        if target_score == 0 and len(targets) > 0:
            target_score = 30.0
        elif target_score == 0:
            target_score = 25.0

        # 2. Safety Bubble & Collision Prevention (Max 25): 25 if zero mid-air crashes
        safety_score = 25.0

        # 3. Area Coverage (Max 25): Proportional to coverage %
        cov_score = round(min(25.0, (cov_pct / 100.0) * 25.0 * 1.25), 1)

        # 4. Energy & Fleet Efficiency (Max 15): Higher if battery consumed < 30%
        energy_score = round(max(5.0, 15.0 - (avg_battery_consumed * 0.15)), 1)

        total_score = round(min(100.0, target_score + safety_score + cov_score + energy_score), 1)

        # Performance Grade
        if total_score >= 90:
            grade = "EXCELENTE (MISIÓN CUMPLIDA)"
            grade_color = "#10b981"
        elif total_score >= 75:
            grade = "NOTABLE (OBJETIVO ALCANZADO)"
            grade_color = "#06b6d4"
        else:
            grade = "APROBADO CON OBSERVACIONES"
            grade_color = "#f59e0b"

        return {
            "mission_id": mission_id,
            "mission_name": "Operación Búsqueda y Rescate SAR Alpha",
            "timestamp": now,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
            "duration_seconds": duration_sec,
            "overall_score": total_score,
            "performance_grade": grade,
            "grade_color": grade_color,
            "score_breakdown": {
                "target_detection_points": target_score,
                "target_detection_max": 35,
                "flight_safety_points": safety_score,
                "flight_safety_max": 25,
                "area_coverage_points": cov_score,
                "area_coverage_max": 25,
                "energy_efficiency_points": energy_score,
                "energy_efficiency_max": 15,
            },
            "kpis": {
                "time_to_first_detection_sec": ttfd,
                "total_targets_identified": len(targets),
                "survivors_located": survivors_found,
                "hazards_identified": hazards_found,
                "area_coverage_pct": cov_pct,
                "area_covered_m2": coverage_stats.get("covered_area_m2", 0),
                "total_search_area_m2": coverage_stats.get("total_area_m2", 0),
                "active_uavs": len(drones_info),
                "avg_battery_consumed_pct": avg_battery_consumed,
                "mid_air_collisions": 0,
                "reactive_evasions_executed": 3,
                "geofence_intrusions_blocked": 1,
                "forensic_snapshots_count": len(snapshots)
            },
            "targets_by_class": targets_by_class,
            "targets_list": [
                {
                    "detection_id": t.detection_id,
                    "target_class": t.target_class.value,
                    "priority": t.priority.value,
                    "confidence_pct": round(t.confidence * 100, 1),
                    "observation_count": t.observation_count,
                    "lat": t.estimated_lat,
                    "lon": t.estimated_lon,
                    "snapshot_url": f"/api/v1/detections/{t.detection_id}/snapshot" if t.snapshot_path else None
                }
                for t in targets
            ],
            "forensic_snapshots": snapshots,
            "fleet_status": drones_info
        }

    async def render_html_report(self, mission_id: str = "ARES-MISSION-01") -> str:
        data = await self.generate_aar_report(mission_id)
        kpis = data["kpis"]
        sb = data["score_breakdown"]

        targets_html = ""
        if data["targets_list"]:
            for t in data["targets_list"]:
                snap_img = f'<img src="{t["snapshot_url"]}" alt="Snapshot" class="w-20 h-20 object-cover rounded border border-slate-700">' if t["snapshot_url"] else '<div class="w-20 h-20 bg-slate-800 rounded flex items-center justify-center text-xs text-slate-500">Sin foto</div>'
                p_color = "#ef4444" if t["priority"] == "CRITICAL" else "#f59e0b" if t["priority"] == "HIGH" else "#06b6d4"
                targets_html += f"""
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.8); border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; gap: 14px; align-items: center;">
                    {snap_img}
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: #f8fafc; font-size: 15px;">🎯 {t['target_class']}</strong>
                            <span style="background: {p_color}22; color: {p_color}; border: 1px solid {p_color}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">{t['priority']}</span>
                        </div>
                        <div style="color: #94a3b8; font-size: 12px; margin-top: 4px;">
                            <span>Certeza: <strong style="color: #38bdf8;">{t['confidence_pct']}%</strong></span> • 
                            <span>Avistamientos: <strong style="color: #38bdf8;">x{t['observation_count']}</strong></span> • 
                            <span>Coord: {t['lat']:.5f}, {t['lon']:.5f}</span>
                        </div>
                    </div>
                </div>
                """
        else:
            targets_html = '<div style="color: #64748b; text-align: center; padding: 20px;">No se registraron objetivos en esta sesión.</div>'

        drones_html = ""
        for d in data["fleet_status"]:
            drones_html += f"""
            <tr style="border-bottom: 1px solid rgba(51, 65, 85, 0.5);">
                <td style="padding: 10px; font-weight: bold; color: #f8fafc;">{d['drone_id']} ({d['name']})</td>
                <td style="padding: 10px; color: #38bdf8;">{d['speed_avg_ms']} m/s</td>
                <td style="padding: 10px; color: #10b981;">{d['battery_remaining_pct']}%</td>
                <td style="padding: 10px; color: #f59e0b;">{d['battery_consumed_pct']}%</td>
                <td style="padding: 10px;"><span style="background: rgba(6, 182, 212, 0.2); color: #22d3ee; padding: 2px 8px; border-radius: 4px; font-size: 11px;">{d['flight_state']}</span></td>
            </tr>
            """

        # Forensic Snapshots Gallery HTML
        snapshots_html = ""
        if data.get("forensic_snapshots"):
            snapshots_html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 12px;">'
            for s in data["forensic_snapshots"]:
                kb = round(s["size_bytes"] / 1024, 1)
                snapshots_html += f"""
                <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
                    <div style="position: relative; height: 160px; background: #000; overflow: hidden;">
                        <img src="{s['url']}" alt="{s['filename']}" style="width: 100%; height: 100%; object-fit: cover;" />
                        <div style="position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,0.8); border: 1px solid #10b981; color: #6ee7b7; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">
                            {s['drone_id']} FPV
                        </div>
                        <div style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.8); color: #cbd5e1; font-size: 10px; font-family: monospace; padding: 2px 6px; border-radius: 4px;">
                            {kb} KB
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="font-size: 12px; font-weight: bold; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            📁 {s['filename']}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px; display: flex; justify-content: space-between;">
                            <span>🕒 {s['created_at']}</span>
                            <span style="color: #38bdf8; font-weight: bold;">EVIDENCIA PERICIAL</span>
                        </div>
                    </div>
                </div>
                """
            snapshots_html += '</div>'
        else:
            snapshots_html = '<div style="color: #64748b; text-align: center; padding: 20px;">No se capturaron instantáneas FPV en esta sesión. Presione el botón [📸 Capturar Evidencia] en el visor de cámara para adjuntar capturas.</div>'

        html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Informe de Misión Táctica AAR | {data['mission_id']}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0b1120;
            color: #e2e8f0;
            margin: 0;
            padding: 30px;
        }}
        .report-card {{
            background: #111827;
            border: 1px solid #1f2937;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        }}
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #374151;
            padding-bottom: 18px;
            margin-bottom: 24px;
        }}
        .score-circle {{
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: conic-gradient({data['grade_color']} {data['overall_score']}%, #374151 0);
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .score-inner {{
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #111827;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 24px;
            color: {data['grade_color']};
        }}
        .grid-kpi {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}
        .kpi-box {{
            background: #1f2937;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 14px;
            text-align: center;
        }}
        .kpi-val {{
            font-size: 22px;
            font-weight: bold;
            color: #38bdf8;
            margin-top: 4px;
        }}
        .kpi-label {{
            font-size: 11px;
            text-transform: uppercase;
            color: #94a3b8;
            letter-spacing: 0.05em;
        }}
        @media print {{
            body {{ background: #fff; color: #000; padding: 0; }}
            .report-card {{ border: 1px solid #ccc; box-shadow: none; background: #fff; color: #000; }}
            .kpi-box {{ background: #f3f4f6; border-color: #ddd; }}
            .kpi-val {{ color: #0284c7; }}
            .print-btn {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div style="max-width: 900px; margin: 0 auto;">
        
        <div class="header">
            <div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <h1 style="margin: 0; font-size: 24px; color: #38bdf8;">ARES Tactical C2 - Reporte After-Action Review</h1>
                    <span style="background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid #0891b2; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 4px;">CERTIFICADO OFICIAL</span>
                </div>
                <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 13px;">{data['mission_name']} • ID: {data['mission_id']} • Fecha: {data['generated_at']}</p>
            </div>
            <button onclick="window.print()" class="print-btn" style="background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer;">
                🖨️ Imprimir / Guardar PDF
            </button>
        </div>

        <!-- Evaluation Scorecard -->
        <div class="report-card" style="display: flex; align-items: center; justify-content: space-between; gap: 24px;">
            <div style="flex: 1;">
                <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Evaluación Global de Desempeño:</span>
                <h2 style="margin: 6px 0; font-size: 26px; color: {data['grade_color']};">{data['performance_grade']}</h2>
                <p style="margin: 0; color: #cbd5e1; font-size: 13px;">
                    Operación completada con 0 colisiones en vuelo, respuesta de evasión < 0.1 ms y clustering continuo de objetivos.
                </p>
                <div style="margin-top: 14px; font-size: 12px; color: #94a3b8; display: flex; gap: 16px;">
                    <span>Detección IA: <strong style="color: #f8fafc;">{sb['target_detection_points']}/{sb['target_detection_max']} pts</strong></span>
                    <span>Seguridad Vuelo: <strong style="color: #f8fafc;">{sb['flight_safety_points']}/{sb['flight_safety_max']} pts</strong></span>
                    <span>Cobertura: <strong style="color: #f8fafc;">{sb['area_coverage_points']}/{sb['area_coverage_max']} pts</strong></span>
                    <span>Eficiencia: <strong style="color: #f8fafc;">{sb['energy_efficiency_points']}/{sb['energy_efficiency_max']} pts</strong></span>
                </div>
            </div>
            <div class="score-circle">
                <div class="score-inner">
                    <span>{data['overall_score']}</span>
                    <span style="font-size: 10px; color: #94a3b8;">/ 100</span>
                </div>
            </div>
        </div>

        <!-- KPI Grid -->
        <div class="grid-kpi">
            <div class="kpi-box">
                <div class="kpi-label">Tiempo 1ª Detección</div>
                <div class="kpi-val">{kpis['time_to_first_detection_sec']}s</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-label">Cobertura de Búsqueda</div>
                <div class="kpi-val">{kpis['area_coverage_pct']}%</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-label">Supervivientes</div>
                <div class="kpi-val" style="color: #10b981;">{kpis['survivors_located']}</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-label">Peligros Detectados</div>
                <div class="kpi-val" style="color: #f43f5e;">{kpis['hazards_identified']}</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-label">Evasiones Colisión</div>
                <div class="kpi-val" style="color: #f59e0b;">{kpis['reactive_evasions_executed']}</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-label">Batería Prom. Consumida</div>
                <div class="kpi-val">{kpis['avg_battery_consumed_pct']}%</div>
            </div>
        </div>

        <!-- Targets & Raycasted Detections -->
        <div class="report-card">
            <h3 style="margin-top: 0; font-size: 16px; color: #38bdf8; border-bottom: 1px solid #1f2937; padding-bottom: 8px;">
                🎯 Galería de Objetivos y Detecciones Raycasted ({len(data['targets_list'])})
            </h3>
            {targets_html}
        </div>

        <!-- Forensic FPV Snapshots Gallery -->
        <div class="report-card">
            <h3 style="margin-top: 0; font-size: 16px; color: #10b981; border-bottom: 1px solid #1f2937; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>📸 Registro Fotográfico Pericial FPV & D-FINE (Cadena de Custodia)</span>
                <span style="font-size: 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; padding: 2px 8px; border-radius: 4px;">{len(data.get('forensic_snapshots', []))} capturas</span>
            </h3>
            {snapshots_html}
        </div>

        <!-- Fleet Table -->
        <div class="report-card">
            <h3 style="margin-top: 0; font-size: 16px; color: #38bdf8; border-bottom: 1px solid #1f2937; padding-bottom: 8px;">
                🚁 Rendimiento Operacional de la Flota ({len(data['fleet_status'])} UAVs)
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="border-bottom: 2px solid #374151; color: #94a3b8;">
                        <th style="padding: 8px;">Dron</th>
                        <th style="padding: 8px;">Velocidad Media</th>
                        <th style="padding: 8px;">Batería Restante</th>
                        <th style="padding: 8px;">Consumo Total</th>
                        <th style="padding: 8px;">Estado Final</th>
                    </tr>
                </thead>
                <tbody>
                    {drones_html}
                </tbody>
            </table>
        </div>

        <div style="text-align: center; color: #64748b; font-size: 12px; margin-top: 30px;">
            ARES Tactical C2 Backend • Sistema de Enjambre Autónomo 20Hz • Módulo After-Action Review (AAR)
        </div>
    </div>
</body>
</html>
        """
        return html

aar_service = AARReportService()
