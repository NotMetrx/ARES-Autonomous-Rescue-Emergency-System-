#!/usr/bin/env python3
"""
ARES Tactical Command & Control - Field Operator Terminal UI (TUI).
Ultra-lightweight console interface for rugged field laptops (Panasonic Toughbook, Getac)
and low-bandwidth headless SSH sessions.
Streams live 20 Hz telemetry from local WebSocket and allows instant tactical fleet commands.
"""
import sys
import os
import time
import json
import math
import select
import asyncio
import urllib.request
import websockets

# ANSI Escape Sequences
CLEAR_SCREEN = "\033[2J\033[H"
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"
WHITE = "\033[37m"
BG_BLUE = "\033[44m"
BG_RED = "\033[41m"

BASE_LAT = -12.046374
BASE_LON = -77.042793
API_HOST = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws/telemetry"

latest_frame = None
recent_logs = ["SISTEMA INICIALIZADO - ESPERANDO TELEMETRÍA..."]
running = True

def format_battery_bar(pct: float, width: int = 10) -> str:
    filled = int(round((pct / 100.0) * width))
    empty = width - filled
    if pct > 60:
        col = GREEN
    elif pct > 25:
        col = YELLOW
    else:
        col = RED
    return f"{col}[{'█' * filled}{'░' * empty}] {pct:4.1f}%{RESET}"

def format_pnr_margin(margin: float, status: str) -> str:
    if margin is None:
        return "N/A"
    if status in ["CRITICAL", "BREACHED"]:
        return f"{RED}{BOLD}{margin:+5.1f}% [{status}]{RESET}"
    elif status == "ADVISORY":
        return f"{YELLOW}{margin:+5.1f}% [{status}]{RESET}"
    return f"{GREEN}{margin:+5.1f}% [OK]{RESET}"

def draw_ascii_radar(drones: list, targets: list, width: int = 42, height: int = 14) -> list:
    """Renders a 2D ASCII tactical radar grid of the operational airspace."""
    grid = [["·" for _ in range(width)] for _ in range(height)]
    center_x = width // 2
    center_y = height // 2

    # Draw Base Home
    grid[center_y][center_x] = f"{CYAN}H{RESET}"

    # Draw Drones
    scale_m_per_char = 3.5
    for idx, d in enumerate(drones):
        lat = d.get("lat", BASE_LAT)
        lon = d.get("lon", BASE_LON)
        dy_m = (lat - BASE_LAT) * 111139.0
        dx_m = (lon - BASE_LON) * (111139.0 * math.cos(math.radians(BASE_LAT)))
        
        gx = center_x + int(round(dx_m / scale_m_per_char))
        gy = center_y - int(round(dy_m / scale_m_per_char))

        d_num = str(idx + 1)
        if 0 <= gx < width and 0 <= gy < height:
            if d.get("gps_denied", False):
                grid[gy][gx] = f"{RED}{BOLD}X{RESET}"
            elif d.get("in_safety_breach", False):
                grid[gy][gx] = f"{RED}{BOLD}!{RESET}"
            else:
                grid[gy][gx] = f"{GREEN}{BOLD}{d_num}{RESET}"

    # Convert to lines with boundary
    lines = [f"{DIM}+{'-' * width}+{RESET}"]
    for row in grid:
        lines.append(f"{DIM}|{RESET}{''.join(row)}{DIM}|{RESET}")
    lines.append(f"{DIM}+{'-' * width}+{RESET}")
    return lines

def send_api_command(endpoint: str, payload: dict = None):
    try:
        url = f"{API_HOST}{endpoint}"
        data = json.dumps(payload).encode("utf-8") if payload else None
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

async def telemetry_listener():
    global latest_frame, running, recent_logs
    while running:
        try:
            async with websockets.connect(WS_URL) as ws:
                recent_logs.append("ENLACE WEBSOCKET ESTABLECIDO (20 Hz)")
                while running:
                    msg = await ws.recv()
                    data = json.loads(msg)
                    latest_frame = data

                    # Catch alerts
                    for alert in data.get("active_alerts", []):
                        log = f"ALERTA COLISIÓN: {alert.get('drone_a_id')} <-> {alert.get('drone_b_id')} ({alert.get('distance_m')}m)"
                        if log not in recent_logs:
                            recent_logs.append(log)
                            if len(recent_logs) > 6:
                                recent_logs.pop(0)
        except Exception as e:
            recent_logs.append(f"RECONECTANDO WEBSOCKET... ({e})")
            await asyncio.sleep(2.0)

