from typing import List, Dict, Any

class DomainValidationError(Exception):
    def __init__(self, code: str, message: str, details: Dict[str, Any] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

def validate_golden_hour(estimated_duration_seconds: float, planning_time_seconds: float = 0.0) -> None:
    """
    Invariante 1: Golden Hour SLA (<= 3600s / 60 minutes).
    """
    total_seconds = estimated_duration_seconds + planning_time_seconds
    if total_seconds > 3600.0:
        raise DomainValidationError(
            code="GOLDEN_HOUR_EXCEEDED",
            message=f"Tiempo estimado ({total_seconds/60:.1f} min) supera la ventana de la Hora Dorada (60 min)",
            details={"total_seconds": total_seconds, "max_allowed_seconds": 3600.0}
        )

def validate_payload_capacity(total_cargo_weight_grams: int, max_payload_grams: int) -> None:
    """
    Invariante 2: Carga útil no debe exceder el 90% de la capacidad nominal máxima.
    """
    effective_capacity = 0.90 * max_payload_grams
    if total_cargo_weight_grams > effective_capacity:
        raise DomainValidationError(
            code="INSUFFICIENT_FLEET",
            message=f"La carga útil ({total_cargo_weight_grams}g) excede el 90% de capacidad máxima ({effective_capacity:.1f}g)",
            details={
                "total_cargo_weight_grams": total_cargo_weight_grams,
                "max_payload_grams": max_payload_grams,
                "effective_limit_grams": effective_capacity
            }
        )

def validate_thermal_sensitivity(flight_time_seconds: float, max_transit_minutes: int, item_name: str = "") -> None:
    """
    Invariante 4: Caducidad térmica de suministros críticos.
    flight_time_seconds <= max_transit_minutes * 60
    """
    max_allowed_seconds = max_transit_minutes * 60
    if flight_time_seconds > max_allowed_seconds:
        raise DomainValidationError(
            code="THERMAL_DECAY_EXCEEDED",
            message=f"Tiempo de vuelo ({flight_time_seconds/60:.1f} min) supera el límite de estabilidad térmica de '{item_name}' ({max_transit_minutes} min)",
            details={
                "item_name": item_name,
                "flight_time_seconds": flight_time_seconds,
                "max_transit_seconds": max_allowed_seconds
            }
        )

def validate_battery_reserve(estimated_consumption_pct: float) -> None:
    """
    Invariante 3: Reserva de batería RTH (consumo <= 70%, 30% reserva).
    """
    if estimated_consumption_pct > 70.0:
        raise DomainValidationError(
            code="BATTERY_RESERVE_VIOLATION",
            message=f"Consumo estimado ({estimated_consumption_pct:.1f}%) excede el 70%, violando la reserva RTH del 30%",
            details={"estimated_consumption_pct": estimated_consumption_pct, "max_allowed_consumption_pct": 70.0}
        )
