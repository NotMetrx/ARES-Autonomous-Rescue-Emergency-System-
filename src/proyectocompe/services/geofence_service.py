import math
import time
import uuid
from typing import List, Dict, Tuple, Optional
from proyectocompe.schemas.geofence import (
    Geofence,
    GeofenceCreate,
    GeofenceType,
    GeofenceCoordinate,
    GeofenceBreachAlert,
)
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG

class GeofenceService:
    """
    Real-time Geofencing and No-Fly Zone (NFZ) Engine for Tactical UAV Swarm.
    Supports KEEP_IN (operational perimeter) and KEEP_OUT (restricted zones).
    Calculates point-in-polygon and boundary proximity distance.
    """

    def __init__(self):
        self._geofences: Dict[str, Geofence] = {}
        self._seed_default_geofences()

    def _seed_default_geofences(self):
        """Pre-seeds an NFZ (obstacle / antenna mast) and a KEEP_IN perimeter around base."""
        # Base is approx (-12.046374, -77.042793)
        base_lat = -12.046374
        base_lon = -77.042793

        # NFZ: High-Voltage Mast Zone to the North-East
        nfz_id = "NFZ-ALPHA-01"
        nfz_poly = [
            GeofenceCoordinate(lat=base_lat + 0.00030, lon=base_lon + 0.00025),
            GeofenceCoordinate(lat=base_lat + 0.00045, lon=base_lon + 0.00025),
            GeofenceCoordinate(lat=base_lat + 0.00045, lon=base_lon + 0.00040),
            GeofenceCoordinate(lat=base_lat + 0.00030, lon=base_lon + 0.00040),
        ]
        self._geofences[nfz_id] = Geofence(
            fence_id=nfz_id,
            name="Restricted Mast NFZ (Zona Prohibida)",
            fence_type=GeofenceType.KEEP_OUT,
            polygon=nfz_poly,
            min_alt_m=0.0,
            max_alt_m=120.0,
            is_active=True,
            created_at=time.time()
        )

        # KEEP_IN: Tactical Operational Box (250m radius bounding polygon)
        kin_id = "KIN-TACTICAL-BOX"
        d_lat = 0.0018
        d_lon = 0.0020
        kin_poly = [
            GeofenceCoordinate(lat=base_lat - d_lat, lon=base_lon - d_lon),
            GeofenceCoordinate(lat=base_lat + d_lat, lon=base_lon - d_lon),
            GeofenceCoordinate(lat=base_lat + d_lat, lon=base_lon + d_lon),
            GeofenceCoordinate(lat=base_lat - d_lat, lon=base_lon + d_lon),
        ]
        self._geofences[kin_id] = Geofence(
            fence_id=kin_id,
            name="Tactical Operational Boundary (Keep-In)",
            fence_type=GeofenceType.KEEP_IN,
            polygon=kin_poly,
            min_alt_m=0.0,
            max_alt_m=150.0,
            is_active=True,
            created_at=time.time()
        )

    def get_all_geofences(self) -> List[Geofence]:
        return list(self._geofences.values())

    def get_geofence(self, fence_id: str) -> Optional[Geofence]:
        return self._geofences.get(fence_id)

    def create_geofence(self, fence_in: GeofenceCreate) -> Geofence:
        fence_id = f"GF-{str(uuid.uuid4())[:8].upper()}"
        new_fence = Geofence(
            fence_id=fence_id,
            name=fence_in.name,
            fence_type=fence_in.fence_type,
            polygon=fence_in.polygon,
            min_alt_m=fence_in.min_alt_m,
            max_alt_m=fence_in.max_alt_m,
            is_active=True,
            created_at=time.time()
        )
        self._geofences[fence_id] = new_fence
        return new_fence

    def delete_geofence(self, fence_id: str) -> bool:
        if fence_id in self._geofences:
            del self._geofences[fence_id]
            return True
        return False

    @staticmethod
    def point_in_polygon(lat: float, lon: float, polygon: List[GeofenceCoordinate]) -> bool:
        """Ray-casting algorithm to determine if a point is inside a polygon."""
        n = len(polygon)
        inside = False
        p1 = polygon[0]
        for i in range(1, n + 1):
            p2 = polygon[i % n]
            if lon > min(p1.lon, p2.lon):
                if lon <= max(p1.lon, p2.lon):
                    if lat <= max(p1.lat, p2.lat):
                        if p1.lon != p2.lon:
                            xinters = (lon - p1.lon) * (p2.lat - p1.lat) / (p2.lon - p1.lon) + p1.lat
                        if p1.lat == p2.lat or lat <= xinters:
                            inside = not inside
            p1 = p2
        return inside

    @staticmethod
    def distance_point_to_segment_m(lat: float, lon: float, p1: GeofenceCoordinate, p2: GeofenceCoordinate) -> float:
        """Calculates distance from point to line segment in local meters."""
        ref_lat = lat
        cos_lat = math.cos(math.radians(ref_lat))
        
        px = lon * METERS_PER_LAT_DEG * cos_lat
        py = lat * METERS_PER_LAT_DEG
        ax = p1.lon * METERS_PER_LAT_DEG * cos_lat
        ay = p1.lat * METERS_PER_LAT_DEG
        bx = p2.lon * METERS_PER_LAT_DEG * cos_lat
        by = p2.lat * METERS_PER_LAT_DEG

        dx = bx - ax
        dy = by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)

        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        proj_x = ax + t * dx
        proj_y = ay + t * dy
        return math.hypot(px - proj_x, py - proj_y)

    def distance_to_perimeter_m(self, lat: float, lon: float, polygon: List[GeofenceCoordinate]) -> float:
        """Calculates minimum distance from point to polygon perimeter in meters."""
        min_dist = float("inf")
        n = len(polygon)
        for i in range(n):
            p1 = polygon[i]
            p2 = polygon[(i + 1) % n]
            d = self.distance_point_to_segment_m(lat, lon, p1, p2)
            if d < min_dist:
                min_dist = d
        return min_dist

    def evaluate_swarm_geofences(self, drones: List[dict]) -> List[GeofenceBreachAlert]:
        """
        Evaluates all active drones against all active geofences.
        Generates alerts for intrusions, perimeter exits, or critical proximity (<10m).
        """
        alerts: List[GeofenceBreachAlert] = []
        warning_buffer_m = 10.0

        for d in drones:
            drone_id = d.get("drone_id", "UNKNOWN")
            lat = d.get("lat", 0.0)
            lon = d.get("lon", 0.0)
            alt = d.get("alt", 0.0)

            for fence in self._geofences.values():
                if not fence.is_active:
                    continue
                # Altitude check
                if alt < fence.min_alt_m or alt > fence.max_alt_m:
                    continue

                is_inside = self.point_in_polygon(lat, lon, fence.polygon)
                dist_to_edge = self.distance_to_perimeter_m(lat, lon, fence.polygon)

                if fence.fence_type == GeofenceType.KEEP_OUT:
                    if is_inside:
                        alerts.append(GeofenceBreachAlert(
                            alert_id=str(uuid.uuid4())[:8],
                            timestamp=time.time(),
                            drone_id=drone_id,
                            fence_id=fence.fence_id,
                            fence_name=fence.name,
                            breach_type="KEEP_OUT_INTRUSION",
                            distance_to_boundary_m=round(dist_to_edge, 1),
                            message=f"CRITICAL: {drone_id} entered No-Fly Zone '{fence.name}'!"
                        ))
                    elif dist_to_edge < warning_buffer_m:
                        alerts.append(GeofenceBreachAlert(
                            alert_id=str(uuid.uuid4())[:8],
                            timestamp=time.time(),
                            drone_id=drone_id,
                            fence_id=fence.fence_id,
                            fence_name=fence.name,
                            breach_type="PROXIMITY_WARNING",
                            distance_to_boundary_m=round(dist_to_edge, 1),
                            message=f"WARNING: {drone_id} is {dist_to_edge:.1f}m from NFZ '{fence.name}'"
                        ))

                elif fence.fence_type == GeofenceType.KEEP_IN:
                    if not is_inside:
                        alerts.append(GeofenceBreachAlert(
                            alert_id=str(uuid.uuid4())[:8],
                            timestamp=time.time(),
                            drone_id=drone_id,
                            fence_id=fence.fence_id,
                            fence_name=fence.name,
                            breach_type="KEEP_IN_EXIT",
                            distance_to_boundary_m=round(dist_to_edge, 1),
                            message=f"CRITICAL: {drone_id} exited operational boundary '{fence.name}'!"
                        ))

        return alerts

    def export_geojson(self) -> dict:
        """Exports all active geofences as GeoJSON Polygon Features."""
        features = []
        for f in self._geofences.values():
            coords = [[c.lon, c.lat] for c in f.polygon]
            # Close polygon ring
            if coords and coords[0] != coords[-1]:
                coords.append(coords[0])

            color = "#ef4444" if f.fence_type == GeofenceType.KEEP_OUT else "#06b6d4"
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                },
                "properties": {
                    "fence_id": f.fence_id,
                    "name": f.name,
                    "fence_type": f.fence_type.value,
                    "min_alt_m": f.min_alt_m,
                    "max_alt_m": f.max_alt_m,
                    "color": color
                }
            })
        return {
            "type": "FeatureCollection",
            "features": features
        }

geofence_service = GeofenceService()
