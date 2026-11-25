import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from database import init_db, insert, rows

router = APIRouter(prefix="/api/hidkal", tags=["Hidkal scenarios"])

def init_hidkal_scenarios():
    init_db()


class HidkalScenarioRequest(BaseModel):
    scenario_name: str = Field(min_length=1, max_length=120)
    forecast_start: datetime
    forecast_horizon_hours: int = Field(default=12, ge=12, le=12)
    rainfall_mm_12h: float = Field(ge=0, le=2000)
    reservoir_level_m: float = Field(ge=0, le=1000)
    gate_opening_percent: float = Field(ge=0, le=100)
    inflow_m3s: float = Field(ge=0, le=1_000_000)
    outflow_m3s: float = Field(ge=0, le=1_000_000)
    soil_moisture_percent: float = Field(ge=0, le=100)
    dem_layer_name: str = Field(min_length=1, max_length=255)
    river_distance_layer_name: str = Field(min_length=1, max_length=255)
    data_status: str = Field(
        default="HISTORICAL_BASED_SCENARIO",
        pattern="^(HISTORICAL_BASED_SCENARIO|MANUAL_ASSUMPTION|OBSERVED|FORECAST)$"
    )
    notes: Optional[str] = Field(default=None, max_length=4000)


@router.post("/scenarios")
def create_hidkal_scenario(request: HidkalScenarioRequest):
    init_hidkal_scenarios()
    values = request.model_dump()
    values["forecast_start"] = values["forecast_start"].isoformat()
    created_at = datetime.now(timezone.utc).isoformat()

    columns = [
        "scenario_name", "forecast_start", "forecast_horizon_hours",
        "rainfall_mm_12h", "reservoir_level_m", "gate_opening_percent",
        "inflow_m3s", "outflow_m3s", "soil_moisture_percent",
        "dem_layer_name", "river_distance_layer_name", "data_status",
        "notes", "status", "created_at"
    ]
    row_values = [values.get(column) for column in columns]
    row_values[13] = "SAVED_AWAITING_MODELS"
    row_values[14] = created_at

    placeholders = ",".join(["?"] * len(columns))
    sql = (
        f"INSERT INTO hidkal_scenarios "
        f"({','.join(columns)}) VALUES ({placeholders})"
    )
    scenario_id = insert(sql, row_values)

    return {
        "scenario_id": scenario_id,
        "status": "SAVED_AWAITING_MODELS",
        "forecast_horizon_hours": 12,
        "message": "Scenario saved. VQC and hydraulic models have not been run."
    }


@router.get("/scenarios")
def list_hidkal_scenarios(limit: int = 20):
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 100")
    init_hidkal_scenarios()
    records = rows(
        "SELECT * FROM hidkal_scenarios ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    return {"scenarios": [dict(record) for record in records]}
