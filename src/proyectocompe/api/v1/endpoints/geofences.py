from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from proyectocompe.schemas.geofence import Geofence, GeofenceCreate
from proyectocompe.services.geofence_service import geofence_service

router = APIRouter()

@router.get("", response_model=List[Geofence])
async def list_geofences():
    """Retrieve all active operational boundaries and No-Fly Zones (NFZ)."""
    return geofence_service.get_all_geofences()

@router.post("", response_model=Geofence)
async def create_geofence(fence_in: GeofenceCreate):
    """Create a new Keep-In or Keep-Out tactical geofence."""
    return geofence_service.create_geofence(fence_in)

@router.delete("/{fence_id}")
async def delete_geofence(fence_id: str):
    """Deletes an active geofence."""
    success = geofence_service.delete_geofence(fence_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Geofence {fence_id} not found")
    return {"status": "SUCCESS", "deleted_fence_id": fence_id}

@router.get("/export/geojson")
async def export_geofences_geojson():
    """Export all geofences as standard GeoJSON for MapLibre GL JS / QGIS."""
    return JSONResponse(content=geofence_service.export_geojson())
