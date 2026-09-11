import math
from typing import List, Dict, Any, Tuple

EARTH_RADIUS_METERS = 6371000.0

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates ground distance in meters between two lat/lon coordinates."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c

def distance_3d(p1: Tuple[float, float, float], p2: Tuple[float, float, float]) -> float:
    """Calculates 3D Euclidean-approximated distance in meters."""
    ground_dist = haversine_distance(p1[0], p1[1], p2[0], p2[1])
    alt_diff = p2[2] - p1[2]
    return math.sqrt(ground_dist ** 2 + alt_diff ** 2)

def generate_waypoints(
    origin: Tuple[float, float, float],
    destination: Tuple[float, float, float],
    cruise_speed_mps: float = 18.0,
    wind_vector: List[float] = None,
    num_intermediate_points: int = 30
) -> Tuple[List[Dict[str, Any]], float, int]:
    """
    Generates discretized 3D waypoints along the route.
    Returns: (waypoints_list, total_distance_meters, estimated_duration_seconds)
    """
    if wind_vector is None:
        wind_vector = [0.0, 0.0, 0.0]

    total_dist = distance_3d(origin, destination)
    # Effective speed considering head/tail wind component
    effective_speed = max(5.0, cruise_speed_mps - wind_vector[0] * 0.2)
    total_time_seconds = int(total_dist / effective_speed)

    waypoints = []
    num_steps = max(2, num_intermediate_points)
    
    for i in range(num_steps):
        t = i / (num_steps - 1)
        lat = origin[0] + t * (destination[0] - origin[0])
        lon = origin[1] + t * (destination[1] - origin[1])
        alt = origin[2] + t * (destination[2] - origin[2])
        
        # Add slight tactical altitude curve (takeoff, cruise, descend)
        if 0 < i < num_steps - 1:
            alt += 15.0 * math.sin(math.pi * t)
            
        time_offset_ms = int(t * total_time_seconds * 1000)
        
        waypoints.append({
            "sequence_order": i,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "altitude_meters": round(alt, 1),
            "target_speed_mps": round(effective_speed, 1),
            "expected_timestamp_offset_ms": time_offset_ms
        })

    return waypoints, round(total_dist, 1), total_time_seconds
