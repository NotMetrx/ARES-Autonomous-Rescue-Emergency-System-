import { useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { TelemetryFrame } from '../types/telemetry';

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
          setDetections(detRes.value);
        }
      } catch (err) {
        console.warn('Initial REST data load error:', err);
      }
    };

    fetchAuxData();
    const auxInterval = setInterval(fetchAuxData, 4000);

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
            const frame: TelemetryFrame = JSON.parse(event.data);
            handleTelemetryFrame(frame);
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
