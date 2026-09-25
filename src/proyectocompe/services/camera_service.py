"""
ARES Onboard FPV Camera & Gimbal Video Streaming Engine.
Provides real-time MJPEG live streaming for each UAV with tactical OSD,
D-FINE (RT-DETR) bounding box overlays, and dual-mode RGB / Thermal FLIR Ironbow vision.
"""
import io
import time
import math
import logging
from typing import Dict, Optional, Tuple, List
from PIL import Image, ImageDraw, ImageFont
from proyectocompe.services.swarm_simulator import swarm_simulator

logger = logging.getLogger("ares.camera")

class DroneCameraState:
    def __init__(self, drone_id: str):
        self.drone_id = drone_id
        self.mode = "RGB" # "RGB" or "THERMAL_FLIR"
        self.gimbal_pitch_deg = -45.0  # -90.0 (Nadir) to +15.0 (Horizon)
        self.gimbal_yaw_deg = 0.0     # -180.0 to +180.0
        self.zoom = 1.0               # 1.0x to 4.0x
        self.last_external_frame: Optional[bytes] = None
        self.last_external_frame_time: float = 0.0
        self.external_frame_count: int = 0
        self.last_external_fps: float = 0.0
        self._fps_window_time: float = 0.0
        self._fps_window_frames: int = 0

