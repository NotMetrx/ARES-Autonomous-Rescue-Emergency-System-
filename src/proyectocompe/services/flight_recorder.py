import os
import json
import time
import asyncio
from typing import List, Dict, Optional

RECORDS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data", "flight_records")

class FlightRecorder:
    """
    Tactical Black Box / Mission Flight Recorder.
    Streams and flushes telemetry frames, collision alerts, and mission events to .jsonl
    for After-Action Review (AAR) and demonstration replay.
    """

    def __init__(self, records_dir: str = RECORDS_DIR):
        self.records_dir = records_dir
        os.makedirs(self.records_dir, exist_ok=True)
        self.is_recording = False
        self.current_session_id: Optional[str] = None
        self.current_file_path: Optional[str] = None
        self._file_handle = None
        self.frames_recorded = 0
        self.start_time: float = 0.0

    def start_recording(self, session_name: Optional[str] = None) -> str:
        if self.is_recording:
            return self.current_session_id

        timestamp_str = time.strftime("%Y%m%d_%H%M%S")
        name_clean = (session_name or "mission").replace(" ", "_").lower()
        self.current_session_id = f"flight_{name_clean}_{timestamp_str}"
        self.current_file_path = os.path.join(self.records_dir, f"{self.current_session_id}.jsonl")
        
        self._file_handle = open(self.current_file_path, "w", encoding="utf-8")
        self.is_recording = True
        self.frames_recorded = 0
        self.start_time = time.time()
        
        # Write header metadata
        header = {
            "type": "METADATA",
            "session_id": self.current_session_id,
            "recorded_at": self.start_time,
            "version": "1.0"
        }
        self._file_handle.write(json.dumps(header) + "\n")
        self._file_handle.flush()
        return self.current_session_id

    def record_frame(self, frame_dict: dict):
        if not self.is_recording or not self._file_handle:
            return
        
        record_entry = {
            "timestamp": time.time(),
            "data": frame_dict
        }
        self._file_handle.write(json.dumps(record_entry) + "\n")
        self.frames_recorded += 1
        # Flush every 10 frames (~0.5s at 20Hz)
        if self.frames_recorded % 10 == 0:
            self._file_handle.flush()

    def stop_recording(self) -> dict:
        if not self.is_recording:
            return {"status": "NOT_RECORDING"}

        session_id = self.current_session_id
        count = self.frames_recorded
        duration = round(time.time() - self.start_time, 1)

        if self._file_handle:
            self._file_handle.flush()
            self._file_handle.close()
            self._file_handle = None

        self.is_recording = False
        self.current_session_id = None
        self.current_file_path = None

        return {
            "status": "STOPPED",
            "session_id": session_id,
            "frames_recorded": count,
            "duration_seconds": duration
        }

    def list_recordings(self) -> List[dict]:
        results = []
        if not os.path.exists(self.records_dir):
            return results

        for fname in sorted(os.listdir(self.records_dir), reverse=True):
            if fname.endswith(".jsonl"):
                fpath = os.path.join(self.records_dir, fname)
                stat = os.stat(fpath)
                # Count approximate lines
                line_count = 0
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        line_count = sum(1 for _ in f)
                except Exception:
                    pass

                results.append({
                    "session_id": fname[:-6],
                    "filename": fname,
                    "size_kb": round(stat.st_size / 1024.0, 1),
                    "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                    "frames": max(0, line_count - 1),
                })
        return results

flight_recorder = FlightRecorder()
