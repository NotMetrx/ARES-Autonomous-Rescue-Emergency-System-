from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

class LoginRequest(BaseModel):
    username: str
    password: str

class OperatorInfo(BaseModel):
    operator_id: int
    username: str
    full_name: str
    role: str

class LoginResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_in_seconds: int = 28800
    operator: OperatorInfo

class GeoPoint(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    altitude_meters: float = Field(..., ge=0.0)

class SupplyItemRequest(BaseModel):
    supply_id: int
    quantity: int = Field(..., gt=0)

class CreateMissionRequest(BaseModel):
    priority_code: str = "GOLDEN_HOUR_CRITICAL"
    origin: GeoPoint
    destination: GeoPoint
    scheduled_departure_time: str
    supplies: List[SupplyItemRequest]

class CreateMissionResponse(BaseModel):
    mission_id: int
    mission_code: str
    status: str
    priority_code: str
    max_sla_minutes: int
    total_cargo_weight_grams: int
    created_at: str

class NoFlyZone(BaseModel):
    latitude: float
    longitude: float
    radius_meters: float
    ceiling_meters: float

class EnvironmentalFactors(BaseModel):
    wind_vector_mps: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    no_fly_zones: List[NoFlyZone] = Field(default_factory=list)

class RouteCalculateRequest(BaseModel):
    required_swarm_size: int = 2
    dynamic_obstacle_simulation: bool = True
    environmental_factors: Optional[EnvironmentalFactors] = None

class RouteSegment(BaseModel):
    drone_id: int
    swarm_role: str
    trajectory_id: int
    total_distance_meters: float
    estimated_flight_seconds: int
    waypoints_generated: int

class RouteCalculateResponse(BaseModel):
    mission_id: int
    rl_model_version: str
    computation_latency_ms: float
    routes: List[RouteSegment]

class DispatchResponse(BaseModel):
    mission_id: int
    status: str
    dispatched_at: str
    drones_dispatched: List[int]

class TelemetryIngestRequest(BaseModel):
    drone_id: int
    mission_id: int
    current_latitude: float = Field(..., ge=-90.0, le=90.0)
    current_longitude: float = Field(..., ge=-180.0, le=180.0)
    current_altitude_meters: float = Field(..., ge=0.0)
    current_speed_mps: float = Field(..., ge=0.0)
    battery_percentage: float = Field(..., ge=0.0, le=100.0)
    signal_snr_db: float
    timestamp_utc: Optional[str] = None

class TelemetryIngestResponse(BaseModel):
    status: str
    collision_alert: bool = False

class BenchmarkRequest(BaseModel):
    mission_id: int
    total_obstacles_injected: int = 500
    obstacle_speed_range_mps: List[float] = Field(default_factory=lambda: [2.0, 12.0])
    obstacle_radius_meters: float = 4.0

class BenchmarkResponse(BaseModel):
    simulation_run_id: int
    mission_id: int
    rl_model_checkpoint: str
    total_obstacles_injected: int
    evaded_obstacles_count: int
    collisions_count: int
    success_rate_percentage: float
    charter_threshold_percentage: float = 95.0
    charter_criterion_met: bool
    avg_recalculation_latency_ms: float
