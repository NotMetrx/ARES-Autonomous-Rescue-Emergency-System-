"""
Automated Test Suite for ARES Advanced Tactical Defense & Communications Capabilities:
1. Aerodynamics & Dynamic Point of No Return (PNR) Against Headwinds
2. Electronic Warfare (EW), GPS Anti-Jamming & Anti-Spoofing
3. Cursor-on-Target (CoT) & ATAK MIL-STD XML UDP Gateway
4. Ultra-Compact Binary Telemetry (LoRa/RF 915MHz) & Link Budget
5. Synthetic Topographic MGRS Tile Generator
6. Defense REST API Endpoints
"""
import sys
import os
import asyncio

# Ensure src is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

from proyectocompe.services.aerodynamics_service import aerodynamics_service
from proyectocompe.services.gps_anti_jamming_service import anti_jamming_service
from proyectocompe.services.cot_gateway import cot_gateway
from proyectocompe.services.binary_telemetry_service import binary_telemetry_service
from proyectocompe.api.v1.endpoints.tiles import render_synthetic_tactical_tile
from proyectocompe.schemas.drone import DroneFSMState

def test_aerodynamics_and_pnr():
    print("=" * 60)
    print("[TEST 1] Testing Aerodynamics & Dynamic PNR Engine...")
    print("=" * 60)

    # 1. Set ambient wind
    aerodynamics_service.set_ambient_wind(speed_ms=7.2, direction_deg=180.0)
    wind = aerodynamics_service.get_current_wind()
    assert wind.speed_ms == 7.2
    assert wind.intensity_label == "VIENTO FUERTE"
    print(f" -> Ambient Wind: {wind.speed_ms} m/s @ {wind.direction_deg}° ({wind.intensity_label})")

    # 2. Evaluate PNR for healthy drone near base
    pnr_nominal = aerodynamics_service.evaluate_pnr("ARES-01", lat=-12.0465, lon=-77.0428, battery_pct=85.0)
    assert pnr_nominal.pnr_status == "NOMINAL"
    assert pnr_nominal.battery_margin_pct > 60.0
    print(f" -> ARES-01 PNR Nominal: Margin={pnr_nominal.battery_margin_pct}%, Status={pnr_nominal.pnr_status}")

    # 3. Evaluate PNR for low-battery drone far away pushing against headwind
    pnr_breached = aerodynamics_service.evaluate_pnr("ARES-02", lat=-12.0520, lon=-77.0450, battery_pct=16.0)
    assert pnr_breached.pnr_status in ["CRITICAL", "BREACHED"]
    assert pnr_breached.rth_recommended is True
    print(f" -> ARES-02 PNR Breach: Margin={pnr_breached.battery_margin_pct}%, Status={pnr_breached.pnr_status}, RTH={pnr_breached.rth_recommended}")

def test_gps_anti_jamming():
    print("\n" + "=" * 60)
    print("[TEST 2] Testing GPS Anti-Jamming & Electronic Warfare...")
    print("=" * 60)
    anti_jamming_service.reset()

    # 1. Normal telemetry
    rep1 = anti_jamming_service.evaluate_telemetry("ARES-03", lat=-12.0463, lon=-77.0427, alt=25.0, speed_ms=5.0, timestamp=100.0)
    assert rep1.is_compromised is False
    assert rep1.nav_mode == "GPS_FIX_3D"
    print(f" -> Nominal Telemetry: Mode={rep1.nav_mode}, Sats={rep1.sat_count}, Risk={rep1.jamming_risk_pct}%")

    # 2. Physical teleportation anomaly (GPS Spoofing Jump)
    rep2 = anti_jamming_service.evaluate_telemetry("ARES-03", lat=-12.0470, lon=-77.0435, alt=25.0, speed_ms=5.0, timestamp=100.05)
    assert rep2.is_compromised is True
    assert rep2.threat_type == "SPOOFING_TELEPORT"
    assert rep2.dead_reckoning_active is True
    print(f" -> Spoofing Teleport Detected! Mode={rep2.nav_mode}, Threat={rep2.threat_type}, DR={rep2.dead_reckoning_active}")

    # 3. Injected Jamming Attack
    res_atk = anti_jamming_service.simulate_attack("ARES-01", "RF_JAMMING")
    assert res_atk["status"] == "ATTACK_INJECTED"
    rep_jam = anti_jamming_service.evaluate_telemetry("ARES-01", lat=-12.0463, lon=-77.0427, alt=25.0, speed_ms=5.0, timestamp=101.0)
    assert rep_jam.is_compromised is True
    assert rep_jam.threat_type == "RF_JAMMING"
    print(f" -> EW Jamming Injected: Threat={rep_jam.threat_type}, Emergency Heading={rep_jam.emergency_heading_deg}°")

    # 4. Clear attack
    res_clr = anti_jamming_service.clear_attack("ARES-01")
    assert res_clr["status"] == "RESTORED"
    print(f" -> Attack Cleared successfully: {res_clr['message']}")

