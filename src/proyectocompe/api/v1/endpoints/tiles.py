import os
import aiosqlite
from fastapi import APIRouter, Response, HTTPException
from proyectocompe.core.config import settings

router = APIRouter()

# 1x1 transparent PNG fallback tile (67 bytes)
EMPTY_TILE_PNG = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
])

import io
from PIL import Image, ImageDraw

TILE_CACHE = {}

def render_synthetic_tactical_tile(z: int, x: int, y: int) -> bytes:
    """Generates an offline tactical topographic grid tile (256x256) for Leaflet/MapLibre."""
    key = (z, x % 8, y % 8)
    if key in TILE_CACHE:
        return TILE_CACHE[key]

    img = Image.new("RGBA", (256, 256), color=(13, 19, 26, 255))
    draw = ImageDraw.Draw(img)

    # Elevation contour rings
    draw.ellipse([20, 20, 236, 236], outline=(22, 34, 48, 180), width=1)
    draw.ellipse([60, 60, 196, 196], outline=(22, 34, 48, 140), width=1)
    draw.ellipse([100, 100, 156, 156], outline=(26, 42, 60, 160), width=1)

    # Tactical MGRS grid lines
    for pos in [0, 64, 128, 192, 255]:
        draw.line([(0, pos), (256, pos)], fill=(28, 42, 56, 200), width=1)
        draw.line([(pos, 0), (pos, 256)], fill=(28, 42, 56, 200), width=1)

    # Center crosshair
    draw.line([(124, 128), (132, 128)], fill=(0, 240, 255, 90), width=1)
    draw.line([(128, 124), (128, 132)], fill=(0, 240, 255, 90), width=1)

    # Coordinate label
    draw.text((8, 8), f"ZONE {z}/{x}/{y}", fill=(70, 95, 120, 180))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()
    TILE_CACHE[key] = data
    return data

@router.get("/{z}/{x}/{y}")
async def get_tile(z: int, x: int, y: int):
    """
    Offline Map Tile Server for MapLibre GL JS and Leaflet.
    Extracts tiles from local .mbtiles SQLite archive.
    If archive is not yet present, returns synthetic military tactical grid tiles.
    """
    mbtiles_file = settings.MBTILES_PATH

    if not os.path.exists(mbtiles_file):
        return Response(content=render_synthetic_tactical_tile(z, x, y), media_type="image/png")

    try:
        tms_y = (1 << z) - 1 - y
        async with aiosqlite.connect(mbtiles_file) as db:
            async with db.execute(
                "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
                (z, x, tms_y)
            ) as cursor:
                row = await cursor.fetchone()
                if row and row[0]:
                    tile_bytes = row[0]
                    if tile_bytes[:2] == b'\x1f\x8b':
                        return Response(
                            content=tile_bytes,
                            media_type="application/x-protobuf",
                            headers={"Content-Encoding": "gzip"}
                        )
                    return Response(content=tile_bytes, media_type="image/png")

        return Response(content=render_synthetic_tactical_tile(z, x, y), media_type="image/png")
    except Exception:
        return Response(content=render_synthetic_tactical_tile(z, x, y), media_type="image/png")

@router.get("/metadata")
async def get_tile_metadata():
    """Retrieve metadata from local .mbtiles store."""
    mbtiles_file = settings.MBTILES_PATH
    if not os.path.exists(mbtiles_file):
        return {
            "status": "OFFLINE_STANDBY",
            "message": f"No .mbtiles found at {mbtiles_file}. Place your regional .mbtiles file there for full offline maps.",
            "format": "mbtiles/sqlite"
        }
    
    metadata = {}
    async with aiosqlite.connect(mbtiles_file) as db:
        async with db.execute("SELECT name, value FROM metadata") as cursor:
            async for row in cursor:
                metadata[row[0]] = row[1]
    return metadata

@router.get("/style.json")
async def get_offline_style():
    """Returns a ready-to-use Dark Tactical MapLibre GL style configured for local offline tiles."""
    return {
        "version": 8,
        "name": "ARES Dark Tactical HUD Style",
        "sources": {
            "ares_offline_tiles": {
                "type": "raster",
                "tiles": ["/api/v1/tiles/{z}/{x}/{y}"],
                "tileSize": 256
            }
        },
        "layers": [
            {
                "id": "background",
                "type": "background",
                "paint": {
                    "background-color": "#0a0e14"
                }
            },
            {
                "id": "offline_raster",
                "type": "raster",
                "source": "ares_offline_tiles",
                "paint": {
                    "raster-opacity": 0.85,
                    "raster-contrast": 0.2
                }
            }
        ]
    }
