import math
import uuid
import time
from typing import Optional, Tuple
from proyectocompe.schemas.detection import (
    TargetClass,
    TargetPriority,
    TargetDetectionCreate,
    TargetDetection,
)
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG

PRIORITY_MAP = {
    TargetClass.SURVIVOR: TargetPriority.CRITICAL,
    TargetClass.FIRE_HAZARD: TargetPriority.HIGH,
    TargetClass.INTRUDER: TargetPriority.HIGH,
    TargetClass.VEHICLE: TargetPriority.MEDIUM,
    TargetClass.INFRASTRUCTURE_DAMAGE: TargetPriority.MEDIUM,
    TargetClass.UNKNOWN: TargetPriority.LOW,
}

class GeoProjectionService:
    """
    Projects 2D camera detections to 3D WGS84 ground coordinates.
    Integrates drone kinematics (lat, lon, alt, yaw) and camera gimbal angles.
    """
    @staticmethod
    def project_to_ground(
        drone_lat: float,
        drone_lon: float,
        drone_alt: float,
        drone_yaw: float,
        pitch_deg: float,
        yaw_deg: float
    ) -> Tuple[float, float]:
        """
        Calculates ground intersection point (z=0) using ray casting.
        pitch_deg: typically negative (e.g. -45 deg for forward-down, -90 deg for nadir).
        """
        pitch = abs(pitch_deg)
        if pitch < 5.0:
            pitch = 5.0  # Prevent infinite projection when looking at horizon
        if pitch > 90.0:
            pitch = 90.0

        # Ground distance in meters
        ground_dist_m = drone_alt / math.tan(math.radians(pitch))

        # Absolute azimuth in degrees
        azimuth_deg = (drone_yaw + yaw_deg) % 360.0
        azimuth_rad = math.radians(azimuth_deg)

        # Delta north and east in meters
        dn = ground_dist_m * math.cos(azimuth_rad)
        de = ground_dist_m * math.sin(azimuth_rad)

        target_lat = drone_lat + (dn / METERS_PER_LAT_DEG)
        target_lon = drone_lon + (de / (METERS_PER_LAT_DEG * math.cos(math.radians(drone_lat))))

        return round(target_lat, 7), round(target_lon, 7)

    def process_detection(
        self,
        req: TargetDetectionCreate,
        drone_telemetry_dict: dict
    ) -> TargetDetection:
        """
        Transforms incoming AI detection into a geo-referenced tactical target.
        """
        # Determine coordinates (use edge override if provided, otherwise raycast)
        if req.custom_lat is not None and req.custom_lon is not None:
            est_lat, est_lon = req.custom_lat, req.custom_lon
        else:
            d_lat = drone_telemetry_dict.get("lat", -12.0463)
            d_lon = drone_telemetry_dict.get("lon", -77.0428)
            d_alt = drone_telemetry_dict.get("alt", 30.0)
            d_yaw = drone_telemetry_dict.get("yaw", 0.0)

            est_lat, est_lon = self.project_to_ground(
                drone_lat=d_lat,
                drone_lon=d_lon,
                drone_alt=d_alt,
                drone_yaw=d_yaw,
                pitch_deg=req.camera_pitch_deg,
                yaw_deg=req.camera_yaw_deg
            )

        priority = PRIORITY_MAP.get(req.target_class, TargetPriority.MEDIUM)

        return TargetDetection(
            detection_id=f"TGT-{str(uuid.uuid4())[:8].upper()}",
            reported_at=time.time(),
            drone_id=req.drone_id,
            target_class=req.target_class,
            priority=priority,
            confidence=round(req.confidence, 3),
            estimated_lat=est_lat,
            estimated_lon=est_lon,
            estimated_alt=0.0,
            status="CONFIRMED",
            assigned_drone_id=None,
            bounding_box=req.bounding_box,
            snapshot_base64=req.snapshot_base64
        )

geo_projection_service = GeoProjectionService()
