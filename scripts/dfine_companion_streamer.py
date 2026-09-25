#!/usr/bin/env python3
"""
================================================================================
ARES - D-FINE (RT-DETR) Companion Computer Video & Telemetry Streamer
================================================================================
Simulates an onboard NVIDIA Jetson Orin Nano / Raspberry Pi 5 companion computer
executing the D-FINE real-time bounding box regression model.

Streams live JPEG video frames to: POST /api/v1/camera/{drone_id}/feed
Pushes D-FINE AI target detections to: POST /api/v1/detections/ingest
Sends Edge AI telemetry heartbeats to: POST /api/v1/ai-engine/heartbeat

Usage:
  uv run python scripts/dfine_companion_streamer.py --drone ARES-01 --fps 25 --mode rgb
  uv run python scripts/dfine_companion_streamer.py --drone ARES-02 --fps 30 --mode thermal --target hazard
  uv run python scripts/dfine_companion_streamer.py --help
"""
import sys
import os
import time
import math
import io
import json
import random
import argparse
import urllib.request
from PIL import Image, ImageDraw, ImageFont

def render_edge_frame(frame_idx: int, drone_id: str, mode: str, target_type: str) -> bytes:
    """
    Renders a 640x360 frame simulating D-FINE inference on NVIDIA Jetson.
    Includes moving synthetic targets, bounding box regression brackets,
    heat radiation signatures, and Jetson Orin OSD watermark.
    """
    w, h = 640, 360
    is_thermal = ("THERM" in mode.upper() or "FLIR" in mode.upper())
    
    # Base background
    if not is_thermal:
        img = Image.new("RGB", (w, h), color=(38, 52, 42))
        draw = ImageDraw.Draw(img)
        # Road asphalt
        draw.polygon([(0, 230), (w, 190), (w, 280), (0, 320)], fill=(48, 54, 58))
        draw.line([(0, 275), (w, 235)], fill=(220, 220, 160), width=2)
        # Structure footprint
        draw.rectangle([70, 50, 200, 140], fill=(65, 72, 80), outline=(90, 100, 110), width=2)
    else:
        img = Image.new("RGB", (w, h), color=(12, 10, 32))
        draw = ImageDraw.Draw(img)
        draw.polygon([(0, 230), (w, 190), (w, 280), (0, 320)], fill=(22, 18, 50))
        draw.rectangle([70, 50, 200, 140], fill=(28, 24, 60), outline=(42, 38, 85), width=1)

    # Dynamic motion (oscillate target slightly to simulate drone hover or survivor movement)
    t = frame_idx * 0.1
    offset_x = int(math.sin(t) * 18.0)
    offset_y = int(math.cos(t * 0.7) * 8.0)

    # Target 1: Survivor or Fire Hazard
    if target_type.lower() == "survivor":
        bx1, by1 = 280 + offset_x, 140 + offset_y
        bx2, by2 = 360 + offset_x, 230 + offset_y

        if not is_thermal:
            # Person with high-vis orange/yellow vest
            hx, hy = bx1 + 32, by1 + 14
            draw.ellipse([hx, hy, hx + 18, hy + 18], fill=(240, 195, 150))
            draw.rectangle([bx1 + 26, by1 + 32, bx1 + 54, by1 + 72], fill=(245, 120, 24))
            draw.line([(bx1 + 35, by1 + 72), (bx1 + 30, by1 + 92)], fill=(40, 40, 80), width=4)
            draw.line([(bx1 + 45, by1 + 72), (bx1 + 50, by1 + 92)], fill=(40, 40, 80), width=4)
        else:
            # Radiant Body Heat Signature
            draw.ellipse([bx1 + 25, by1 + 10, bx1 + 55, by1 + 82], fill=(255, 255, 220))
            draw.ellipse([bx1 + 15, by1, bx1 + 65, by1 + 92], outline=(255, 140, 20), width=3)

        # D-FINE Corner Brackets & Detection Box
        box_col = (16, 185, 129) if not is_thermal else (0, 255, 200)
        draw.rectangle([bx1, by1, bx2, by2], outline=box_col, width=2)
        c_len = 12
        for cx, cy in [(bx1, by1), (bx2, by1), (bx1, by2), (bx2, by2)]:
            dx = c_len if cx == bx1 else -c_len
            dy = c_len if cy == by1 else -c_len
            draw.line([(cx, cy), (cx + dx, cy)], fill=(255, 255, 255), width=3)
            draw.line([(cx, cy), (cx, cy + dy)], fill=(255, 255, 255), width=3)

        conf = 95.8 + math.sin(t * 0.5) * 1.5
        label = f"[D-FINE RT-DETR] SOBREVIVIENTE: {conf:.1f}%"
        draw.rectangle([bx1, by1 - 18, bx1 + 210, by1], fill=(6, 78, 59))
        draw.text((bx1 + 4, by1 - 16), label, fill=(255, 255, 255))
        draw.text((bx1 + 4, by2 + 4), f"NPU: 11.2ms | LRF: 27.4m", fill=box_col)

    else:
        # Fire Hazard
        fx1, fy1 = 280 + offset_x, 130 + offset_y
        fx2, fy2 = 370 + offset_x, 220 + offset_y
        if not is_thermal:
            draw.polygon([(fx1 + 45, fy1 + 10), (fx1 + 15, fy1 + 75), (fx1 + 75, fy1 + 75)], fill=(235, 75, 20))
            draw.polygon([(fx1 + 45, fy1 + 28), (fx1 + 28, fy1 + 75), (fx1 + 62, fy1 + 75)], fill=(255, 200, 30))
        else:
            draw.ellipse([fx1 + 15, fy1 + 15, fx2 - 15, fy2 - 15], fill=(255, 255, 255))
            draw.ellipse([fx1 + 5, fy1 + 5, fx2 - 5, fy2 - 5], outline=(255, 40, 0), width=4)

        f_col = (239, 68, 68)
        draw.rectangle([fx1, fy1, fx2, fy2], outline=f_col, width=2)
        draw.rectangle([fx1, fy1 - 18, fx1 + 210, fy1], fill=(127, 29, 29))
        draw.text((fx1 + 4, fy1 - 16), "[D-FINE RT-DETR] FUEGO ACTIVO: 98.4%", fill=(255, 255, 255))

    # OSD Edge Watermark Badge
    draw.rectangle([0, 0, w, 24], fill=(0, 0, 0, 180))
    jetson_tag = f"JETSON ORIN NANO (15W) | UAV: {drone_id} | FRAME: #{frame_idx} | T_NPU: 48.2°C"
    draw.text((10, 6), jetson_tag, fill=(16, 185, 129))
    draw.text((w - 170, 6), "NATIVE EDGE INFERENCE", fill=(56, 189, 248))

    # Bottom OSD
    draw.rectangle([0, h - 22, w, h], fill=(0, 0, 0, 180))
    draw.text((10, h - 18), "MODEL: D-FINE-S-SAR (FINE-GRAINED BOX REGRESSION) | BATCH: 1 | FP16 TRT", fill=(203, 213, 225))
    draw.text((w - 110, h - 18), "FPS: 32.4", fill=(16, 185, 129))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()

