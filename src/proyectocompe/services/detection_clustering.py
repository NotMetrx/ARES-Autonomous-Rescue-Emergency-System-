import math
import time
from typing import Optional, Tuple, List
from proyectocompe.schemas.detection import TargetDetection, TargetClass
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG
from proyectocompe.services.detection_db import detection_db

class DetectionClusteringService:
    """
    Spatio-Temporal Clustering & Deduplication Engine for Edge AI Detections.
    Prevents alert flooding (e.g. 20 FPS YOLO detections over the same survivor)
    by clustering detections within a spatial radius (e.g. 8m) and time window.
    """

    def __init__(self, spatial_radius_m: float = 8.0, time_window_s: float = 60.0):
        self.spatial_radius_m = spatial_radius_m
        self.time_window_s = time_window_s
        self._active_targets: List[TargetDetection] = []

    @staticmethod
    def calculate_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        dy = (lat1 - lat2) * METERS_PER_LAT_DEG
        dx = (lon1 - lon2) * (METERS_PER_LAT_DEG * math.cos(math.radians(lat1)))
        return math.sqrt(dx * dx + dy * dy)

    async def ingest_and_cluster(self, candidate: TargetDetection) -> Tuple[TargetDetection, bool]:
        """
        Ingests a geo-referenced candidate target.
        Returns (target, is_new):
          - is_new=True: New tactical target, mandates alert and task dispatch.
          - is_new=False: Clustered with an existing target; coordinates and confidence refined.
        """
        now = candidate.reported_at or time.time()
        
        # Look for existing matching target in active memory or recent DB records
        matched_target: Optional[TargetDetection] = None
        min_dist = float("inf")

        for existing in self._active_targets:
            # Check target class matching and temporal proximity
            if existing.target_class == candidate.target_class:
                if (now - existing.last_seen_at) <= self.time_window_s:
                    dist = self.calculate_distance_m(
                        existing.estimated_lat, existing.estimated_lon,
                        candidate.estimated_lat, candidate.estimated_lon
                    )
                    if dist <= self.spatial_radius_m and dist < min_dist:
                        min_dist = dist
                        matched_target = existing

        # If not found in memory, query recent DB detections
        if not matched_target:
            recent_db = await detection_db.get_all_detections(target_class=candidate.target_class.value)
            for existing in recent_db:
                if (now - existing.last_seen_at) <= self.time_window_s:
                    dist = self.calculate_distance_m(
                        existing.estimated_lat, existing.estimated_lon,
                        candidate.estimated_lat, candidate.estimated_lon
                    )
                    if dist <= self.spatial_radius_m and dist < min_dist:
                        min_dist = dist
                        matched_target = existing

        if matched_target:
            # Merge candidate into matched_target (running average of geo coordinates)
            n = matched_target.observation_count
            matched_target.estimated_lat = round(
                (matched_target.estimated_lat * n + candidate.estimated_lat) / (n + 1), 7
            )
            matched_target.estimated_lon = round(
                (matched_target.estimated_lon * n + candidate.estimated_lon) / (n + 1), 7
            )
            matched_target.observation_count += 1
            matched_target.last_seen_at = now
            
            # Keep highest confidence and newest snapshot if confidence is higher
            if candidate.confidence > matched_target.confidence:
                matched_target.confidence = candidate.confidence
                if candidate.snapshot_base64:
                    matched_target.snapshot_base64 = candidate.snapshot_base64

            # Persist update
            await detection_db.update_clustered_detection(matched_target)
            return matched_target, False
        else:
            # Register new target
            candidate.first_seen_at = now
            candidate.last_seen_at = now
            candidate.observation_count = 1
            
            saved = await detection_db.save_detection(candidate)
            self._active_targets.append(saved)
            # Prune active cache
            if len(self._active_targets) > 50:
                self._active_targets.pop(0)

            return saved, True

clustering_service = DetectionClusteringService()
