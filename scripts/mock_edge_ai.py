#!/usr/bin/env python3
"""
ARES Tactical C2 - Edge AI Ingestion Mock Client
Simulates an onboard Edge AI Companion Computer (e.g. NVIDIA Jetson Orin / Raspberry Pi 5)
running D-FINE (Real-time Object Detection with Fine-Grained Bounding Box Regression).

Sends target detections via HTTP POST with gimbal angles, bounding box, and thumbnail.
"""
import sys
import time
import base64
import json
import random
import urllib.request

DEFAULT_ENDPOINT = "http://localhost:8000/api/v1/detections"

# 1x1 dummy JPEG (or a tiny 40-byte valid JPEG) for thumbnail simulation
SAMPLE_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////"
    "//////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAA"
    "AP/aAAgBAQABPxA="
)

TARGET_CLASSES = [
    "SURVIVOR",
    "FIRE_HAZARD",
    "VEHICLE",
    "INTRUDER",
    "INFRASTRUCTURE_DAMAGE"
]

def send_detection(
    endpoint: str = DEFAULT_ENDPOINT,
    drone_id: str = "ARES-01",
    target_class: str = "SURVIVOR",
    confidence: float = 0.94,
    pitch_deg: float = -45.0,
    yaw_deg: float = 0.0,
    bbox: dict = None,
    image_b64: str = SAMPLE_JPEG_B64,
):
    if bbox is None:
        bbox = {"x_min": 0.35, "y_min": 0.40, "x_max": 0.65, "y_max": 0.75}

    payload = {
        "drone_id": drone_id,
        "target_class": target_class,
        "confidence": confidence,
        "bounding_box": bbox,
        "camera_pitch_deg": pitch_deg,
        "camera_yaw_deg": yaw_deg,
        "snapshot_base64": image_b64
    }

    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[EDGE AI MOCK] Success ({elapsed_ms:.1f}ms): Target={data.get('detection_id')} | "
                  f"Class={data.get('target_class')} | ObsCount={data.get('observation_count', 1)} | "
                  f"Lat={data.get('estimated_lat')}, Lon={data.get('estimated_lon')}")
            return data
    except Exception as e:
        print(f"[EDGE AI MOCK] Error sending detection: {e}", file=sys.stderr)
        return None

def main():
    print("=" * 60)
    print("ARES Tactical C2 - Edge AI Ingestion Simulation Harness")
    print("Use this script to test the backend clustering and C2 reception.")
    print("=" * 60)
    
    endpoint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ENDPOINT
    drones = ["ARES-01", "ARES-02", "ARES-03"]
    
    print(f"Targeting: {endpoint}")
    print("Simulating 5 consecutive detections to test clustering/deduplication...")
    
    chosen_class = random.choice(TARGET_CLASSES)
    chosen_drone = random.choice(drones)
    
    for i in range(5):
        conf = round(random.uniform(0.85, 0.98), 2)
        send_detection(
            endpoint=endpoint,
            drone_id=chosen_drone,
            target_class=chosen_class,
            confidence=conf,
            pitch_deg=-45.0 + random.uniform(-1.0, 1.0),
            yaw_deg=random.uniform(-2.0, 2.0)
        )
        time.sleep(0.4)

    print("\nTest completed successfully. Check the HUD at http://localhost:8000/hud to see the cluster count!")

if __name__ == "__main__":
    main()
