import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { DroneTelemetry, TargetDetection } from '../types/telemetry';
import { tacticalVoice } from '../services/tacticalVoice';
import { 
  Crosshair, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Navigation, 
  Radio, 
  Layers, 
  ShieldAlert, 
  Flame, 
  UserCheck 
} from 'lucide-react';

const LAT0 = -12.046374;
const LON0 = -77.042793;
const METERS_PER_LAT = 111320.0;
const METERS_PER_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180.0);

interface WaypointBeacon {
  droneId: string;
  x: number;
  y: number;
  lat: number;
  lon: number;
  time: number;
}

export const TacticalRadar2D: React.FC<{
  gotoMode: boolean;
  onTargetDesignated?: (lat: number, lon: number) => void;
}> = ({ gotoMode, onTargetDesignated }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { 
    drones, 
    selectedDroneId, 
    setSelectedDroneId, 
    detections,
    alerts 
  } = useSwarmStore();

  const [scale, setScale] = useState<number>(2.4); // pixels per meter
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const [activeWaypoints, setActiveWaypoints] = useState<WaypointBeacon[]>([]);
  const [trails, setTrails] = useState<Record<string, { x: number; y: number }[]>>({});

  const dronesRef = useRef<DroneTelemetry[]>([]);
  const detectionsRef = useRef<TargetDetection[]>([]);
  dronesRef.current = drones;
  detectionsRef.current = detections;

  // Convert WGS84 to metric relative to Base Station
  const geoToMetric = useCallback((lat: number, lon: number): { x: number; y: number } => {
    const x = (lon - LON0) * METERS_PER_LON;
    const y = -(lat - LAT0) * METERS_PER_LAT; // canvas Y inverted (north is negative Y)
    return { x, y };
  }, []);

  // Convert Canvas Pixel to WGS84
  const pixelToGeo = useCallback((px: number, py: number, width: number, height: number): { lat: number; lon: number } => {
    const cx = width / 2 + panOffset.x;
    const cy = height / 2 + panOffset.y;
    const x_m = (px - cx) / scale;
    const y_m = (py - cy) / scale;
    const lat = LAT0 - (y_m / METERS_PER_LAT);
    const lon = LON0 + (x_m / METERS_PER_LON);
    return { lat, lon };
  }, [panOffset, scale]);

  // Update drone trails
  useEffect(() => {
    setTrails(prev => {
      const next = { ...prev };
      drones.forEach(d => {
        const { x, y } = geoToMetric(d.lat, d.lon);
        const list = next[d.drone_id] ? [...next[d.drone_id]] : [];
        list.push({ x, y });
        if (list.length > 40) list.shift();
        next[d.drone_id] = list;
      });
      return next;
    });
  }, [drones, geoToMetric]);

  // Canvas Mouse & Interaction handlers
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && !gotoMode) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (isDraggingRef.current) {
      setPanOffset({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }

    const { lat, lon } = pixelToGeo(px, py, rect.width, rect.height);
    setMousePos({ x: px, y: py, lat, lon });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cx = rect.width / 2 + panOffset.x;
    const cy = rect.height / 2 + panOffset.y;

    // 1. If in GOTO mode, set waypoint target
    if (gotoMode) {
      const { lat, lon } = pixelToGeo(px, py, rect.width, rect.height);
      const xm = (px - cx) / scale;
      const ym = (py - cy) / scale;

      setActiveWaypoints(prev => [
        ...prev.filter(w => w.droneId !== selectedDroneId),
        { droneId: selectedDroneId, x: xm, y: ym, lat, lon, time: Date.now() }
      ]);

      if (onTargetDesignated) {
        onTargetDesignated(lat, lon);
      }
      return;
    }

    // 2. Check if clicked near an active drone
    let clickedDrone: string | null = null;
    let minD = 30; // 30 px selection hit radius
    dronesRef.current.forEach(d => {
      const { x, y } = geoToMetric(d.lat, d.lon);
      const screenX = cx + x * scale;
      const screenY = cy + y * scale;
      const dist = Math.hypot(px - screenX, py - screenY);
      if (dist < minD) {
        minD = dist;
        clickedDrone = d.drone_id;
      }
    });

    if (clickedDrone) {
      setSelectedDroneId(clickedDrone);
      tacticalVoice.speak(`Dron ${clickedDrone} enfocado en plano táctico`, 'select');
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale(prev => Math.max(0.6, Math.min(8.0, prev * zoomFactor)));
  };

  // Main Render Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let sweepAngle = 0;

    const render = () => {
      animId = requestAnimationFrame(render);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Dark Cyber Background
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2 + panOffset.x;
      const cy = height / 2 + panOffset.y;

      // 2. Tactical Hexagonal & Orthogonal Grid Pattern
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 40 * (scale / 2.0);
      const startX = cx % gridSize;
      const startY = cy % gridSize;

      ctx.beginPath();
      for (let x = startX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // 3. Concentric Range Rings (25m, 50m, 100m, 150m, 200m)
      const rangeDistances = [25, 50, 100, 150, 200];
      rangeDistances.forEach((r, idx) => {
        const rad = r * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(6, 182, 212, 0.22)' : 'rgba(6, 182, 212, 0.12)';
        ctx.lineWidth = idx % 2 === 0 ? 1.5 : 1;
        ctx.setLineDash(idx % 2 === 0 ? [] : [4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Metric label on circle
        ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`${r}m`, cx + rad + 4, cy - 3);
      });

      // 4. Rotating Radar Sweep Beam (Military Radar Line with Phosphor Trail)
      sweepAngle = (sweepAngle + 0.02) % (Math.PI * 2);
      const sweepRad = 220 * scale;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, sweepRad);
      gradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
      gradient.addColorStop(1, 'transparent');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, sweepRad, sweepAngle - 0.4, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Sharp sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * sweepRad, cy + Math.sin(sweepAngle) * sweepRad);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 5. Base Station Pad (Estación Terrena)
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText('BASE C2', cx - 22, cy + 18);

      // 6. Draw Flight Trails (Estelas de Vuelo)
      Object.entries(trails).forEach(([dId, pts]) => {
        if (pts.length < 2) return;
        ctx.beginPath();
        const strokeColor = dId === 'ARES-01' ? 'rgba(6, 182, 212, ' : dId === 'ARES-02' ? 'rgba(16, 185, 129, ' : 'rgba(168, 85, 247, ';
        for (let i = 0; i < pts.length; i++) {
          const ptX = cx + pts[i].x * scale;
          const ptY = cy + pts[i].y * scale;
          if (i === 0) ctx.moveTo(ptX, ptY);
          else ctx.lineTo(ptX, ptY);
        }
        ctx.strokeStyle = strokeColor + '0.45)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      });

      // 7. Draw D-FINE AI Detections (Victims & Fire Hazards)
      detectionsRef.current.forEach(det => {
        const { x, y } = geoToMetric(det.lat, det.lon);
        const detX = cx + x * scale;
        const detY = cy + y * scale;

        if (det.target_class === 'FIRE_HAZARD') {
          // Dynamic 28m Fire NFZ Exclusion Zone
          ctx.beginPath();
          ctx.arc(detX, detY, 28 * scale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          // Flame icon marker
          ctx.beginPath();
          ctx.arc(detX, detY, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText('🔥 NFZ', detX + 11, detY + 3);
        } else if (det.target_class === 'SURVIVOR') {
          ctx.beginPath();
          ctx.arc(detX, detY, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText(`VÍCTIMA (${(det.confidence * 100).toFixed(0)}%)`, detX + 11, detY + 3);
        }
      });

      // 8. Draw Active Waypoint Beacons (GOTO)
      activeWaypoints.forEach(wp => {
        const wpX = cx + wp.x * scale;
        const wpY = cy + wp.y * scale;

        // Pulsing target ring
        const t = (Date.now() - wp.time) / 1000;
        const pulse = (Math.sin(t * 8) + 1) / 2;

        ctx.beginPath();
        ctx.arc(wpX, wpY, 12 + pulse * 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(wpX, wpY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();

        // Line from drone to waypoint
        const drone = dronesRef.current.find(d => d.drone_id === wp.droneId);
        if (drone) {
          const { x: dx, y: dy } = geoToMetric(drone.lat, drone.lon);
          ctx.beginPath();
          ctx.moveTo(cx + dx * scale, cy + dy * scale);
          ctx.lineTo(wpX, wpY);
          ctx.strokeStyle = '#f59e0b';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`DESTINO [${wp.droneId}]`, wpX + 14, wpY + 3);
      });

      // 9. Draw Active Drones with 15m Safety Bubble & Heading
      const currentDrones = dronesRef.current;
      currentDrones.forEach(d => {
        const { x, y } = geoToMetric(d.lat, d.lon);
        const dx = cx + x * scale;
        const dy = cy + y * scale;
        const isSelected = d.drone_id === selectedDroneId;
        const isBreached = d.in_safety_breach || (d.nearest_distance_m !== null && (d.nearest_distance_m ?? 999) < 15.0);

        // A. 15m Safety Bubble Circle
        const bubbleRad = 15 * scale;
        ctx.beginPath();
        ctx.arc(dx, dy, bubbleRad, 0, Math.PI * 2);
        if (isBreached) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
        } else {
          ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(6, 182, 212, 0.07)';
          ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(56, 189, 248, 0.35)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([]);
        }
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Conflict alert line to nearest peer if breached
        if (isBreached && d.nearest_peer_id) {
          const peer = currentDrones.find(p => p.drone_id === d.nearest_peer_id);
          if (peer) {
            const { x: px, y: py } = geoToMetric(peer.lat, peer.lon);
            ctx.beginPath();
            ctx.moveTo(dx, dy);
            ctx.lineTo(cx + px * scale, cy + py * scale);
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Middle distance text
            const midX = (dx + cx + px * scale) / 2;
            const midY = (dy + cy + py * scale) / 2;
            ctx.fillStyle = '#f43f5e';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.fillText(`⚠️ ${d.nearest_distance_m?.toFixed(1)}m (<15m)`, midX - 25, midY - 6);
          }
        }

        // B. Reactive Evasion Arrow
        if (d.evasion_vector && (Math.abs(d.evasion_vector.x) > 0.01 || Math.abs(d.evasion_vector.y) > 0.01)) {
          const evAngle = Math.atan2(d.evasion_vector.y, d.evasion_vector.x);
          const arrowLen = 30;
          const arrowTipX = dx + Math.cos(evAngle) * arrowLen;
          const arrowTipY = dy + Math.sin(evAngle) * arrowLen;

          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.lineTo(arrowTipX, arrowTipY);
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Arrow tip
          ctx.beginPath();
          ctx.arc(arrowTipX, arrowTipY, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#f43f5e';
          ctx.fill();
        }

        // C. Drone Aircraft Chevron & Heading
        const headingRad = (d.orientation.yaw - 90) * (Math.PI / 180);
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(headingRad);

        // Chevron Body
        ctx.beginPath();
        ctx.moveTo(14, 0); // nose forward
        ctx.lineTo(-10, -10);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, 10);
        ctx.closePath();

        ctx.fillStyle = d.drone_id === 'ARES-01' ? '#06b6d4' : d.drone_id === 'ARES-02' ? '#10b981' : '#a855f7';
        if (isBreached) ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();

        // D. Target Lock Ring if Selected
        if (isSelected) {
          const ringT = Date.now() / 300;
          ctx.save();
          ctx.translate(dx, dy);
          ctx.rotate(ringT);
          ctx.beginPath();
          ctx.arc(0, 0, 22, 0, Math.PI * 0.7);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, 22, Math.PI, Math.PI * 1.7);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        // E. Telemetry Tag Label
        ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(d.drone_id, dx + 14, dy - 6);

        ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`${d.alt.toFixed(0)}m • ${d.battery.toFixed(0)}%`, dx + 14, dy + 6);
      });

      // 10. GOTO Crosshair Cursor following Mouse
      if (gotoMode && mousePos) {
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(mousePos.x - 20, mousePos.y);
        ctx.lineTo(mousePos.x + 20, mousePos.y);
        ctx.moveTo(mousePos.x, mousePos.y - 20);
        ctx.lineTo(mousePos.x, mousePos.y + 20);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(`DESIGNAR: ${selectedDroneId}`, mousePos.x + 18, mousePos.y - 8);
        ctx.fillText(`Lat: ${mousePos.lat.toFixed(5)}, Lon: ${mousePos.lon.toFixed(5)}`, mousePos.x + 18, mousePos.y + 6);
      }

      ctx.restore();
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [panOffset, scale, selectedDroneId, gotoMode, mousePos, activeWaypoints, trails, geoToMetric, pixelToGeo]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px] bg-[#050811] rounded-2xl overflow-hidden border border-cyan-500/30 shadow-2xl select-none">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${gotoMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Top Left Status Watermark */}
      <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center space-x-2.5 shadow-lg">
        <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
        <span className="font-extrabold tracking-wider">RADAR TÁCTICO 2D VECTORIAL (60 FPS)</span>
        <span className="text-slate-500">|</span>
        <span className="text-emerald-400 font-bold">Burbuja: 15m</span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400 font-medium">Escala: {scale.toFixed(1)} px/m</span>
      </div>

      {/* Top Right Zoom & Recenter Controls */}
      <div className="absolute top-3 right-3 flex items-center space-x-1.5 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-lg">
        <button
          onClick={() => setScale(s => Math.min(8.0, s * 1.25))}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
          title="Acercar Zoom"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setScale(s => Math.max(0.6, s * 0.8))}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
          title="Alejar Zoom"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setPanOffset({ x: 0, y: 0 }); setScale(2.4); }}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg transition"
          title="Re-centrar en Base"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* GOTO Mode Banner Alert */}
      {gotoMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-amber-950/95 border-2 border-amber-500 text-amber-200 px-4 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 animate-bounce">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <span>MODO DESTINO ACTIVO: Haz clic en el plano 2D para enviar al <strong>{selectedDroneId}</strong></span>
        </div>
      )}

      {/* Bottom Live Cursor Coordinates */}
      {mousePos && (
        <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
          COORD: <strong className="text-cyan-300">{mousePos.lat.toFixed(6)}, {mousePos.lon.toFixed(6)}</strong>
        </div>
      )}
    </div>
  );
};
