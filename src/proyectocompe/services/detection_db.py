import os
import json
import time
import aiosqlite
from typing import List, Optional
from proyectocompe.schemas.detection import (
    TargetDetection,
    TargetClass,
    TargetPriority,
    BoundingBox,
)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "ares_detections.db")

SNAPSHOTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "snapshots")

class DetectionDatabase:
    """Async SQLite persistence layer for AI target detections with clustering & disk snapshot storage."""
    
    def __init__(self, db_path: str = DB_PATH, snapshots_dir: str = SNAPSHOTS_DIR):
        self.db_path = db_path
        self.snapshots_dir = snapshots_dir
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        os.makedirs(self.snapshots_dir, exist_ok=True)

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS detections (
                    detection_id TEXT PRIMARY KEY,
                    reported_at REAL,
                    drone_id TEXT,
                    target_class TEXT,
                    priority TEXT,
                    confidence REAL,
                    estimated_lat REAL,
                    estimated_lon REAL,
                    estimated_alt REAL,
                    status TEXT,
                    assigned_drone_id TEXT,
                    bounding_box_json TEXT,
                    snapshot_base64 TEXT,
                    observation_count INTEGER DEFAULT 1,
                    first_seen_at REAL DEFAULT 0.0,
                    last_seen_at REAL DEFAULT 0.0,
                    snapshot_path TEXT DEFAULT NULL
                )
            """)
            # Check for column additions in existing DBs
            async with db.execute("PRAGMA table_info(detections)") as cursor:
                columns = [row[1] for row in await cursor.fetchall()]
                if "observation_count" not in columns:
                    await db.execute("ALTER TABLE detections ADD COLUMN observation_count INTEGER DEFAULT 1")
                if "first_seen_at" not in columns:
                    await db.execute("ALTER TABLE detections ADD COLUMN first_seen_at REAL DEFAULT 0.0")
                if "last_seen_at" not in columns:
                    await db.execute("ALTER TABLE detections ADD COLUMN last_seen_at REAL DEFAULT 0.0")
                if "snapshot_path" not in columns:
                    await db.execute("ALTER TABLE detections ADD COLUMN snapshot_path TEXT DEFAULT NULL")
            await db.commit()

    def _save_snapshot_to_disk(self, detection_id: str, b64_data: Optional[str]) -> Optional[str]:
        if not b64_data:
            return None
        try:
            import base64
            # Strip header if present (e.g. data:image/jpeg;base64,...)
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            raw_bytes = base64.b64decode(b64_data)
            file_path = os.path.join(self.snapshots_dir, f"{detection_id}.jpg")
            with open(file_path, "wb") as f:
                f.write(raw_bytes)
            return file_path
        except Exception:
            return None

    async def save_detection(self, d: TargetDetection) -> TargetDetection:
        await self.init_db()
        bbox_json = d.bounding_box.model_dump_json() if d.bounding_box else None
        
        # Save snapshot to disk if provided
        if d.snapshot_base64 and not d.snapshot_path:
            d.snapshot_path = self._save_snapshot_to_disk(d.detection_id, d.snapshot_base64)
            if d.snapshot_path:
                d.snapshot_url = f"/api/v1/detections/{d.detection_id}/snapshot"

        if d.first_seen_at == 0.0:
            d.first_seen_at = d.reported_at
        if d.last_seen_at == 0.0:
            d.last_seen_at = d.reported_at

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO detections (
                    detection_id, reported_at, drone_id, target_class, priority,
                    confidence, estimated_lat, estimated_lon, estimated_alt,
                    status, assigned_drone_id, bounding_box_json, snapshot_base64,
                    observation_count, first_seen_at, last_seen_at, snapshot_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                d.detection_id, d.reported_at, d.drone_id, d.target_class.value, d.priority.value,
                d.confidence, d.estimated_lat, d.estimated_lon, d.estimated_alt,
                d.status, d.assigned_drone_id, bbox_json, d.snapshot_base64,
                d.observation_count, d.first_seen_at, d.last_seen_at, d.snapshot_path
            ))
            await db.commit()
        return d

    async def update_clustered_detection(self, d: TargetDetection) -> TargetDetection:
        """Updates confidence, coordinates, observation count and timestamp for merged detection."""
        await self.init_db()
        if d.snapshot_base64:
            new_path = self._save_snapshot_to_disk(d.detection_id, d.snapshot_base64)
            if new_path:
                d.snapshot_path = new_path
                d.snapshot_url = f"/api/v1/detections/{d.detection_id}/snapshot"

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE detections SET
                    confidence = ?,
                    estimated_lat = ?,
                    estimated_lon = ?,
                    observation_count = ?,
                    last_seen_at = ?,
                    snapshot_path = COALESCE(?, snapshot_path)
                WHERE detection_id = ?
            """, (
                d.confidence, d.estimated_lat, d.estimated_lon,
                d.observation_count, d.last_seen_at, d.snapshot_path,
                d.detection_id
            ))
            await db.commit()
        return d

    async def get_detection(self, detection_id: str) -> Optional[TargetDetection]:
        await self.init_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM detections WHERE detection_id = ?", (detection_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                return self._row_to_target(row)

    def _row_to_target(self, row) -> TargetDetection:
        bbox = None
        if row["bounding_box_json"]:
            try:
                bbox = BoundingBox(**json.loads(row["bounding_box_json"]))
            except Exception:
                pass
        
        det_id = row["detection_id"]
        snap_path = row["snapshot_path"] if "snapshot_path" in row.keys() else None
        snap_url = f"/api/v1/detections/{det_id}/snapshot" if (snap_path and os.path.exists(snap_path)) else None

        return TargetDetection(
            detection_id=det_id,
            reported_at=row["reported_at"],
            first_seen_at=row["first_seen_at"] if "first_seen_at" in row.keys() and row["first_seen_at"] else row["reported_at"],
            last_seen_at=row["last_seen_at"] if "last_seen_at" in row.keys() and row["last_seen_at"] else row["reported_at"],
            observation_count=row["observation_count"] if "observation_count" in row.keys() and row["observation_count"] else 1,
            drone_id=row["drone_id"],
            target_class=TargetClass(row["target_class"]),
            priority=TargetPriority(row["priority"]),
            confidence=row["confidence"],
            estimated_lat=row["estimated_lat"],
            estimated_lon=row["estimated_lon"],
            estimated_alt=row["estimated_alt"],
            status=row["status"],
            assigned_drone_id=row["assigned_drone_id"],
            bounding_box=bbox,
            snapshot_base64=row["snapshot_base64"],
            snapshot_path=snap_path,
            snapshot_url=snap_url
        )

    async def get_all_detections(
        self,
        target_class: Optional[str] = None,
        min_confidence: float = 0.0,
        status: Optional[str] = None
    ) -> List[TargetDetection]:
        await self.init_db()
        query = "SELECT * FROM detections WHERE confidence >= ?"
        params = [min_confidence]

        if target_class:
            query += " AND target_class = ?"
            params.append(target_class)
        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY reported_at DESC"

        results: List[TargetDetection] = []
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                async for row in cursor:
                    results.append(self._row_to_target(row))
        return results

    async def update_status(self, detection_id: str, new_status: str, assigned_drone: Optional[str] = None) -> bool:
        await self.init_db()
        async with aiosqlite.connect(self.db_path) as db:
            if assigned_drone:
                await db.execute(
                    "UPDATE detections SET status = ?, assigned_drone_id = ? WHERE detection_id = ?",
                    (new_status, assigned_drone, detection_id)
                )
            else:
                await db.execute(
                    "UPDATE detections SET status = ? WHERE detection_id = ?",
                    (new_status, detection_id)
                )
            await db.commit()
        return True

    async def export_geojson(self) -> dict:
        """Exports all detected targets as standard GeoJSON for MapLibre GL JS / QGIS."""
        detections = await self.get_all_detections()
        features = []
        for d in detections:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [d.estimated_lon, d.estimated_lat, d.estimated_alt]
                },
                "properties": {
                    "detection_id": d.detection_id,
                    "target_class": d.target_class.value,
                    "priority": d.priority.value,
                    "confidence": round(d.confidence, 3),
                    "status": d.status,
                    "drone_id": d.drone_id,
                    "observation_count": d.observation_count,
                    "snapshot_url": d.snapshot_url,
                    "assigned_drone_id": d.assigned_drone_id,
                    "reported_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(d.reported_at))
                }
            })
        return {
            "type": "FeatureCollection",
            "features": features
        }

detection_db = DetectionDatabase()
