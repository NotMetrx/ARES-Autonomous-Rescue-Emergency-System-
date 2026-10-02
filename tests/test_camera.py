"""
Test Suite for Onboard FPV Camera Video Streaming & D-FINE Overlays.
"""
import sys
import os
import urllib.request
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))
from proyectocompe.services.camera_service import camera_service

def test_camera_service():
    print("=" * 60)
    print("[TEST 1] Testing Camera Service RGB & FLIR Rendering...")
    print("=" * 60)

    # 1. Render RGB Frame
    camera_service.set_camera_mode("ARES-01", "RGB")
    rgb_frame = camera_service.render_tactical_frame("ARES-01")
    assert len(rgb_frame) > 5000
    assert rgb_frame[:2] == b'\xff\xd8' # Valid JPEG header
    print(f" -> Rendered ARES-01 RGB Frame: {len(rgb_frame)} bytes JPEG with D-FINE overlays")

    # 2. Render Thermal FLIR Frame
    camera_service.set_camera_mode("ARES-01", "THERMAL_FLIR")
    flir_frame = camera_service.render_tactical_frame("ARES-01")
    assert len(flir_frame) > 5000
    assert flir_frame[:2] == b'\xff\xd8'
    print(f" -> Rendered ARES-01 Thermal FLIR Frame: {len(flir_frame)} bytes JPEG (Ironbow palette)")

    # 3. Snapshot capture
    filepath, snap_bytes = camera_service.capture_snapshot("ARES-01")
    assert os.path.exists(filepath)
    assert len(snap_bytes) > 5000
    print(f" -> Captured and stored snapshot: {filepath} ({len(snap_bytes)} bytes)")

    # 4. Gimbal PTZ Manipulation
    gimb = camera_service.set_gimbal("ARES-01", pitch_deg=-90.0, yaw_deg=45.0, zoom=2.0)
    assert gimb["pitch_deg"] == -90.0
    assert gimb["yaw_deg"] == 45.0
    assert gimb["zoom"] == 2.0
    print(f" -> Set PTZ Gimbal: Pitch={gimb['pitch_deg']}°, Yaw={gimb['yaw_deg']}°, Zoom={gimb['zoom']}x")

    # 5. Gimbal Presets
    preset_res = camera_service.apply_preset("ARES-01", "horizon")
    assert preset_res["pitch_deg"] == 0.0
    print(f" -> Applied 'horizon' preset: Pitch={preset_res['pitch_deg']}°")

    # 6. Snapshot catalog listing
    snaps = camera_service.list_snapshots()
    assert len(snaps) > 0
    assert "filename" in snaps[0]
    assert "url" in snaps[0]
    print(f" -> Listed {len(snaps)} archived snapshots in catalog")

def test_camera_rest_endpoints():
    print("\n" + "=" * 60)
    print("[TEST 2] Testing Camera REST API Endpoints...")
    print("=" * 60)

    from starlette.testclient import TestClient
    from proyectocompe.main import app

    client = TestClient(app)

    # Frame
    resp = client.get("/api/v1/camera/ARES-01/frame")
    assert resp.status_code == 200
    assert "image/jpeg" in resp.headers.get("content-type", "")
    print(" -> GET /camera/ARES-01/frame: 200 OK image/jpeg")

    # Mode
    resp = client.post("/api/v1/camera/ARES-01/mode?mode=RGB")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "RGB"
    print(" -> POST /camera/ARES-01/mode: switched to RGB")

    # PTZ Gimbal Control
    resp = client.post(
        "/api/v1/camera/ARES-01/gimbal",
        json={"pitch_deg": -30.0, "yaw_deg": -15.0, "zoom": 1.5}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pitch_deg"] == -30.0
    assert data["yaw_deg"] == -15.0
    print(f" -> POST /camera/ARES-01/gimbal: Pitch={data['pitch_deg']}°, Yaw={data['yaw_deg']}°")

    # Gimbal Preset
    resp = client.post("/api/v1/camera/ARES-01/preset/nadir")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pitch_deg"] == -90.0
    print(f" -> POST /camera/ARES-01/preset/nadir: applied Nadir 90°")

    # Diagnostic Status
    resp = client.get("/api/v1/camera/ARES-01/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "gimbal" in data
    assert "source" in data
    print(f" -> GET /camera/ARES-01/status: Source={data['source']}, Gimbal={data['gimbal']}")

    # Snapshot Capture
    resp = client.post("/api/v1/camera/ARES-01/snapshot")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "SNAPSHOT_CAPTURED"
    snap_file = os.path.basename(data["filepath"])
    print(f" -> POST /camera/ARES-01/snapshot: Captured {data['filepath']}")

    # Snapshot Catalog List
    resp = client.get("/api/v1/camera/snapshots")
    assert resp.status_code == 200
    snaps = resp.json()
    assert len(snaps) > 0
    print(f" -> GET /camera/snapshots: Found {len(snaps)} archived snapshots")

    # Snapshot File Retrieval
    resp = client.get(f"/api/v1/camera/snapshots/{snap_file}")
    assert resp.status_code == 200
    assert any(t in resp.headers.get("content-type", "") for t in ["image/jpeg", "image/png"])
    assert len(resp.content) > 5000
    print(f" -> GET /camera/snapshots/{snap_file}: 200 OK ({len(resp.content)} bytes)")

    # External Companion Feed Ingestion (Jetson Simulation)
    fake_frame = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb" + b"\x00" * 2000
    resp = client.post(
        "/api/v1/camera/ARES-02/feed",
        content=fake_frame,
        headers={"Content-Type": "image/jpeg"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "FRAME_INGESTED"
    print(f" -> POST /camera/ARES-02/feed: Ingested companion frame ({data['size']} bytes)")


def test_aar_report_with_embedded_evidence():
    print("\n" + "=" * 60)
    print("[TEST 3] Testing AAR HTML Report with Embedded Evidence Gallery...")
    print("=" * 60)
    import asyncio
    from proyectocompe.services.aar_report_service import aar_service

    aar_data = asyncio.run(aar_service.generate_aar_report("ARES-MISSION-01"))
    assert "forensic_snapshots" in aar_data
    assert len(aar_data["forensic_snapshots"]) > 0
    print(f" -> AAR Report collected {len(aar_data['forensic_snapshots'])} forensic snapshots")

    html = asyncio.run(aar_service.render_html_report("ARES-MISSION-01"))
    assert "Registro Fotográfico Pericial FPV & D-FINE" in html
    assert len(html) > 20000
    print(f" -> Rendered HTML AAR Report ({len(html)} bytes) with embedded forensic gallery")

if __name__ == "__main__":
    test_camera_service()
    test_camera_rest_endpoints()
    test_aar_report_with_embedded_evidence()
    print("\n" + "=" * 60)
    print("ALL CAMERA, PTZ, EVIDENCE & COMPANION TESTS PASSED 100%!")
    print("=" * 60)
