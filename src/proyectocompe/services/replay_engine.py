import os
import json
import asyncio
import logging
from typing import Optional
from proyectocompe.services.flight_recorder import RECORDS_DIR
from proyectocompe.websockets.connection_mgr import ws_manager

logger = logging.getLogger("ares.replay")

class TelemetryReplayEngine:
    """
    Asynchronous Replay Engine for Tactical Swarm Debriefing / After-Action Review.
    Streams recorded telemetry frames over WebSockets at selectable speed (0.5x to 5x).
    """

    def __init__(self):
        self.is_replaying = False
        self.current_session_id: Optional[str] = None
        self.speed_multiplier: float = 1.0
        self.progress_pct: float = 0.0
        self._replay_task: Optional[asyncio.Task] = None

    async def start_replay(self, session_id: str, speed: float = 1.0) -> bool:
        if self.is_replaying:
            await self.stop_replay()

        file_path = os.path.join(RECORDS_DIR, f"{session_id}.jsonl")
        if not os.path.exists(file_path):
            return False

        self.is_replaying = True
        self.current_session_id = session_id
        self.speed_multiplier = max(0.2, min(10.0, speed))
        self.progress_pct = 0.0

        self._replay_task = asyncio.create_task(self._run_replay(file_path))
        return True

    async def stop_replay(self):
        if self._replay_task:
            self._replay_task.cancel()
            try:
                await self._replay_task
            except asyncio.CancelledError:
                pass
            self._replay_task = None

        self.is_replaying = False
        self.current_session_id = None
        self.progress_pct = 0.0

        # Broadcast replay ended notification
        await ws_manager.broadcast_frame({
            "event_type": "REPLAY_FINISHED",
            "message": "Telemetry replay finished. Returned to live feed."
        })

    async def _run_replay(self, file_path: str):
        try:
            frames = []
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        if entry.get("type") != "METADATA":
                            frames.append(entry)
                    except Exception:
                        pass

            total_frames = len(frames)
            if total_frames == 0:
                self.is_replaying = False
                return

            logger.info(f"Starting replay of {total_frames} frames from {file_path} at {self.speed_multiplier}x")

            for idx, entry in enumerate(frames):
                if not self.is_replaying:
                    break

                frame_data = entry.get("data", {})
                self.progress_pct = round(((idx + 1) / total_frames) * 100.0, 1)

                # Inject replay metadata
                if isinstance(frame_data, dict):
                    frame_data["is_replay"] = True
                    frame_data["replay_session"] = self.current_session_id
                    frame_data["replay_progress_pct"] = self.progress_pct
                    frame_data["replay_speed"] = self.speed_multiplier

                await ws_manager.broadcast_frame(frame_data)

                # Frame delay based on standard 20Hz interval / speed
                base_dt = 1.0 / 20.0
                delay = base_dt / self.speed_multiplier
                await asyncio.sleep(delay)

        except asyncio.CancelledError:
            logger.info("Replay task cancelled.")
        except Exception as e:
            logger.error(f"Error during replay: {e}")
        finally:
            self.is_replaying = False
            self.current_session_id = None

replay_engine = TelemetryReplayEngine()