async def keyboard_input_loop():
    global running, recent_logs
    loop = asyncio.get_event_loop()
    while running:
        # Non-blocking stdin check in linux
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        cmd = line.strip().upper()
        if cmd == "Q":
            running = False
            break
        elif cmd == "T":
            res = send_api_command("/api/v1/drones/fleet/takeoff")
            recent_logs.append(f"CMD TAKEOFF ENVIADO: {res.get('status', 'OK')}")
        elif cmd == "R":
            res = send_api_command("/api/v1/drones/fleet/rth")
            recent_logs.append(f"CMD RTH ENVIADO: {res.get('status', 'OK')}")
        elif cmd == "B":
            res = send_api_command("/api/v1/chaos/inject-battery-drain", {"drone_id": "ARES-01", "target_battery": 14.0})
            recent_logs.append(f"CMD BATERÍA DRAIN (ARES-01): Relevo activado")
        elif cmd == "J":
            res = send_api_command("/api/v1/defense/anti-jamming/simulate-attack", {"drone_id": "ARES-02", "attack_type": "RF_JAMMING"})
            recent_logs.append(f"CMD EW JAMMING INYECTADO EN ARES-02")
        elif cmd == "K":
            res = send_api_command("/api/v1/defense/anti-jamming/clear-attack", {"drone_id": "ARES-02"})
            recent_logs.append(f"CMD EW INTERFERENCIA LIMPIADA")
        elif cmd == "C":
            res = send_api_command("/api/v1/defense/cot/broadcast-now")
            recent_logs.append(f"CMD ATAK CoT BROADCAST: {res.get('events_transmitted', 0)} eventos emitidos")

async def render_loop():
    global latest_frame, running
    while running:
        if latest_frame:
            drones = latest_frame.get("drones", [])
            seq = latest_frame.get("frame_sequence", 0)
            cov = latest_frame.get("coverage_pct", 0.0)
            wind_spd = latest_frame.get("wind_speed_ms", 0.0)
            wind_dir = latest_frame.get("wind_dir_deg", 0.0)
            ew_level = latest_frame.get("ew_threat_level", "NOMINAL")

            radar_lines = draw_ascii_radar(drones, [])

            out = []
            out.append(CLEAR_SCREEN)
            out.append(f"{BG_BLUE}{WHITE}{BOLD} ⚡ ARES TACTICAL C2 - CONSOLA DE TERRENO (RUGGED TUI) ⚡ {RESET}")
            out.append(f"{CYAN}FRAME:{RESET} #{seq} | {CYAN}FREQ:{RESET} 20Hz | {CYAN}COBERTURA SAR:{RESET} {cov:.1f}% | {CYAN}VIENTO:{RESET} {wind_spd:.1f} m/s @ {wind_dir:.0f}° | {CYAN}EW:{RESET} {RED if 'HOSTIL' in ew_level else GREEN}{ew_level}{RESET}")
            out.append("=" * 80)

            # Table Header
            out.append(f"{BOLD}{'DRON ID':<9} {'ESTADO':<11} {'BATERÍA':<19} {'ALT':<7} {'VEL':<7} {'PNR MARGIN':<16} {'GPS/EW':<10}{RESET}")
            out.append("-" * 80)

            for d in drones:
                d_id = d.get("drone_id", "---")
                fsm = str(d.get("fsm_state", "---")).replace("DroneFSMState.", "")
                bat_str = format_battery_bar(d.get("battery", 0.0), width=8)
                alt = f"{d.get('alt', 0.0):.1f}m"
                spd = f"{d.get('speed_ms', 0.0):.1f}m/s"
                pnr_str = format_pnr_margin(d.get("pnr_margin_pct"), d.get("pnr_status", "NOMINAL"))
                
                if d.get("gps_denied", False):
                    gps_str = f"{RED}{BOLD}DENIED{RESET}"
                elif d.get("sat_count", 16) < 8:
                    gps_str = f"{YELLOW}DEGRAD{RESET}"
                else:
                    gps_str = f"{GREEN}FIX 3D{RESET}"

                out.append(f"{CYAN}{d_id:<9}{RESET} {fsm:<11} {bat_str} {alt:<7} {spd:<7} {pnr_str:<16} {gps_str}")

            out.append("-" * 80)

            # Side-by-side: Radar ASCII & Live Logs
            out.append(f"{BOLD}RADAR TÁCTICO 2D ESPACIAL (Base=[H], Drones=[1,2,3], Alerta=[!]):{RESET}")
            for idx, r_line in enumerate(radar_lines):
                log_idx = idx
                log_text = recent_logs[-(len(radar_lines) - idx)] if (len(radar_lines) - idx) <= len(recent_logs) else ""
                out.append(f"  {r_line}   {YELLOW}▶{RESET} {log_text}")

            out.append("=" * 80)
            out.append(f"{BOLD}ACCIONES TÁCTICAS: {CYAN}[T]{RESET} Takeoff | {CYAN}[R]{RESET} RTH | {CYAN}[B]{RESET} Drenar Bat/Handover | {CYAN}[J]{RESET} Inyectar EW Jamming | {CYAN}[K]{RESET} Limpiar EW | {CYAN}[C]{RESET} ATAK CoT | {CYAN}[Q]{RESET} Salir")
            out.append(f"{DIM}Comando > {RESET}")
            
            sys.stdout.write("\n".join(out))
            sys.stdout.flush()

        await asyncio.sleep(0.1)

async def main():
    try:
        await asyncio.gather(
            telemetry_listener(),
            render_loop(),
            keyboard_input_loop()
        )
    except asyncio.CancelledError:
        pass
    finally:
        print(f"\n{GREEN}ARES TUI finalizado correctamente.{RESET}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Interrumpido por el usuario.{RESET}")
