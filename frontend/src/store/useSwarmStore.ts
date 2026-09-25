import { create } from 'zustand';
import { 
  DroneTelemetry, 
  TacticalAlert, 
  TelemetryFrame, 
  AIStatus, 
  WindData, 
  PNRDroneStatus, 
  AntiJammingStatus, 
  TargetDetection,
  CameraGimbalState
} from '../types/telemetry';
import { tacticalVoice } from '../services/tacticalVoice';

interface SwarmStoreState {
  drones: DroneTelemetry[];
  alerts: TacticalAlert[];
  selectedDroneId: string;
  wsConnected: boolean;
  wsHz: number;
  frameSeq: number;
  viewMode: '2d' | '3d' | 'map' | 'camera' | 'split';
  activeTab: 'fleet' | 'missions' | 'detections' | 'defense' | 'blackbox';
  theme: 'dark' | 'light';
  voiceEnabled: boolean;
  recordingBlackBox: boolean;
  recordingDurationSec: number;
  cameraMode: 'RGB' | 'THERMAL_FLIR';
  ptz: Record<string, CameraGimbalState>;
  aiStatus: AIStatus | null;
  wind: WindData;
  pnrList: PNRDroneStatus[];
  antiJamming: AntiJammingStatus | null;
  coveragePct: number;
  coveredAreaM2: number;
  detections: TargetDetection[];
  isDrawingMode: boolean;
  drawnPoints: [number, number][];

  // Actions
  handleTelemetryFrame: (frame: TelemetryFrame) => void;
  setWsConnected: (connected: boolean) => void;
  setSelectedDroneId: (droneId: string) => void;
  setViewMode: (mode: '2d' | '3d' | 'map' | 'camera' | 'split') => void;
  setActiveTab: (tab: 'fleet' | 'missions' | 'detections' | 'defense' | 'blackbox') => void;
  toggleTheme: () => void;
  toggleVoice: () => void;
  setRecordingBlackBox: (rec: boolean) => void;
  incrementRecTimer: () => void;
  setCameraMode: (mode: 'RGB' | 'THERMAL_FLIR') => void;
  setGimbal: (droneId: string, ptz: Partial<CameraGimbalState>) => void;
  setAIStatus: (status: AIStatus) => void;
  setWind: (wind: WindData) => void;
  setPNRList: (list: PNRDroneStatus[]) => void;
  setAntiJamming: (status: AntiJammingStatus) => void;
  setCoverage: (pct: number, areaM2: number) => void;
  setDetections: (detections: TargetDetection[]) => void;
  addDetection: (target: TargetDetection) => void;
  setDrawingMode: (active: boolean) => void;
  addDrawnPoint: (pt: [number, number]) => void;
  clearDrawnPoints: () => void;
}

export const useSwarmStore = create<SwarmStoreState>((set, get) => ({
  drones: [],
  alerts: [],
  selectedDroneId: 'ARES-01',
  wsConnected: false,
  wsHz: 20,
  frameSeq: 0,
  viewMode: '3d',
  activeTab: 'fleet',
  theme: 'dark',
  voiceEnabled: true,
  recordingBlackBox: false,
  recordingDurationSec: 0,
  cameraMode: 'RGB',
  ptz: {
    'ARES-01': { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 },
    'ARES-02': { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 },
    'ARES-03': { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 },
  },
  aiStatus: {
    node_id: 'JETSON-ORIN-01',
    model_name: 'D-FINE-L (RT-DETR)',
    status: 'ONLINE',
    fps: 30.0,
    gpu_temp_c: 48.2,
    vram_usage_mb: 2200,
    is_online: true,
  },
  wind: { speed_ms: 3.5, direction_deg: 120 },
  pnrList: [],
  antiJamming: {
    ew_environment: 'SEGURO (NOMINAL)',
    jamming_active: false,
    spoofing_active: false,
    gps_mode: 'GPS_FIX_3D',
    sats_visible: 16,
    position_uncertainty_m: 0.8,
    recommended_action: 'Vuelo nominal bajo guía por satélite.',
  },
  coveragePct: 14.5,
  coveredAreaM2: 4500,
  detections: [],
  isDrawingMode: false,
  drawnPoints: [],

  handleTelemetryFrame: (frame: TelemetryFrame) => {
    const prevAlerts = get().alerts;
    
    // Check if new breach alert happened to announce over tactical voice
    if (get().voiceEnabled && frame.active_alerts && frame.active_alerts.length > 0) {
      const topAlert = frame.active_alerts[0];
      if (topAlert.severity === 'CRITICAL' && (!prevAlerts.length || prevAlerts[0].message !== topAlert.message)) {
        tacticalVoice.speak(`Alerta crítica: ${topAlert.message}`, 'collision');
      }
    }

    set({
      drones: frame.drones || [],
      alerts: frame.active_alerts || [],
      frameSeq: frame.frame_sequence,
      wsHz: frame.frequency_hz || 20,
    });
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),
  setSelectedDroneId: (droneId) => set({ selectedDroneId: droneId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleTheme: () => {
    const current = get().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    if (next === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
    set({ theme: next });
  },

  toggleVoice: () => {
    const next = !get().voiceEnabled;
    tacticalVoice.setEnabled(next);
    set({ voiceEnabled: next });
    if (next) {
      tacticalVoice.speak('Voz táctica activada', 'sys', true);
    }
  },

  setRecordingBlackBox: (rec) => set({ recordingBlackBox: rec }),
  incrementRecTimer: () => set((state) => ({ recordingDurationSec: state.recordingDurationSec + 1 })),
  setCameraMode: (mode) => set({ cameraMode: mode }),

  setGimbal: (droneId, partial) => set((state) => ({
    ptz: {
      ...state.ptz,
      [droneId]: {
        ...(state.ptz[droneId] || { pitch_deg: -45, yaw_deg: 0, zoom: 1.0 }),
        ...partial
      }
    }
  })),

  setAIStatus: (status) => set({ aiStatus: status }),
  setWind: (wind) => set({ wind }),
  setPNRList: (pnrList) => set({ pnrList }),
  setAntiJamming: (antiJamming) => set({ antiJamming }),
  setCoverage: (coveragePct, coveredAreaM2) => set({ coveragePct, coveredAreaM2 }),
  setDetections: (detections) => set({ detections }),
  addDetection: (target) => set((state) => ({ detections: [target, ...state.detections] })),
  setDrawingMode: (active) => set({ isDrawingMode: active }),
  addDrawnPoint: (pt) => set((state) => ({ drawnPoints: [...state.drawnPoints, pt] })),
  clearDrawnPoints: () => set({ drawnPoints: [] }),
}));