def send_frame(server_url: str, drone_id: str, frame_bytes: bytes) -> bool:
    """Sends encoded frame to C2 camera feed endpoint."""
    url = f"{server_url}/api/v1/camera/{drone_id}/feed"
    try:
        req = urllib.request.Request(url, data=frame_bytes, headers={"Content-Type": "image/jpeg"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception as e:
        return False

def send_heartbeat(server_url: str) -> bool:
    """Sends D-FINE edge AI node heartbeat."""
    url = f"{server_url}/api/v1/ai-engine/heartbeat"
    payload = json.dumps({
        "node_id": "jetson-orin-ares-01",
        "model_loaded": "D-FINE-S-SAR",
        "architecture": "D-FINE RT-DETR (Fine-Grained Box Regression)",
        "current_fps": round(random.uniform(31.2, 33.8), 1),
        "inference_latency_ms": round(random.uniform(10.8, 11.9), 1),
        "gpu_temperature_c": round(random.uniform(47.5, 49.2), 1),
        "vram_used_mb": 1880,
        "vram_total_mb": 8192,
        "status": "ONLINE"
    }).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False

def send_detection(server_url: str, drone_id: str, target_type: str) -> bool:
    """Sends structured D-FINE target detection with bounding box coordinates."""
    url = f"{server_url}/api/v1/detections/ingest"
    cls_name = "SURVIVOR" if target_type.lower() == "survivor" else "FIRE_HAZARD"
    prio = "CRITICAL" if cls_name == "SURVIVOR" else "HIGH"
    payload = json.dumps({
        "drone_id": drone_id,
        "target_class": cls_name,
        "confidence": round(random.uniform(0.94, 0.98), 3),
        "priority": prio,
        "bbox": [0.38, 0.42, 0.64, 0.58], # [ymin, xmin, ymax, xmax]
        "drone_lat": -12.0465,
        "drone_lon": -77.0428,
        "drone_alt": 28.5,
        "drone_yaw": 85.0
    }).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False

def main():
    parser = argparse.ArgumentParser(description="D-FINE (RT-DETR) Companion Computer Video & Telemetry Streamer")
    parser.add_argument("--drone", default="ARES-01", help="Target Drone ID (default: ARES-01)")
    parser.add_argument("--fps", type=int, default=20, help="Streaming Frame Rate (default: 20 FPS)")
    parser.add_argument("--mode", default="rgb", choices=["rgb", "thermal", "flir"], help="Sensor mode: rgb or thermal")
    parser.add_argument("--target", default="survivor", choices=["survivor", "hazard", "fire"], help="Target type")
    parser.add_argument("--server", default="http://127.0.0.1:8000", help="C2 Server Base URL")
    parser.add_argument("--frames", type=int, default=100, help="Number of frames to send (0 = infinite)")
    args = parser.parse_args()

    print("=" * 70)
    print("🚀 INICIANDO STREAMER DE COMPAÑERO EDGE AI (NVIDIA JETSON ORIN NANO)")
    print(f" -> Dron Asignado:    {args.drone}")
    print(f" -> Modelo de Visión: D-FINE-S-SAR (RT-DETR Bounding Box Regression)")
    print(f" -> Frecuencia:       {args.fps} FPS")
    print(f" -> Sensor:           {args.mode.upper()}")
    print(f" -> Objetivo IA:      {args.target.upper()}")
    print(f" -> Servidor C2:      {args.server}")
    print("=" * 70)

    # Initial handshake heartbeat
    send_heartbeat(args.server)
    # Push initial detection
    send_detection(args.server, args.drone, args.target)

    frame_interval = 1.0 / max(1, args.fps)
    frame_idx = 0
    success_count = 0

    try:
        while True:
            t0 = time.perf_counter()
            frame_bytes = render_edge_frame(frame_idx, args.drone, args.mode, args.target)
            ok = send_frame(args.server, args.drone, frame_bytes)
            if ok:
                success_count += 1
            frame_idx += 1

            # Heartbeat every 40 frames (~2s)
            if frame_idx % 40 == 0:
                send_heartbeat(args.server)
                send_detection(args.server, args.drone, args.target)
                print(f" [OK] Frame #{frame_idx} enviado | Jetson Edge Stream activo ({args.fps} FPS) | Ingestas exitosas: {success_count}")

            if args.frames > 0 and frame_idx >= args.frames:
                print(f"\n✅ Transmisión completada exitosamente: {frame_idx} frames enviados a {args.server}/camera/{args.drone}/feed.")
                break

            elapsed = time.perf_counter() - t0
            sleep_time = max(0.001, frame_interval - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        print("\n🛑 Transmisión detenida por el operador.")

if __name__ == "__main__":
    main()
