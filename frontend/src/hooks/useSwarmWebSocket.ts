import { useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { TelemetryFrame, TargetDetection } from '../types/telemetry';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';

export function useSwarmWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const {
    handleTelemetryFrame,
    setWsConnected,
    setAIStatus,
    setWind,
    setPNRList,
    setAntiJamming,
    setCoverage,
    setDetections,
    addDetection,
    setSurvivorsInView,
  } = useSwarmStore();

  useEffect(() => {
    let isCancelled = false;

    // Fetch initial auxiliary data from backend REST endpoints
    const fetchAuxData = async () => {
      try {
        const [aiRes, windRes, pnrRes, ewRes, covRes, detRes] = await Promise.allSettled([
          fetch('/api/v1/ai-engine/status').then(r => r.ok ? r.json() : null),
          fetch('/api/v1/defense/aerodynamics/wind').then(r => r.ok ? r.json() : null),
          fetch('/api/v1/defense/aerodynamics/pnr-status').then(r => r.ok ? r.json() : null),
          fetch('/api/v1/defense/anti-jamming/status').then(r => r.ok ? r.json() : null),
          fetch('/api/v1/missions/coverage').then(r => r.ok ? r.json() : null),
          fetch('/api/v1/detections').then(r => r.ok ? r.json() : null),
        ]);

        if (aiRes.status === 'fulfilled' && aiRes.value) setAIStatus(aiRes.value);
        if (windRes.status === 'fulfilled' && windRes.value?.wind) setWind(windRes.value.wind);
        if (pnrRes.status === 'fulfilled' && Array.isArray(pnrRes.value)) setPNRList(pnrRes.value);
        if (ewRes.status === 'fulfilled' && ewRes.value) setAntiJamming(ewRes.value);
        if (covRes.status === 'fulfilled' && covRes.value) {
          setCoverage(covRes.value.coverage_pct, covRes.value.covered_area_m2);
        }
        if (detRes.status === 'fulfilled' && Array.isArray(detRes.value)) {
          const normalized = detRes.value.map((d: any) => ({
            ...d,
            lat: d.lat ?? d.estimated_lat ?? 0,
            lon: d.lon ?? d.estimated_lon ?? 0,
            alt: d.alt ?? d.estimated_alt ?? 0,
            timestamp: d.timestamp ?? d.reported_at ?? Date.now(),
          }));
          setDetections(normalized);
        }
      } catch (err) {
        console.warn('Initial REST data load error:', err);
      }
    };

    fetchAuxData();
    const auxInterval = setInterval(fetchAuxData, 2000);

    const connect = () => {
      if (isCancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(event.data);
            if (data.event_type === 'TARGET_ACQUIRED' || data.event_type === 'TARGET_UPDATED') {
              const normalized: TargetDetection = {
                detection_id: data.detection_id,
                drone_id: data.reported_by || data.drone_id || 'ARES-01',
                target_class: data.target_class || 'SURVIVOR',
                confidence: data.confidence ?? 0.95,
                lat: data.coordinates?.lat ?? 0,
                lon: data.coordinates?.lon ?? 0,
                alt: data.coordinates?.alt ?? 0,
                priority: data.priority || 'CRITICAL',
                observation_count: data.observation_count ?? 1,
                snapshot_path: data.snapshot_path,
                snapshot_url: data.snapshot_url,
                track_id: data.track_id,
                timestamp: data.reported_at ? (typeof data.reported_at === 'number' ? (data.reported_at > 1e11 ? data.reported_at : data.reported_at * 1000) : Date.now()) : Date.now(),
              };
              addDetection(normalized);
              if (data.event_type === 'TARGET_ACQUIRED') {
                tacticalVoice.speak(`Objetivo confirmado: Sobreviviente rastreado por ${normalized.drone_id}`, 'target', true);
                tacticalAudio.playLockOn();
              }
            } else if (data.event_type === 'FRAME_DETECTIONS_UPDATE') {
              setSurvivorsInView(data.survivors_in_view ?? 0, data.hazards_in_view ?? 0);
            } else if (data.drones || data.frame_sequence !== undefined) {
              handleTelemetryFrame(data as TelemetryFrame);
            }
          } catch (e) {
            console.error('Failed to parse telemetry JSON:', e);
          }
        };

        ws.onclose = () => {
          if (isCancelled) return;
          setWsConnected(false);
          reconnectTimeoutRef.current = window.setTimeout(connect, 1500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        setWsConnected(false);
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      isCancelled = true;
      clearInterval(auxInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);
}
