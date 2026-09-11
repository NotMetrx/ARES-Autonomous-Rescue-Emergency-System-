"""
src/ai/kalman.py - 6-State 3D Kinematic Kalman Filter & Multi-Obstacle Tracking for ARES.
Estimates obstacle 3D position [x, y, z] and velocity [vx, vy, vz] under observation noise.
Pure NumPy continuous-discrete implementation using DWNA and Joseph form update.
"""
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict, Any, Union
import time
import numpy as np
try:
    from scipy.optimize import linear_sum_assignment
    SCIPY_AVAILABLE = True
except ImportError:
    linear_sum_assignment = None
    SCIPY_AVAILABLE = False
from src.ai.evasion import DynamicObstacle

@dataclass
class TrackedObstacleState:
    """Kinematic 3D state of an obstacle filtered by Kalman."""
    track_id: int
    position: np.ndarray        # [x, y, z] in drone local/world frame (meters)
    velocity: np.ndarray        # [vx, vy, vz] in m/s
    radius_meters: float        # Collision bounding sphere radius
    time_since_update: float    # Elapsed time since last valid observation (seconds)
    total_hits: int             # Total detection hit count
    covariance: np.ndarray      # 6x6 state estimation covariance matrix

class KalmanFilter3D:
    """
    Continuous-discrete 6-state Kalman Filter for 3D kinematic tracking.
    State vector: x = [x, y, z, vx, vy, vz]^T.
    Process model: Discrete White Noise Acceleration (DWNA).
    Measurement model: Direct 3D position observation via pinhole back-projection.
    """
    def __init__(
        self,
        initial_position: Optional[np.ndarray] = None,
        initial_velocity: Optional[np.ndarray] = None,
        dt_default: float = 0.05,
        q_acc: float = 2.0,
        r_pos_std: float = 0.5,
        r_depth_std: float = 1.0,
        initial_pos: Optional[np.ndarray] = None,
        dt: Optional[float] = None
    ):
        # Support initial_pos keyword for API flexibility
        pos = initial_position if initial_position is not None else initial_pos
        if pos is None:
            pos = np.zeros(3, dtype=float)

        self.dt_default = dt if dt is not None else dt_default
        self.q_acc = q_acc
        self.r_pos_std = r_pos_std
        self.r_depth_std = r_depth_std

        # State vector x in R^6: [x, y, z, vx, vy, vz]^T
        self.x = np.zeros(6, dtype=float)
        self.x[0:3] = np.asarray(pos, dtype=float)
        if initial_velocity is not None:
            self.x[3:6] = np.asarray(initial_velocity, dtype=float)

        # Initial state covariance P in R^(6x6)
        self.P = np.diag([
            r_pos_std**2, r_pos_std**2, r_depth_std**2,
            25.0, 25.0, 25.0  # Initial velocity uncertainty (std = 5.0 m/s)
        ]).astype(float)

        # Measurement matrix H in R^(3x6)
        self.H = np.zeros((3, 6), dtype=float)
        self.H[0:3, 0:3] = np.eye(3, dtype=float)

        # Default measurement noise covariance R in R^(3x3)
        self.R_default = np.diag([r_pos_std**2, r_pos_std**2, r_depth_std**2]).astype(float)
        self._I6 = np.eye(6, dtype=float)
        self._cached_dt = None
        self._cached_F = None
        self._cached_Q = None

    def predict(self, dt: Optional[float] = None) -> np.ndarray:
        """
        A priori state and covariance propagation using DWNA model.
        """
        dt_step = max(1e-4, float(dt if dt is not None else self.dt_default))

        if self._cached_dt != dt_step:
            self._cached_dt = dt_step
            # State transition matrix F(dt)
            F = np.eye(6, dtype=float)
            F[0:3, 3:6] = np.eye(3, dtype=float) * dt_step

            # Process noise covariance Q(dt) via DWNA integral
            dt2 = dt_step * dt_step
            dt3 = dt2 * dt_step
            Q = np.zeros((6, 6), dtype=float)
            Q[0:3, 0:3] = (dt3 / 3.0) * self.q_acc * np.eye(3, dtype=float)
            Q[0:3, 3:6] = (dt2 / 2.0) * self.q_acc * np.eye(3, dtype=float)
            Q[3:6, 0:3] = (dt2 / 2.0) * self.q_acc * np.eye(3, dtype=float)
            Q[3:6, 3:6] = dt_step * self.q_acc * np.eye(3, dtype=float)
            self._cached_F = F
            self._cached_Q = Q
        else:
            F = self._cached_F
            Q = self._cached_Q

        # State and covariance propagation
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q
        self.P = 0.5 * (self.P + self.P.T)
        return self.x

    def update(
        self,
        measurement: np.ndarray,
        R: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        A posteriori state and covariance correction via Joseph form update.
        """
        z = np.asarray(measurement, dtype=float)
        R_mat = R if R is not None else self.R_default

        # Innovation: y = z - H @ x = z - x[0:3]
        y = z - self.x[0:3]

        # Innovation covariance: S = H @ P @ H.T + R = P[0:3, 0:3] + R
        S = self.P[0:3, 0:3] + R_mat

        # Kalman gain: K = P[:, 0:3] @ inv(S)
        # Using np.linalg.solve for numerical stability
        try:
            K = np.linalg.solve(S.T, self.P[:, 0:3].T).T
        except np.linalg.LinAlgError:
            K = self.P[:, 0:3] @ np.linalg.pinv(S)

        # State update
        self.x = self.x + K @ y

        # Joseph form covariance update (guarantees positive semi-definiteness)
        I_KH = self._I6 - K @ self.H
        self.P = I_KH @ self.P @ I_KH.T + K @ R_mat @ K.T
        self.P = 0.5 * (self.P + self.P.T)

        return self.x[0:3].copy(), self.x[3:6].copy()

    def predict_and_update(
        self,
        measurement: np.ndarray,
        dt: float = 0.05,
        R: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Convenience predict-and-update cycle matching PROJECT.md interface contract.
        Returns: (estimated_position, estimated_velocity)
        """
        self.predict(dt)
        return self.update(measurement, R=R)

    def get_state(self) -> Tuple[np.ndarray, np.ndarray]:
        """Returns current (position, velocity) estimate."""
        return self.x[0:3].copy(), self.x[3:6].copy()

    @property
    def position(self) -> np.ndarray:
        return self.x[0:3].copy()

    @property
    def velocity(self) -> np.ndarray:
        return self.x[3:6].copy()

# SingleObstacleKalmanFilter alias for compatibility
SingleObstacleKalmanFilter = KalmanFilter3D

class TrackedObstacle:
    """Manages individual obstacle track lifecycle, hits/misses, and kinematic filter."""
    def __init__(
        self,
        track_id: int,
        initial_pos: np.ndarray,
        initial_velocity: Optional[np.ndarray] = None,
        class_name: str = "OBSTACLE",
        radius: float = 4.0,
        dt_default: float = 0.05
    ):
        self.track_id = track_id
        self.kf = KalmanFilter3D(initial_position=initial_pos, initial_velocity=initial_velocity, dt_default=dt_default)
        self.class_name = class_name
        self.radius_meters = radius
        self.state = "TENTATIVE"  # "TENTATIVE", "CONFIRMED", "COASTED", "DELETED"
        self.hit_count = 1
        self.miss_count = 0
        self.prev_pos = np.asarray(initial_pos, dtype=float).copy()
        self.last_update_time = time.perf_counter()

    def to_dynamic_obstacle(self) -> DynamicObstacle:
        """Converts tracked state to DynamicObstacle instance for ReactiveEvasionEngine."""
        return DynamicObstacle(
            position=self.kf.position,
            velocity=self.kf.velocity,
            radius_meters=self.radius_meters
        )

    def to_state(self) -> TrackedObstacleState:
        """Exports tracked state snapshot."""
        return TrackedObstacleState(
            track_id=self.track_id,
            position=self.kf.position,
            velocity=self.kf.velocity,
            radius_meters=self.radius_meters,
            time_since_update=max(0.0, time.perf_counter() - self.last_update_time),
            total_hits=self.hit_count,
            covariance=self.kf.P.copy()
        )

class MultiObstacleTracker3D:
    """
    Multi-target tracker performing 3D spatial gating, greedy bipartite association,
    Kalman state filtering, coasting across dropouts, and track lifecycle management.
    """
    def __init__(
        self,
        gating_threshold_meters: float = 15.0,
        min_hits_to_confirm: int = 2,
        max_misses_to_delete: int = 5
    ):
        self.tracks: Dict[int, TrackedObstacle] = {}
        self.next_track_id = 1
        self.gating_threshold = gating_threshold_meters
        self.min_hits = min_hits_to_confirm
        self.max_misses = max_misses_to_delete

    def step(
        self,
        measurements: List[np.ndarray],
        dt: float = 0.05,
        class_names: Optional[List[str]] = None,
        radii: Optional[List[float]] = None
    ) -> List[DynamicObstacle]:
        """
        Advances tracker by dt, associates measurements, and returns confirmed DynamicObstacles.
        """
        self._update_tracks(measurements, dt=dt, class_names=class_names, radii=radii)
        return [
            track.to_dynamic_obstacle()
            for track in self.tracks.values()
            if track.state in ("CONFIRMED", "COASTED")
        ]

    def update(
        self,
        measurements: Union[List[np.ndarray], List[Tuple[np.ndarray, float]]],
        dt: float = 0.05
    ) -> List[TrackedObstacleState]:
        """
        Alternative update interface returning List[TrackedObstacleState].
        Accepts either list of positions or list of (position, radius) tuples.
        """
        pos_list = []
        radii_list = []
        for item in measurements:
            if isinstance(item, tuple) and len(item) == 2:
                pos_list.append(item[0])
                radii_list.append(float(item[1]))
            else:
                pos_list.append(item)
                radii_list.append(4.0)

        self._update_tracks(pos_list, dt=dt, radii=radii_list)
        return [
            track.to_state()
            for track in self.tracks.values()
            if track.state in ("CONFIRMED", "COASTED")
        ]

    def _update_tracks(
        self,
        measurements: List[np.ndarray],
        dt: float = 0.05,
        class_names: Optional[List[str]] = None,
        radii: Optional[List[float]] = None
    ) -> None:
        meas_positions = [np.asarray(m, dtype=float) for m in measurements]
        num_meas = len(meas_positions)
        track_ids = list(self.tracks.keys())
        num_tracks = len(track_ids)

        # 1. Predict all active tracks
        for t_id in track_ids:
            self.tracks[t_id].kf.predict(dt=dt)

        if num_tracks == 0:
            # All measurements are new tracks
            for j in range(num_meas):
                c_name = class_names[j] if class_names and j < len(class_names) else "OBSTACLE"
                r = radii[j] if radii and j < len(radii) else 4.0
                new_track = TrackedObstacle(
                    track_id=self.next_track_id,
                    initial_pos=meas_positions[j],
                    class_name=c_name,
                    radius=r,
                    dt_default=dt
                )
                if new_track.hit_count >= self.min_hits:
                    new_track.state = "CONFIRMED"
                self.tracks[self.next_track_id] = new_track
                self.next_track_id += 1
            return

        if num_meas == 0:
            # Coast all existing tracks
            to_delete = []
            for t_id, track in self.tracks.items():
                track.miss_count += 1
                track.state = "COASTED"
                if track.miss_count >= self.max_misses:
                    track.state = "DELETED"
                    to_delete.append(t_id)
            for t_id in to_delete:
                del self.tracks[t_id]
            return

        # 2. Compute cost matrix using squared Euclidean distances
        pred_positions = np.array([self.tracks[t_id].kf.position for t_id in track_ids], dtype=float)
        meas_arr = np.array(meas_positions, dtype=float)
        diff = pred_positions[:, None, :] - meas_arr[None, :, :]
        dist_sq = np.sum(diff ** 2, axis=-1)
        thresh_sq = self.gating_threshold ** 2

        # 3. Bipartite matching via SciPy linear_sum_assignment or greedy fallback
        matches = []
        if SCIPY_AVAILABLE and dist_sq.size > 0:
            cost_mat = np.where(dist_sq <= thresh_sq, dist_sq, 1e6)
            row_ind, col_ind = linear_sum_assignment(cost_mat)
            for r, c in zip(row_ind, col_ind):
                if dist_sq[r, c] <= thresh_sq:
                    matches.append((int(r), int(c)))
        else:
            rows, cols = np.where(dist_sq <= thresh_sq)
            if len(rows) > 0:
                valid_d = dist_sq[rows, cols]
                sort_order = np.argsort(valid_d)
                matched_rows = set()
                matched_cols = set()
                for k in sort_order:
                    r = rows[k]
                    c = cols[k]
                    if r not in matched_rows and c not in matched_cols:
                        matches.append((r, c))
                        matched_rows.add(r)
                        matched_cols.add(c)
                        if len(matched_rows) == num_tracks or len(matched_cols) == num_meas:
                            break

        matched_tracks = set()
        matched_meas = set()
        t_now = time.perf_counter()

        # 4. Update matched tracks
        for i, j in matches:
            matched_tracks.add(i)
            matched_meas.add(j)
            t_id = track_ids[i]
            track = self.tracks[t_id]
            meas_pos = meas_positions[j]
            if track.hit_count == 1:
                track.kf.x[3:6] = (meas_pos - track.prev_pos) / max(1e-4, dt)
                track.kf.x[0:3] = meas_pos
            else:
                track.kf.update(meas_pos)
            track.prev_pos = meas_pos.copy()
            track.hit_count += 1
            track.miss_count = 0
            track.last_update_time = t_now
            if track.hit_count >= self.min_hits:
                track.state = "CONFIRMED"

        # 5. Coast unmatched tracks
        to_delete = []
        for i, t_id in enumerate(track_ids):
            if i not in matched_tracks:
                track = self.tracks[t_id]
                track.miss_count += 1
                track.state = "COASTED"
                if track.miss_count >= self.max_misses:
                    track.state = "DELETED"
                    to_delete.append(t_id)

        for t_id in to_delete:
            del self.tracks[t_id]

        # 6. Spawn new tentative tracks for unmatched measurements
        for j in range(num_meas):
            if j not in matched_meas:
                c_name = class_names[j] if class_names and j < len(class_names) else "OBSTACLE"
                r = radii[j] if radii and j < len(radii) else 4.0
                new_track = TrackedObstacle(
                    track_id=self.next_track_id,
                    initial_pos=meas_positions[j],
                    class_name=c_name,
                    radius=r,
                    dt_default=dt
                )
                if new_track.hit_count >= self.min_hits:
                    new_track.state = "CONFIRMED"
                self.tracks[self.next_track_id] = new_track
                self.next_track_id += 1

# KalmanObstacleTracker alias for compatibility
KalmanObstacleTracker = MultiObstacleTracker3D