class CameraService:
    def __init__(self):
        self.cameras: Dict[str, DroneCameraState] = {
            "ARES-01": DroneCameraState("ARES-01"),
            "ARES-02": DroneCameraState("ARES-02"),
            "ARES-03": DroneCameraState("ARES-03"),
        }
        self.frame_width = 640
        self.frame_height = 360

    def get_or_create_camera(self, drone_id: str) -> DroneCameraState:
        if drone_id not in self.cameras:
            self.cameras[drone_id] = DroneCameraState(drone_id)
        return self.cameras[drone_id]

    def set_camera_mode(self, drone_id: str, mode: str):
        cam = self.get_or_create_camera(drone_id)
        cam.mode = "THERMAL_FLIR" if "THERM" in mode.upper() or "FLIR" in mode.upper() else "RGB"
        return {"drone_id": drone_id, "mode": cam.mode}

    def set_gimbal(self, drone_id: str, pitch_deg: float, yaw_deg: float, zoom: float = 1.0) -> Dict:
        """Sets PTZ gimbal orientation and digital zoom level."""
        cam = self.get_or_create_camera(drone_id)
        cam.gimbal_pitch_deg = max(-90.0, min(15.0, float(pitch_deg)))
        # Normalize yaw between -180 and +180
        y = float(yaw_deg) % 360.0
        if y > 180.0:
            y -= 360.0
        cam.gimbal_yaw_deg = y
        cam.zoom = max(1.0, min(4.0, float(zoom)))
        return {
            "drone_id": drone_id,
            "pitch_deg": round(cam.gimbal_pitch_deg, 1),
            "yaw_deg": round(cam.gimbal_yaw_deg, 1),
            "zoom": round(cam.zoom, 1)
        }

    def get_gimbal(self, drone_id: str) -> Dict:
        """Gets current PTZ gimbal state."""
        cam = self.get_or_create_camera(drone_id)
        return {
            "drone_id": drone_id,
            "pitch_deg": round(cam.gimbal_pitch_deg, 1),
            "yaw_deg": round(cam.gimbal_yaw_deg, 1),
            "zoom": round(cam.zoom, 1)
        }

    def apply_preset(self, drone_id: str, preset: str) -> Dict:
        """Applies tactical gimbal presets."""
        p = preset.lower()
        if p == "nadir":
            return self.set_gimbal(drone_id, pitch_deg=-90.0, yaw_deg=0.0, zoom=1.0)
        elif p == "patrol":
            return self.set_gimbal(drone_id, pitch_deg=-45.0, yaw_deg=0.0, zoom=1.0)
        elif p == "horizon":
            return self.set_gimbal(drone_id, pitch_deg=0.0, yaw_deg=0.0, zoom=1.0)
        elif p == "zoom2x":
            cam = self.get_or_create_camera(drone_id)
            return self.set_gimbal(drone_id, pitch_deg=cam.gimbal_pitch_deg, yaw_deg=cam.gimbal_yaw_deg, zoom=2.0)
        elif p == "zoom4x":
            cam = self.get_or_create_camera(drone_id)
            return self.set_gimbal(drone_id, pitch_deg=cam.gimbal_pitch_deg, yaw_deg=cam.gimbal_yaw_deg, zoom=4.0)
        elif p == "center":
            cam = self.get_or_create_camera(drone_id)
            return self.set_gimbal(drone_id, pitch_deg=cam.gimbal_pitch_deg, yaw_deg=0.0, zoom=1.0)
        else:
            return self.set_gimbal(drone_id, pitch_deg=-45.0, yaw_deg=0.0, zoom=1.0)

    def ingest_external_frame(self, drone_id: str, frame_bytes: bytes):
        """Allows Edge AI companion (Jetson / RPi) to push live camera frames."""
        cam = self.get_or_create_camera(drone_id)
        cam.last_external_frame = frame_bytes
        now = time.time()
        cam.last_external_frame_time = now
        cam.external_frame_count += 1
        cam._fps_window_frames += 1
        if now - cam._fps_window_time >= 1.0:
            cam.last_external_fps = round(cam._fps_window_frames / max(0.001, now - cam._fps_window_time), 1)
            cam._fps_window_frames = 0
            cam._fps_window_time = now

    def get_camera_status(self, drone_id: str) -> Dict:
        """Returns comprehensive diagnostic telemetry for camera and AI companion feed."""
        cam = self.get_or_create_camera(drone_id)
        now = time.time()
        is_external = bool(cam.last_external_frame and (now - cam.last_external_frame_time < 3.0))
        sec_since_ext = round(now - cam.last_external_frame_time, 1) if cam.last_external_frame_time > 0 else None
        return {
            "drone_id": drone_id,
            "mode": cam.mode,
            "gimbal": {
                "pitch_deg": round(cam.gimbal_pitch_deg, 1),
                "yaw_deg": round(cam.gimbal_yaw_deg, 1),
                "zoom": round(cam.zoom, 1),
            },
            "source": "EXTERNAL_JETSON_ORIN" if is_external else "PROCEDURAL_SYNTHESIS",
            "is_external_active": is_external,
            "external_fps": cam.last_external_fps if is_external else 0.0,
            "seconds_since_external_frame": sec_since_ext,
            "total_external_frames": cam.external_frame_count
        }

    def render_tactical_frame(self, drone_id: str) -> bytes:
        """
        Renders a 640x360 tactical camera frame.
        If an external video frame was recently pushed by the AI team, uses it.
        Otherwise, procedurally synthesizes the drone's gimbal view with dynamic PTZ,
        D-FINE overlays, horizon, and dual-mode RGB / Thermal FLIR Ironbow vision.
        """
        cam = self.get_or_create_camera(drone_id)
        now = time.time()

        # Check if recent external frame exists (< 3.0s)
        if cam.last_external_frame and (now - cam.last_external_frame_time < 3.0):
            return cam.last_external_frame

        # Procedural Synthetic Gimbal Feed
        agent = swarm_simulator.agents.get(drone_id, {
            "lat": -12.046374, "lon": -77.042793, "alt": 28.5,
            "speed": 6.5, "battery": 92.0, "heading": 85.0
        })

        is_thermal = (cam.mode == "THERMAL_FLIR")
        w, h = self.frame_width, self.frame_height
        cx, cy = w // 2, h // 2

        # PTZ Offsets
        pitch_dy = int((cam.gimbal_pitch_deg - (-45.0)) * 2.8)
        yaw_dx = int(cam.gimbal_yaw_deg * 2.5)

        # 1. Base Image Canvas
        if not is_thermal:
            img = Image.new("RGB", (w, h), color=(34, 48, 38))
            draw = ImageDraw.Draw(img)

            # Sky & Horizon (Visible when looking up / forward, pitch > -30°)
            horizon_y = cy + int((cam.gimbal_pitch_deg) * 2.5)
            if horizon_y > 0:
                draw.rectangle([0, 0, w, min(h, horizon_y)], fill=(125, 155, 185)) # Sky
                draw.line([(0, horizon_y), (w, horizon_y)], fill=(190, 210, 230), width=2) # Horizon

            # Road asphalt strip
            ry1, ry2, ry3, ry4 = 240 + pitch_dy, 200 + pitch_dy, 270 + pitch_dy, 310 + pitch_dy
            draw.polygon([(0 - yaw_dx, ry1), (w - yaw_dx, ry2), (w - yaw_dx, ry3), (0 - yaw_dx, ry4)], fill=(45, 52, 54))
            draw.line([(0 - yaw_dx, 275 + pitch_dy), (w - yaw_dx, 235 + pitch_dy)], fill=(220, 220, 160), width=2)

            # Structural ruins / building footprints
            draw.rectangle([60 - yaw_dx, 40 + pitch_dy, 190 - yaw_dx, 130 + pitch_dy], fill=(62, 70, 78), outline=(85, 95, 105), width=2)
            draw.rectangle([420 - yaw_dx, 160 + pitch_dy, 560 - yaw_dx, 260 + pitch_dy], fill=(58, 65, 72), outline=(78, 88, 98), width=2)
        else:
            # Thermal FLIR Ironbow Palette
            img = Image.new("RGB", (w, h), color=(14, 12, 36))
            draw = ImageDraw.Draw(img)

            # Cold Sky
            horizon_y = cy + int((cam.gimbal_pitch_deg) * 2.5)
            if horizon_y > 0:
                draw.rectangle([0, 0, w, min(h, horizon_y)], fill=(6, 5, 18))
                draw.line([(0, horizon_y), (w, horizon_y)], fill=(40, 30, 80), width=1)

            # Cool asphalt
            ry1, ry2, ry3, ry4 = 240 + pitch_dy, 200 + pitch_dy, 270 + pitch_dy, 310 + pitch_dy
            draw.polygon([(0 - yaw_dx, ry1), (w - yaw_dx, ry2), (w - yaw_dx, ry3), (0 - yaw_dx, ry4)], fill=(24, 20, 54))
            # Structures
            draw.rectangle([60 - yaw_dx, 40 + pitch_dy, 190 - yaw_dx, 130 + pitch_dy], fill=(30, 26, 68), outline=(45, 40, 95), width=1)
            draw.rectangle([420 - yaw_dx, 160 + pitch_dy, 560 - yaw_dx, 260 + pitch_dy], fill=(28, 24, 62), outline=(42, 38, 90), width=1)

        # 2. Simulated Survivors & Hazards in FOV (Shifted by PTZ)
        # D-FINE Target 1: Survivor
        bx1, by1 = 270 - yaw_dx, 140 + pitch_dy
        bx2, by2 = 360 - yaw_dx, 230 + pitch_dy

        # Only render if within or near frame bounds
        if -50 <= bx1 <= w + 50 and -50 <= by1 <= h + 50:
            if not is_thermal:
                # Person in orange SAR vest
                hx1, hy1 = bx1 + 35, by1 + 15
                draw.ellipse([hx1, hy1, hx1 + 20, hy1 + 20], fill=(240, 200, 160)) # Head
                draw.rectangle([bx1 + 30, by1 + 35, bx1 + 60, by1 + 75], fill=(245, 130, 32)) # Vest
                draw.line([(bx1 + 40, by1 + 75), (bx1 + 35, by1 + 95)], fill=(40, 40, 80), width=4) # Leg
                draw.line([(bx1 + 50, by1 + 75), (bx1 + 55, by1 + 95)], fill=(40, 40, 80), width=4)
            else:
                # Radiant Heat Signature (White-Hot 37°C)
                draw.ellipse([bx1 + 30, by1 + 10, bx1 + 60, by1 + 85], fill=(255, 255, 220))
                draw.ellipse([bx1 + 20, by1, bx1 + 70, by1 + 95], outline=(255, 140, 20), width=3)

            # D-FINE Bounding Box Overlays
            box_col = (16, 185, 129) if not is_thermal else (0, 255, 200)
            draw.rectangle([bx1, by1, bx2, by2], outline=box_col, width=2)
            c_len = 10
            for cx_c, cy_c in [(bx1, by1), (bx2, by1), (bx1, by2), (bx2, by2)]:
                dx = c_len if cx_c == bx1 else -c_len
                dy = c_len if cy_c == by1 else -c_len
                draw.line([(cx_c, cy_c), (cx_c + dx, cy_c)], fill=(255, 255, 255), width=3)
                draw.line([(cx_c, cy_c), (cx_c, cy_c + dy)], fill=(255, 255, 255), width=3)

            label_text = "D-FINE: SOBREVIVIENTE (96.4%)"
            draw.rectangle([bx1, by1 - 18, bx1 + 200, by1], fill=(6, 78, 59))
            draw.text((bx1 + 4, by1 - 16), label_text, fill=(255, 255, 255))
            draw.text((bx1 + 4, by2 + 4), "LRF: 28.5m | GEO CONFIRMADO", fill=box_col)

        # D-FINE Target 2: Secondary Fire Hazard (if drone ARES-02)
        if drone_id == "ARES-02":
            fx1, fy1 = 480 - yaw_dx, 70 + pitch_dy
            fx2, fy2 = 550 - yaw_dx, 140 + pitch_dy
            if -50 <= fx1 <= w + 50 and -50 <= fy1 <= h + 50:
                if not is_thermal:
                    draw.polygon([(fx1 + 35, fy1 + 5), (fx1 + 10, fy1 + 55), (fx1 + 60, fy1 + 55)], fill=(235, 75, 20))
                    draw.polygon([(fx1 + 35, fy1 + 18), (fx1 + 20, fy1 + 55), (fx1 + 50, fy1 + 55)], fill=(255, 200, 30))
                else:
                    draw.ellipse([fx1 + 5, fy1 + 5, fx2 - 5, fy2 - 5], fill=(255, 255, 255))
                    draw.ellipse([fx1 - 5, fy1 - 5, fx2 + 5, fy2 + 5], outline=(255, 50, 10), width=4)

                f_col = (239, 68, 68)
                draw.rectangle([fx1, fy1, fx2, fy2], outline=f_col, width=2)
                draw.rectangle([fx1, fy1 - 18, fx1 + 195, fy1], fill=(127, 29, 29))
                draw.text((fx1 + 4, fy1 - 16), "D-FINE: FUEGO/INCENDIO (98.1%)", fill=(255, 255, 255))

        # Digital Zoom Crop and Rescale (if zoom > 1.0)
        if cam.zoom > 1.01:
            crop_w = int(w / cam.zoom)
            crop_h = int(h / cam.zoom)
            cl = (w - crop_w) // 2
            ct = (h - crop_h) // 2
            img = img.crop((cl, ct, cl + crop_w, ct + crop_h)).resize((w, h), Image.Resampling.BILINEAR)
            draw = ImageDraw.Draw(img)

        # 3. Tactical OSD (On-Screen Display)
        osd_col = (0, 240, 255) if not is_thermal else (255, 220, 50)

        # Center reticle
        draw.line([(cx - 15, cy), (cx - 5, cy)], fill=osd_col, width=2)
        draw.line([(cx + 5, cy), (cx + 15, cy)], fill=osd_col, width=2)
        draw.line([(cx, cy - 15), (cx, cy - 5)], fill=osd_col, width=2)
        draw.line([(cx, cy + 5), (cx, cy + 15)], fill=osd_col, width=2)
        draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=osd_col)

        # Pitch Ladder Bar (on left)
        draw.line([(40, cy - 60), (40, cy + 60)], fill=(osd_col[0], osd_col[1], osd_col[2]), width=1)
        draw.line([(35, cy), (45, cy)], fill=osd_col, width=2) # 0 pitch reference
        draw.text((48, cy - 6), f"{cam.gimbal_pitch_deg:+.0f}°", fill=osd_col)

        # Top OSD Status Bar
        draw.rectangle([0, 0, w, 24], fill=(0, 0, 0, 170))
        alt_val = agent.get("alt", 28.5)
        spd_val = agent.get("speed", 6.5)
        bat_val = agent.get("battery", 92.0)
        hdg_val = agent.get("heading", 85.0)
        gimbal_abs_azimuth = (hdg_val + cam.gimbal_yaw_deg) % 360.0

        top_info = f"UAV: {drone_id} | ALT: {alt_val:.1f}m | VEL: {spd_val:.1f}m/s | BAT: {bat_val:.0f}% | AZIMUTH: {gimbal_abs_azimuth:.0f}°"
        draw.text((12, 6), top_info, fill=(240, 240, 240))

        mode_badge = "FLIR IR-640 (WHITE HOT)" if is_thermal else "OPTICAL 4K RGB"
        draw.text((w - 180, 6), mode_badge, fill=(255, 200, 50) if is_thermal else (56, 189, 248))

        # Bottom OSD Diagnostics & PTZ Bar
        draw.rectangle([0, h - 24, w, h], fill=(0, 0, 0, 170))
        bot_info = f"IA: D-FINE-S (RT-DETR) | NPU: 11.4ms | GIMBAL: P:{cam.gimbal_pitch_deg:+.0f}° Y:{cam.gimbal_yaw_deg:+.0f}° Z:{cam.zoom:.1f}x"
        draw.text((12, h - 18), bot_info, fill=(16, 185, 129))
        draw.text((w - 120, h - 18), "REC: LIVE 20Hz", fill=(239, 68, 68))

        # Save to JPEG buffer
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()

    def capture_snapshot(self, drone_id: str) -> Tuple[str, bytes]:
        """Captures a snapshot photo and saves to data/snapshots/ for official dossier."""
        import os
        frame_bytes = self.render_tactical_frame(drone_id)
        snap_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "snapshots")
        os.makedirs(snap_dir, exist_ok=True)
        filename = f"FPV_SNAP_{drone_id}_{int(time.time())}.jpg"
        filepath = os.path.join(snap_dir, filename)
        with open(filepath, "wb") as f:
            f.write(frame_bytes)
        return filepath, frame_bytes

    def list_snapshots(self) -> List[Dict]:
        """Lists all archived forensic FPV snapshots in data/snapshots."""
        import os
        snap_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "snapshots")
        if not os.path.exists(snap_dir):
            return []
        items = []
        for fname in sorted(os.listdir(snap_dir), reverse=True):
            if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                fpath = os.path.join(snap_dir, fname)
                stat = os.stat(fpath)
                drone_id = "ARES-01"
                for d in ["ARES-01", "ARES-02", "ARES-03"]:
                    if d in fname:
                        drone_id = d
                        break
                items.append({
                    "filename": fname,
                    "filepath": fpath,
                    "size_bytes": stat.st_size,
                    "timestamp": stat.st_mtime,
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                    "drone_id": drone_id,
                    "url": f"/api/v1/camera/snapshots/{fname}"
                })
        return items

    def get_snapshot_bytes(self, filename: str) -> Optional[bytes]:
        """Retrieves raw bytes for an archived snapshot."""
        import os
        # Sanitize filename
        clean_name = os.path.basename(filename)
        snap_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "snapshots")
        fpath = os.path.join(snap_dir, clean_name)
        if os.path.exists(fpath):
            with open(fpath, "rb") as f:
                return f.read()
        return None

camera_service = CameraService()