def test_cot_atak_gateway():
    print("\n" + "=" * 60)
    print("[TEST 3] Testing Cursor-on-Target (CoT) & ATAK Gateway...")
    print("=" * 60)

    # 1. Drone CoT XML
    drone_xml = cot_gateway.build_drone_cot_xml(
        drone_id="ARES-01",
        lat=-12.04635,
        lon=-77.04278,
        alt=28.5,
        speed_ms=6.5,
        battery=92.0,
        heading=85.0,
        fsm_state="IN_FLIGHT"
    )
    assert "<event version=\"2.0\"" in drone_xml
    assert "uid=\"ARES-01\"" in drone_xml
    assert "type=\"a-f-A-M-F-Q\"" in drone_xml
    assert "lat=\"-12.0463500\"" in drone_xml
    print(f" -> Generated Drone CoT XML ({len(drone_xml)} bytes). Header sample:")
    print("    " + drone_xml.split("\n")[1][:75] + "...")

    # 2. Target CoT XML
    tgt_xml = cot_gateway.build_target_cot_xml(
        target_id="TGT-45AB",
        class_name="SURVIVOR",
        lat=-12.04690,
        lon=-77.04310,
        confidence=0.96,
        priority="CRITICAL"
    )
    assert "type=\"b-m-p-s-p-loc\"" in tgt_xml
    assert "uid=\"TGT-45AB\"" in tgt_xml
    print(f" -> Generated Survivor Target CoT XML ({len(tgt_xml)} bytes)")

    # 3. Transmit packet over UDP
    sent_ok = cot_gateway.send_cot_event(drone_xml)
    assert sent_ok is True
    assert cot_gateway.total_packets_sent >= 1
    print(f" -> Broadcast CoT event to UDP 127.0.0.1:{cot_gateway.target_port} (Total sent: {cot_gateway.total_packets_sent})")

