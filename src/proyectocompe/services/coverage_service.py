import math
import time
from typing import Dict, List, Set, Tuple
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG

class CoverageGridService:
    """
    Real-time Ground Coverage & Footprint Tracking Service.
    Discretizes the search area into 5m x 5m cells and computes accumulating
    area coverage as UAV cameras sweep the search polygon.
    """
    def __init__(
        self,
        base_lat: float = -12.046374,
        base_lon: float = -77.042793,
        grid_width_m: float = 200.0,
        grid_height_m: float = 160.0,
        cell_size_m: float = 6.0,
    ):
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.grid_width_m = grid_width_m
        self.grid_height_m = grid_height_m
        self.cell_size_m = cell_size_m

        # Number of cols and rows
        self.cols = int(grid_width_m / cell_size_m)
        self.rows = int(grid_height_m / cell_size_m)
        self.total_cells = max(1, self.cols * self.rows)

        # Visited cells set: stores (col, row)
        self.visited_cells: Set[Tuple[int, int]] = set()
        self.start_time = time.time()

    def update_drone_coverage(self, drone_lat: float, drone_lon: float, alt_m: float):
        """
        Calculates ground camera footprint (radius ~ alt * tan(FOV/2), e.g. 60 deg FOV -> radius ~ 0.577 * alt)
        and marks all covered cells as visited.
        """
        # Camera footprint radius on the ground
        footprint_radius_m = max(8.0, min(35.0, alt_m * 0.6))

        # Convert drone position to metric relative to base
        dy = (drone_lat - self.base_lat) * METERS_PER_LAT_DEG
        dx = (drone_lon - self.base_lon) * (METERS_PER_LAT_DEG * math.cos(math.radians(self.base_lat)))

        # Bounds in cells
        min_x = dx - footprint_radius_m
        max_x = dx + footprint_radius_m
        min_y = dy - footprint_radius_m
        max_y = dy + footprint_radius_m

        # Map to grid coordinates (centered at base)
        col_start = max(0, int((min_x + self.grid_width_m / 2.0) / self.cell_size_m))
        col_end = min(self.cols - 1, int((max_x + self.grid_width_m / 2.0) / self.cell_size_m))
        row_start = max(0, int((min_y + self.grid_height_m / 2.0) / self.cell_size_m))
        row_end = min(self.rows - 1, int((max_y + self.grid_height_m / 2.0) / self.cell_size_m))

        radius_sq = footprint_radius_m * footprint_radius_m

        for c in range(col_start, col_end + 1):
            cell_center_x = (c + 0.5) * self.cell_size_m - (self.grid_width_m / 2.0)
            for r in range(row_start, row_end + 1):
                cell_center_y = (r + 0.5) * self.cell_size_m - (self.grid_height_m / 2.0)
                dist_sq = (cell_center_x - dx) ** 2 + (cell_center_y - dy) ** 2
                if dist_sq <= radius_sq:
                    self.visited_cells.add((c, r))

    def get_stats(self) -> dict:
        visited_count = len(self.visited_cells)
        coverage_pct = round((visited_count / self.total_cells) * 100.0, 1)
        cell_area_m2 = self.cell_size_m * self.cell_size_m
        covered_area_m2 = round(visited_count * cell_area_m2, 1)
        total_area_m2 = round(self.total_cells * cell_area_m2, 1)

        # Convert sampled visited cells to relative metric offsets for canvas radar rendering
        # Return a compact list of [col, row]
        cells_list = list(self.visited_cells)

        return {
            "coverage_pct": coverage_pct,
            "covered_area_m2": covered_area_m2,
            "total_area_m2": total_area_m2,
            "visited_cells_count": visited_count,
            "total_cells_count": self.total_cells,
            "cell_size_m": self.cell_size_m,
            "grid_width_m": self.grid_width_m,
            "grid_height_m": self.grid_height_m,
            "visited_cells_sample": cells_list[:600],  # Return up to 600 for fast frontend rendering
        }

    def reset(self):
        self.visited_cells.clear()
        self.start_time = time.time()

coverage_service = CoverageGridService()
