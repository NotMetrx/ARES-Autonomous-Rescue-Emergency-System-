Coloca en esta carpeta tus archivos de mapas offline (.mbtiles), por ejemplo:
data/offline_map.mbtiles

El servidor FastAPI los detectará automáticamente y servirá los tiles en:
GET /api/v1/tiles/{z}/{x}/{y}
GET /api/v1/tiles/metadata
GET /api/v1/tiles/style.json