def test_binary_telemetry_and_rf_budget():
    print("\n" + "=" * 60)
    print("[TEST 4] Testing Ultra-Compact Binary Telemetry & RF Link Budget...")
    print("=" * 60)

    mock_drones = [
        {
            "drone_id": "ARES-01",
            "lat": -12.0463512,
            "lon": -77.0427814,
            "alt": 28.5,
            "velocity": {"x": 4.5, "y": 2.1, "z": 0.2},
            "orientation": {"yaw": 85.0},
            "battery": 94.0,
            "fsm_state": "IN_FLIGHT",
            "in_safety_breach": False,
            "pnr_status": "NOMINAL",
            "gps_denied": False
        },
        {
            "drone_id": "ARES-02",
            "lat": -12.0468912,
            "lon": -77.0431214,
            "alt": 30.0,
            "velocity": {"x": -3.2, "y": 1.5, "z": 0.0},
            "orientation": {"yaw": 190.0},
            "battery": 45.0,
            "fsm_state": "ROUTING",
            "in_safety_breach": True,
            "pnr_status": "CRITICAL",
            "gps_denied": True
        },
        {
            "drone_id": "ARES-03",
            "lat": -12.0459912,
            "lon": -77.0423214,
            "alt": 22.0,
            "velocity": {"x": 1.0, "y": -4.0, "z": -0.1},
            "orientation": {"yaw": 315.0},
            "battery": 88.0,
            "fsm_state": "IN_FLIGHT",
            "in_safety_breach": False,
            "pnr_status": "NOMINAL",
            "gps_denied": False
        }
    ]

    # 1. Encode binary struct
    bin_bytes = binary_telemetry_service.encode_swarm_frame(mock_drones)
    assert len(bin_bytes) == 73 # 5 header + 3*22 + 2 crc
    print(f" -> Encoded 3-drone swarm frame to {len(bin_bytes)} bytes! (vs ~2,400 bytes JSON)")

    # 2. Decode binary struct
    decoded = binary_telemetry_service.decode_swarm_frame(bin_bytes)
    assert decoded["drones_count"] == 3
    assert decoded["drones"][0]["drone_id"] == "ARES-01"
    assert round(decoded["drones"][0]["lat"], 4) == -12.0464
    assert decoded["drones"][1]["gps_denied"] is True
    assert decoded["drones"][1]["in_safety_breach"] is True
    print(f" -> Decoded frame verified! Drone 1: {decoded['drones'][0]['drone_id']}, Bat: {decoded['drones'][0]['battery']}%, Alt: {decoded['drones'][0]['alt']}m")

    # 3. Calculate RF Link Budget
    budget = binary_telemetry_service.calculate_rf_link_budget(distance_m=1500.0, frequency_mhz=915.0)
    assert budget["bandwidth_savings_pct"] > 96.0
    print(f" -> RF Link Budget at {budget['distance_m']}m: RSSI={budget['rssi_dbm']} dBm, SNR={budget['snr_db']} dB, Quality={budget['link_quality']}")
    print(f" -> Radio Transmission Time: JSON={budget['latency_over_radio_json_ms']} ms vs Binary={budget['latency_over_radio_binary_ms']} ms ({budget['bandwidth_savings_pct']}% savings!)")

def test_synthetic_tile_generator():
    print("\n" + "=" * 60)
    print("[TEST 5] Testing Synthetic Offline Topographic Tile Generator...")
    print("=" * 60)

    tile_data = render_synthetic_tactical_tile(18, 74974, 137684)
    assert len(tile_data) > 500
    assert tile_data[:8] == b'\x89PNG\r\n\x1a\n' # Valid PNG header
    print(f" -> Generated Tactical Topo Tile: {len(tile_data)} bytes PNG image with contour rings and MGRS grid.")

def test_defense_rest_api():
    print("\n" + "=" * 60)
    print("[TEST 6] Testing Defense & ATAK REST API Endpoints...")
    print("=" * 60)
    from starlette.testclient import TestClient
    from proyectocompe.main import app

    client = TestClient(app)

    # 1. Anti-jamming status
    resp = client.get("/api/v1/defense/anti-jamming/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "ew_environment" in data
    print(f" -> /defense/anti-jamming/status: {data['ew_environment']}")

    # 2. Ambient wind
    resp = client.post("/api/v1/defense/aerodynamics/wind", json={"speed_ms": 5.4, "direction_deg": 90.0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["wind"]["speed_ms"] == 5.4
    print(f" -> /defense/aerodynamics/wind POST: updated to {data['wind']['speed_ms']} m/s")

    # 3. PNR status for all drones
    resp = client.get("/api/v1/defense/aerodynamics/pnr-status")
    assert resp.status_code == 200
    data = resp.json()
    print(f" -> /defense/aerodynamics/pnr-status: Evaluated {len(data)} active drones")

    # 4. ATAK CoT broadcast
    resp = client.post("/api/v1/defense/cot/broadcast-now", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "BROADCAST_COMPLETED"
    print(f" -> /defense/cot/broadcast-now: Broadcast {data['events_transmitted']} events to ATAK network")

    # 5. RF Link Budget
    resp = client.get("/api/v1/defense/rf-link/budget?distance_m=2000&frequency_mhz=915")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bandwidth_savings_pct"] > 96.0
    print(f" -> /defense/rf-link/budget: Verified {data['bandwidth_savings_pct']}% compression over radio")

def main():
    test_aerodynamics_and_pnr()
    test_gps_anti_jamming()
    test_cot_atak_gateway()
    test_binary_telemetry_and_rf_budget()
    test_synthetic_tile_generator()
    test_defense_rest_api()
    print("\n" + "=" * 60)
    print("ALL 6 ADVANCED TACTICAL CAPABILITIES VERIFIED 100% SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()
