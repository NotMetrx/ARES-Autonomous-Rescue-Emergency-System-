# -*- coding: utf-8 -*-
"""
Evasión Reactiva 3D – CPA Analítico (Safety-Critical)
Numéricamente seguro: clamp t_cpa, eps, normalización estable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple, Union

import numpy as np
import torch


def _v(a: Union[np.ndarray, torch.Tensor]) -> np.ndarray:
    if isinstance(a, torch.Tensor):
        return a.detach().cpu().numpy().astype(np.float64)
    return np.asarray(a).astype(np.float64)


@dataclass
class DynamicObstacle:
    position: np.ndarray  # (3,)
    velocity: np.ndarray  # (3,)
    radius: float = 1.0
    class_name: str = "obstacle"
    threat_level: float = 0.5


class ReactiveEvasionEngine:
    def __init__(self, safety_radius: float = 15.0, threat_horizon_s: float = 5.0, k_rep: float = 1.0):
        self.safety_radius = float(max(1e-3, safety_radius))
        self.threat_horizon_s = float(max(1e-3, threat_horizon_s))
        self.k_rep = float(max(0.0, k_rep))
        self._eps = 1e-8

    def calculate_evasion_vector(
        self,
        drone_pos: Union[np.ndarray, torch.Tensor],
        drone_vel: Union[np.ndarray, torch.Tensor],
        obstacle: DynamicObstacle,
    ) -> Tuple[np.ndarray, float]:
        p_d = _v(drone_pos).reshape(3)
        v_d = _v(drone_vel).reshape(3)
        p_o = _v(obstacle.position).reshape(3)
        v_o = _v(obstacle.velocity).reshape(3)
        r0 = p_o - p_d
        vr = v_o - v_d
        vr2 = float(np.dot(vr, vr))
        if vr2 < self._eps:
            t_cpa = 0.0
        else:
            t_cpa = -float(np.dot(r0, vr)) / vr2
        if not np.isfinite(t_cpa):
            t_cpa = 0.0
        t_cpa_clamped = float(np.clip(t_cpa, 0.0, self.threat_horizon_s))
        p_cpa_d = p_d + v_d * t_cpa_clamped
        p_cpa_o = p_o + v_o * t_cpa_clamped
        d_cpa_vec = p_cpa_o - p_cpa_d
        d_cpa = float(np.linalg.norm(d_cpa_vec))
        if not np.isfinite(d_cpa) or d_cpa < self._eps:
            d_cpa_eff = self._eps
        else:
            d_cpa_eff = d_cpa
        d_cpa_eff = max(self._eps, d_cpa_eff)
        threat = 0.0
        if d_cpa_eff < self.safety_radius:
            threat = float(np.exp(-d_cpa_eff / (self.safety_radius + self._eps)))
        threat = float(np.clip(threat, 0.0, 1.0))
        if d_cpa < self._eps:
            n = r0
        else:
            n = d_cpa_vec
        n_norm = float(np.linalg.norm(n))
        if n_norm < self._eps:
            unit_n = np.array([1.0, 0.0, 0.0], dtype=np.float64)
        else:
            unit_n = n / n_norm
        ev_mag = self.k_rep * threat * (self.safety_radius / (d_cpa_eff + self._eps))
        ev_mag = float(min(ev_mag, self.safety_radius * 2.0))
        ev_vec = -unit_n * ev_mag
        if not np.all(np.isfinite(ev_vec)):
            ev_vec = np.zeros(3, dtype=np.float64)
        return ev_vec.astype(np.float32), float(max(0.0, d_cpa_eff))
