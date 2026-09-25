import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useSwarmStore } from '../store/useSwarmStore';
import { Geofence } from '../types/telemetry';

export const OfflineMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const droneMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const geofenceLayersRef = useRef<L.LayerGroup | null>(null);

  const { drones, selectedDroneId, setSelectedDroneId } = useSwarmStore();

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on Lima / base coords
    const map = L.map(mapContainerRef.current, {
      center: [-12.046374, -77.042793],
      zoom: 17,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Try offline backend tile server first, fallback to OSM
    const tileUrl = '/api/v1/tiles/{z}/{x}/{y}';
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: 'ARES C2 Offline MBTiles',
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    }).addTo(map);

    const geofenceGroup = L.layerGroup().addTo(map);
    geofenceLayersRef.current = geofenceGroup;
    mapInstanceRef.current = map;

    // Load geofences from backend
    fetch('/api/v1/geofences/')
      .then(r => r.json())
      .then((fences: Geofence[]) => {
        fences.forEach(f => {
          const latlngs = f.polygon.map(p => [p.lat, p.lon] as [number, number]);
          const isKeepOut = f.fence_type === 'KEEP_OUT';
          L.polygon(latlngs, {
            color: isKeepOut ? '#f43f5e' : '#06b6d4',
            fillColor: isKeepOut ? '#f43f5e' : '#06b6d4',
            fillOpacity: isKeepOut ? 0.25 : 0.08,
            weight: 2,
            dashArray: isKeepOut ? '6, 6' : undefined,
          }).bindPopup(`<b>${f.name}</b><br>Tipo: ${f.fence_type}`).addTo(geofenceGroup);
        });
      })
      .catch(console.warn);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update drone markers dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    drones.forEach(d => {
      let marker = droneMarkersRef.current.get(d.drone_id);
      const isSelected = d.drone_id === selectedDroneId;
      const isBreached = d.in_safety_breach;

      const iconHtml = `
        <div class="relative flex items-center justify-center">
          <div style="transform: rotate(${d.orientation.yaw}deg);" class="w-8 h-8 rounded-full ${
            isBreached ? 'bg-rose-500 animate-pulse' : isSelected ? 'bg-cyan-500 ring-4 ring-cyan-300/40' : 'bg-sky-600'
          } flex items-center justify-center text-white font-black text-xs shadow-lg transition-transform">
            ▲
          </div>
          <span class="absolute -bottom-4 px-1.5 py-0.2 bg-slate-900/90 text-cyan-300 font-mono text-[10px] font-bold rounded border border-slate-700 whitespace-nowrap">
            ${d.drone_id} (${d.alt.toFixed(0)}m)
          </span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-drone-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (!marker) {
        marker = L.marker([d.lat, d.lon], { icon: customIcon }).addTo(map);
        marker.on('click', () => setSelectedDroneId(d.drone_id));
        droneMarkersRef.current.set(d.drone_id, marker);
      } else {
        marker.setLatLng([d.lat, d.lon]);
        marker.setIcon(customIcon);
      }
    });
  }, [drones, selectedDroneId, setSelectedDroneId]);

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#060911] rounded-2xl overflow-hidden border border-slate-700/60 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-mono text-cyan-300 flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="font-bold">MAPA GEOESPACIAL OFFLINE (.MBTILES)</span>
      </div>
    </div>
  );
};
