export type FSMState = 'IDLE' | 'TAKEOFF' | 'IN_FLIGHT' | 'ROUTING' | 'AVOIDING' | 'RTH' | 'LANDED' | 'EMERGENCY';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Orientation3D {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface DroneTelemetry {
  drone_id: string;
  timestamp: number;
  lat: number;
  lon: number;
  alt: number;
  velocity: Vector3D;
  orientation: Orientation3D;
  speed_ms: number;
  battery: number;
  fsm_state: FSMState;
  in_safety_breach: boolean;
  nearest_peer_id?: string | null;
  nearest_distance_m?: number | null;
  evasion_vector?: Vector3D | null;
}

export interface TacticalAlert {
  alert_id?: string;
  timestamp: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  drone_id: string;
  peer_id?: string;
  distance_m?: number;
  evasion_applied?: boolean;
  message: string;
}

export interface TelemetryFrame {
  frame_sequence: number;
  timestamp: number;
  frequency_hz: number;
  active_drones_count: number;
  drones: DroneTelemetry[];
  active_alerts: TacticalAlert[];
  survivors_in_view?: number;
  hazards_in_view?: number;
}

export interface AIStatus {
  node_id: string;
  model_name: string;
  status: string;
  fps: number;
  gpu_temp_c: number;
  vram_usage_mb: number;
  is_online: boolean;
  last_inference_latency_ms?: number;
}

export interface WindData {
  speed_ms: number;
  direction_deg: number;
}

export interface PNRDroneStatus {
  drone_id: string;
  battery_pct: number;
  rth_battery_required: number;
  margin_pct: number;
  status: 'NOMINAL' | 'CAUTION' | 'CRITICAL' | 'BREACHED';
  requires_immediate_rth: boolean;
}

export interface AntiJammingStatus {
  ew_environment: string;
  jamming_active: boolean;
  spoofing_active: boolean;
  gps_mode: string;
  sats_visible: number;
  position_uncertainty_m: number;
  recommended_action: string;
}

export interface GeofenceCoordinate {
  lat: number;
  lon: number;
}

export interface Geofence {
  id: string;
  name: string;
  fence_type: 'KEEP_IN' | 'KEEP_OUT';
  min_alt_m: number;
  max_alt_m: number;
  polygon: GeofenceCoordinate[];
}

export interface TargetDetection {
  detection_id: string;
  drone_id: string;
  target_class: 'SURVIVOR' | 'VEHICLE' | 'FIRE_HAZARD' | 'STRUCTURE' | 'OBSTACLE';
  confidence: number;
  lat: number;
  lon: number;
  alt: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  observation_count: number;
  snapshot_path?: string;
  snapshot_url?: string;
  track_id?: number | string;
  timestamp: number;
}

export interface CameraGimbalState {
  pitch_deg: number;
  yaw_deg: number;
  zoom: number;
}
