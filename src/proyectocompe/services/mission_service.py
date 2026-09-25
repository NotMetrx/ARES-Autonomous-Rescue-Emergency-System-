import os
import json
import time
import math
import uuid
import aiosqlite
from typing import List, Dict, Optional
from proyectocompe.schemas.mission import (
    MissionCreate,
    MissionStatus,
    SearchGridRequest,
    Waypoint,
)
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "ares_missions.db")

class MissionService:
    """
    Tactical Mission Planner & Boustrophedon (Lawnmower) Search Grid Generator.
    Distributes sweep sectors across the drone swarm without geometric conflict.
    Persists missions in SQLite.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.active_missions: Dict[str, MissionStatus] = {}

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS missions (
                    mission_id TEXT PRIMARY KEY,
                    mission_name TEXT,
                    status TEXT,
                    assigned_drones TEXT,
                    current_waypoint_index INTEGER,
                    total_waypoints INTEGER,
                    created_at REAL,
                    drone_waypoints_json TEXT
                )
            """)
            await db.commit()

    async def save_mission(self, m: MissionStatus) -> MissionStatus:
        await self.init_db()
        assigned_json = json.dumps(m.assigned_drones)
        waypoints_dict = {
            d_id: [wp.model_dump() for wp in wps]
            for d_id, wps in m.drone_waypoints.items()
        }
        waypoints_json = json.dumps(waypoints_dict)

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT OR REPLACE INTO missions (
                    mission_id, mission_name, status, assigned_drones,
                    current_waypoint_index, total_waypoints, created_at, drone_waypoints_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                m.mission_id, m.mission_name, m.status, assigned_json,
                m.current_waypoint_index, m.total_waypoints, m.created_at, waypoints_json
            ))
            await db.commit()

        self.active_missions[m.mission_id] = m
        return m

    async def get_all_missions(self) -> List[MissionStatus]:
        await self.init_db()
        missions: List[MissionStatus] = []
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM missions ORDER BY created_at DESC") as cursor:
                async for row in cursor:
                    d_wps: Dict[str, List[Waypoint]] = {}
                    if row["drone_waypoints_json"]:
                        try:
                            raw_wps = json.loads(row["drone_waypoints_json"])
                            for d_id, wps_list in raw_wps.items():
                                d_wps[d_id] = [Waypoint(**wp) for wp in wps_list]
                        except Exception:
                            pass
                    missions.append(MissionStatus(
                        mission_id=row["mission_id"],
                        mission_name=row["mission_name"],
                        status=row["status"],
                        assigned_drones=json.loads(row["assigned_drones"]),
                        current_waypoint_index=row["current_waypoint_index"],
                        total_waypoints=row["total_waypoints"],
                        created_at=row["created_at"],
                        drone_waypoints=d_wps
                    ))
        return missions

    def generate_search_grid(
        self,
        req: SearchGridRequest,
        base_lat: float = -12.046374,
        base_lon: float = -77.042793
    ) -> MissionStatus:
        """
        Generates partitioned Boustrophedon (lawnmower) survey paths for N drones.
        Splits the search box into N equal slices along the longitude axis so
        drones never cross paths during parallel sweep.
        """
        c_lat = req.center_lat or base_lat
        c_lon = req.center_lon or base_lon
        total_width_m = req.width_meters
        total_height_m = req.height_meters

        # If custom drawn polygon vertices are passed, adapt bounding box directly
        if req.polygon_vertices and len(req.polygon_vertices) >= 3:
            lats = [v["lat"] if isinstance(v, dict) else v.lat for v in req.polygon_vertices]
            lons = [v["lon"] if isinstance(v, dict) else v.lon for v in req.polygon_vertices]
            min_lat, max_lat = min(lats), max(lats)
            min_lon, max_lon = min(lons), max(lons)
            c_lat = (min_lat + max_lat) / 2.0
            c_lon = (min_lon + max_lon) / 2.0
            total_height_m = max(40.0, (max_lat - min_lat) * METERS_PER_LAT_DEG)
            total_width_m = max(40.0, (max_lon - min_lon) * (METERS_PER_LAT_DEG * math.cos(math.radians(c_lat))))

        num_drones = max(1, len(req.assigned_drone_ids))
        cos_lat = math.cos(math.radians(c_lat))
        spacing_m = req.swath_spacing_m

        # Calculate bounding box in meters relative to center
        slice_width_m = total_width_m / num_drones
        drone_waypoints: Dict[str, List[Waypoint]] = {}
        total_wp_count = 0

        for i, drone_id in enumerate(req.assigned_drone_ids):
            wps: List[Waypoint] = []
            
            # X bounds for this drone's slice
            x_min = -total_width_m / 2.0 + (i * slice_width_m)
            x_max = x_min + slice_width_m
            
            # Number of sweep lines from South to North
            num_lines = max(2, int(total_height_m / spacing_m) + 1)
            wp_idx = 0

            for line_idx in range(num_lines):
                y = -total_height_m / 2.0 + (line_idx * (total_height_m / (num_lines - 1)))
                
                # Alternate direction left-to-right, then right-to-left
                if line_idx % 2 == 0:
                    start_x, end_x = x_min + 5.0, x_max - 5.0
                else:
                    start_x, end_x = x_max - 5.0, x_min + 5.0

                # Waypoint 1 (Start of swath)
                lat1 = c_lat + (y / METERS_PER_LAT_DEG)
                lon1 = c_lon + (start_x / (METERS_PER_LAT_DEG * cos_lat))
                wps.append(Waypoint(
                    index=wp_idx,
                    lat=round(lat1, 7),
                    lon=round(lon1, 7),
                    alt=req.altitude_m,
                    speed_ms=req.speed_ms,
                    action="SCAN"
                ))
                wp_idx += 1

                # Waypoint 2 (End of swath)
                lat2 = c_lat + (y / METERS_PER_LAT_DEG)
                lon2 = c_lon + (end_x / (METERS_PER_LAT_DEG * cos_lat))
                wps.append(Waypoint(
                    index=wp_idx,
                    lat=round(lat2, 7),
                    lon=round(lon2, 7),
                    alt=req.altitude_m,
                    speed_ms=req.speed_ms,
                    action="SCAN"
                ))
                wp_idx += 1

            drone_waypoints[drone_id] = wps
            total_wp_count += len(wps)

        mission_id = f"MSN-{str(uuid.uuid4())[:6].upper()}"
        status = MissionStatus(
            mission_id=mission_id,
            mission_name=req.mission_name,
            status="ACTIVE",
            assigned_drones=req.assigned_drone_ids,
            current_waypoint_index=0,
            total_waypoints=total_wp_count,
            created_at=time.time(),
            drone_waypoints=drone_waypoints
        )
        return status

mission_service = MissionService()
