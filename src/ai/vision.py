"""
src/ai/vision.py - 3D Spatial Pinhole Projection & Monocular Depth Engine for ARES.
Transforms 2D D-FINE bounding boxes into 3D metric obstacle coordinates in drone local and world frames.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional, Any, Union
import math
import numpy as np

from src.ai.dfine import DetectionResult

@dataclass
class MetricPrior:
    """Physical dimensions for class priors used in monocular depth estimation."""
    width: float       # Physical width in meters
    height: float      # Physical height in meters
    radius: float      # Safety radius in meters

CLASS_METRIC_PRIORS: Dict[str, MetricPrior] = {
    "DRONE": MetricPrior(width=0.60, height=0.25, radius=0.40),
    "OBSTACLE": MetricPrior(width=4.00, height=4.00, radius=4.00),
    "TERRAIN_HAZARD": MetricPrior(width=5.00, height=5.00, radius=5.00),
    "SURVIVOR": MetricPrior(width=0.50, height=1.70, radius=0.50),
    "BIRD": MetricPrior(width=0.80, height=0.40, radius=0.50),
    "DEFAULT": MetricPrior(width=2.00, height=2.00, radius=2.00)
}

@dataclass
class CameraIntrinsics:
    """Optical parameters of tactical drone front-facing camera."""
    width: int = 640
    height: int = 480
    fx: float = 417.0
    fy: float = 417.0
    cx: float = 320.0
    cy: float = 240.0
    hfov_deg: float = 75.0

    @classmethod
    def from_fov(cls, width: int = 640, height: int = 480, hfov_deg: float = 75.0) -> "CameraIntrinsics":
        fx = (width / 2.0) / math.tan(math.radians(hfov_deg / 2.0))
        fy = fx
        cx = width / 2.0
        cy = height / 2.0
        return cls(width=width, height=height, fx=fx, fy=fy, cx=cx, cy=cy, hfov_deg=hfov_deg)

# Fast lookup arrays indexed by class_id:
# 0: OBSTACLE, 1: DRONE, 2: TERRAIN_HAZARD, 3: SURVIVOR
_PRIOR_WIDTHS = np.array([4.00, 0.60, 5.00, 0.50], dtype=float)
_PRIOR_HEIGHTS = np.array([4.00, 0.25, 5.00, 1.70], dtype=float)

class SpatialProjector:
    """
    Back-projects 2D bounding boxes to 3D metric spatial coordinates in Drone Body and World frames.
    Follows Forward-Left-Up (FLU) and East-North-Up (ENU) standard coordinate conventions.
    """
    def __init__(
        self,
        camera: Optional[CameraIntrinsics] = None,
        cam_offset_body: Optional[np.ndarray] = None,
        priors: Optional[Dict[str, MetricPrior]] = None,
        fx: Optional[float] = None,
        fy: Optional[float] = None,
        cx: Optional[float] = None,
        cy: Optional[float] = None,
    ):
        if camera is not None:
            self.camera = camera
        elif fx is not None:
            c_fx = float(fx)
            c_fy = float(fy if fy is not None else fx)
            c_cx = float(cx if cx is not None else 320.0)
            c_cy = float(cy if cy is not None else 240.0)
            self.camera = CameraIntrinsics(
                width=int(c_cx * 2.0),
                height=int(c_cy * 2.0),
                fx=c_fx,
                fy=c_fy,
                cx=c_cx,
                cy=c_cy
            )
        else:
            self.camera = CameraIntrinsics.from_fov()

        # Front-mounted camera offset: +0.15m ahead of drone CG
        self.cam_offset_body = np.array([0.15, 0.0, 0.0], dtype=float) if cam_offset_body is None else np.array(cam_offset_body, dtype=float)
        self.priors = priors or CLASS_METRIC_PRIORS

        # Rotation matrix from Camera optical frame (X right, Y down, Z forward)
        # to Drone Body frame FLU (X forward, Y left, Z up):
        # Det = +1.0 (Right-handed SO(3))
        self.R_cam_body = np.array([
            [ 0.0,  0.0,  1.0],
            [-1.0,  0.0,  0.0],
            [ 0.0, -1.0,  0.0]
        ], dtype=float)

    def estimate_depth(
        self,
        detection: Union[DetectionResult, Tuple[float, float, float, float], List[float]],
        known_metric_dim: Optional[float] = None
    ) -> float:
        """Estimates metric depth Z_cam from 2D bounding box and class metric priors."""
        if hasattr(detection, "bbox_2d"):
            bbox = detection.bbox_2d
            class_name = getattr(detection, "class_name", "OBSTACLE")
        else:
            bbox = detection
            class_name = "OBSTACLE"

        if len(bbox) < 4:
            raise ValueError(f"Bounding box must contain at least 4 coordinates, got {bbox}")

        try:
            x1, y1, x2, y2 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
        except (TypeError, ValueError) as e:
            raise ValueError(f"Non-numeric bounding box coordinates: {bbox}") from e

        if not (math.isfinite(x1) and math.isfinite(y1) and math.isfinite(x2) and math.isfinite(y2)):
            raise ValueError(f"Bounding box contains non-finite coordinates: {bbox}")

        # Normalize inverted coordinate representations
        if x1 > x2:
            x1, x2 = x2, x1
        if y1 > y2:
            y1, y2 = y2, y1

        w_pix = max(1.0, x2 - x1)
        h_pix = max(1.0, y2 - y1)

        prior = self.priors.get(class_name, self.priors.get("DEFAULT", MetricPrior(2.0, 2.0, 2.0)))
        w_metric = known_metric_dim if known_metric_dim is not None else prior.width
        h_metric = known_metric_dim if known_metric_dim is not None else prior.height

        # Single axis depth estimates
        z_w = (self.camera.fx * w_metric) / w_pix
        z_h = (self.camera.fy * h_metric) / h_pix

        # Area-geometric mean depth
        z_area = math.sqrt(((self.camera.fx * w_metric) * (self.camera.fy * h_metric)) / (w_pix * h_pix))

        if abs(prior.width - prior.height) < 1e-3:
            z_est = z_area
        else:
            alpha = w_pix / (w_pix + h_pix)
            z_est = alpha * z_w + (1.0 - alpha) * z_h

        return float(np.clip(z_est, 0.5, 300.0))

    def project_to_camera_frame(
        self,
        bbox_2d: Union[Any, List[float], Tuple[float, float, float, float]],
        depth: float
    ) -> np.ndarray:
        """Back-projects pixel center to camera optical coordinate [X_cam, Y_cam, Z_cam]."""
        bbox = bbox_2d.bbox_2d if hasattr(bbox_2d, "bbox_2d") else bbox_2d

        if len(bbox) < 4:
            raise ValueError(f"Bounding box must contain at least 4 coordinates, got {bbox}")

        try:
            x1, y1, x2, y2 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
            depth_f = float(depth)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Non-numeric values in bounding box or depth: {bbox}, depth={depth}") from e

        if not (math.isfinite(x1) and math.isfinite(y1) and math.isfinite(x2) and math.isfinite(y2)):
            raise ValueError(f"Bounding box contains non-finite coordinates: {bbox}")
        if not math.isfinite(depth_f) or depth_f <= 0.0:
            raise ValueError(f"Invalid non-finite or non-positive depth: {depth}")

        # Normalize inverted coordinates
        if x1 > x2:
            x1, x2 = x2, x1
        if y1 > y2:
            y1, y2 = y2, y1

        u_c = (x1 + x2) * 0.5
        v_c = (y1 + y2) * 0.5

        x_cam = (u_c - self.camera.cx) * depth_f / self.camera.fx
        y_cam = (v_c - self.camera.cy) * depth_f / self.camera.fy
        z_cam = depth_f

        return np.array([x_cam, y_cam, z_cam], dtype=float)

    def project_to_body_frame(self, point_cam: np.ndarray) -> np.ndarray:
        """Transforms point from camera optical frame to Drone Body Frame (FRU)."""
        return self.R_cam_body @ point_cam + self.cam_offset_body

    def project_to_world_frame(
        self,
        point_body: np.ndarray,
        drone_pos: np.ndarray,
        drone_yaw: float = 0.0
    ) -> np.ndarray:
        """Transforms point from Drone Body Frame to World/Local Reference Frame (ENU)."""
        cos_y = math.cos(drone_yaw)
        sin_y = math.sin(drone_yaw)
        r_rot = np.array([
            [cos_y, -sin_y, 0.0],
            [sin_y,  cos_y, 0.0],
            [0.0,    0.0,   1.0]
        ], dtype=float)
        return drone_pos + r_rot @ point_body

    def project_to_3d(
        self,
        detection: Any,
        depth_estimate: Optional[float] = None,
        drone_pos: Optional[np.ndarray] = None,
        drone_yaw: float = 0.0
    ) -> np.ndarray:
        """
        Unified projection interface: 2D detection -> 3D position vector.
        If drone_pos is None, returns body-frame coordinates.
        """
        depth = depth_estimate if depth_estimate is not None else self.estimate_depth(detection)
        point_cam = self.project_to_camera_frame(detection, depth)
        point_body = self.project_to_body_frame(point_cam)
        if drone_pos is not None:
            return self.project_to_world_frame(point_body, drone_pos, drone_yaw)
        return point_body

    def project_box_to_3d(
        self,
        bbox_2d: Union[Any, List[float], Tuple[float, float, float, float]],
        drone_pos: Optional[np.ndarray] = None,
        obstacle_diameter_meters: float = 4.0,
        drone_yaw: float = 0.0
    ) -> np.ndarray:
        """
        Convenience projection from bounding box directly to 3D position vector.
        Matches pipeline and benchmark usage.
        """
        bbox = bbox_2d.bbox_2d if hasattr(bbox_2d, "bbox_2d") else bbox_2d
        w_pix = max(1.0, float(bbox[2] - bbox[0]))
        depth = (self.camera.fx * obstacle_diameter_meters) / w_pix
        depth = float(np.clip(depth, 0.5, 300.0))

        point_cam = self.project_to_camera_frame(bbox, depth)
        point_body = self.project_to_body_frame(point_cam)

        if drone_pos is not None:
            return self.project_to_world_frame(point_body, drone_pos, drone_yaw)
        return point_body

    def compute_measurement_covariance(
        self,
        detection: DetectionResult,
        depth: float
    ) -> np.ndarray:
        """Computes 3x3 measurement covariance matrix R for Kalman filtering."""
        prior = self.priors.get(detection.class_name, self.priors["DEFAULT"])
        sigma_pix = 1.5
        w_metric = prior.width

        sigma_z = (depth**2 / (self.camera.fx * w_metric)) * sigma_pix
        sigma_z = max(0.1, sigma_z)

        point_cam = self.project_to_camera_frame(detection.bbox_2d, depth)
        sigma_x = (depth / self.camera.fx) * sigma_pix + (abs(point_cam[0]) / depth) * sigma_z
        sigma_y = (depth / self.camera.fy) * sigma_pix + (abs(point_cam[1]) / depth) * sigma_z

        # Body coordinates swap: X_body = Z_cam, Y_body = X_cam, Z_body = -Y_cam
        return np.diag([sigma_z**2, sigma_x**2, sigma_y**2])

    def project_batch(
        self,
        detections: List[DetectionResult],
        drone_pos: Optional[np.ndarray] = None,
        drone_yaw: float = 0.0
    ) -> np.ndarray:
        """Vectorized batch projection of multiple detections (sub-millisecond)."""
        if not detections:
            return np.empty((0, 3), dtype=float)

        n = len(detections)
        bboxes = np.empty((n, 4), dtype=np.float64)
        priors_w = np.empty(n, dtype=np.float64)
        priors_h = np.empty(n, dtype=np.float64)
        p_def = self.priors["DEFAULT"]
        p_map = getattr(self, "_prior_tuples", None)
        if p_map is None:
            p_map = {k: (v.width, v.height) for k, v in self.priors.items()}
            self._prior_tuples = p_map
        def_wh = (p_def.width, p_def.height)

        for i in range(n):
            d = detections[i]
            if hasattr(d, "bbox_2d"):
                bboxes[i] = d.bbox_2d
                w, h = p_map.get(getattr(d, "class_name", None), def_wh)
                priors_w[i] = w
                priors_h[i] = h
            else:
                bboxes[i] = d
                priors_w[i] = 4.0
                priors_h[i] = 4.0

        w_pix = np.maximum(1.0, bboxes[:, 2] - bboxes[:, 0])
        h_pix = np.maximum(1.0, bboxes[:, 3] - bboxes[:, 1])
        u_c = (bboxes[:, 0] + bboxes[:, 2]) * 0.5
        v_c = (bboxes[:, 1] + bboxes[:, 3]) * 0.5

        fx_pw = self.camera.fx * priors_w
        fy_ph = self.camera.fy * priors_h
        z_est = np.sqrt((fx_pw * fy_ph) / (w_pix * h_pix))
        np.clip(z_est, 0.5, 300.0, out=z_est)

        x_cam = (u_c - self.camera.cx) * z_est / self.camera.fx
        y_cam = (v_c - self.camera.cy) * z_est / self.camera.fy

        pts_body = np.empty((n, 3), dtype=float)
        pts_body[:, 0] = z_est + self.cam_offset_body[0]
        pts_body[:, 1] = x_cam + self.cam_offset_body[1]
        pts_body[:, 2] = -y_cam + self.cam_offset_body[2]

        if drone_pos is not None:
            if abs(drone_yaw) < 1e-5:
                return pts_body + drone_pos
            cos_y = math.cos(drone_yaw)
            sin_y = math.sin(drone_yaw)
            r_rot = np.array([
                [cos_y, -sin_y, 0.0],
                [sin_y,  cos_y, 0.0],
                [0.0,    0.0,   1.0]
            ], dtype=float)
            return (pts_body @ r_rot.T) + drone_pos

        return pts_body
