from itertools import product
"""Q-RESCUE research prototype model endpoints.
VQC inference uses the saved PennyLane model. Allocation endpoint computes an
exact classical budget-constrained baseline; it does NOT claim to run QAOA.
The saved QAOA v4 experiment is returned as a benchmark for comparison.
"""
from pathlib import Path
from itertools import combinations
import json, pickle
import uuid
from datetime import datetime, timezone
from backend.database import insert, one, rows
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/models", tags=["model-testing"])
BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "vqc_model.pkl"
ZONES_PATH = BASE / "belagavi_flood_zones.csv"
QAOA_PATH = BASE / "qaoa_v4_results.json"
METRICS_PATH = BASE / "comparison_metrics.json"

class ScenarioInput(BaseModel):
    rainfall_mm: float = Field(ge=0, le=2000)
    temperature_c: float = Field(default=28, ge=-10, le=60)
    humidity_percent: float = Field(ge=0, le=100)
    wind_speed_kmh: float = Field(default=5, ge=0, le=300)
    reservoir_level_m: float = Field(default=0, ge=0, le=2000)
    gate_opening_percent: float = Field(default=0, ge=0, le=100)
    inflow_m3s: float = Field(default=0, ge=0, le=2_000_000)
    outflow_m3s: float = Field(default=0, ge=0, le=2_000_000)
    soil_moisture_percent: float = Field(default=50, ge=0, le=100)
    resource_budget: int = Field(default=2, ge=1, le=4)
    dam_name: str | None = None
    screening_taluks: list[str] = Field(default_factory=list)


def _load_metrics():
    try:
        return json.loads(METRICS_PATH.read_text())
    except Exception:
        return None


def _load_qaoa():
    try:
        return json.loads(QAOA_PATH.read_text())
    except Exception:
        return None

@router.get("/status")
def model_status():
    metrics = _load_metrics()
    qaoa = _load_qaoa()
    return {
        "vqc_model_file_present": MODEL_PATH.exists(),
        "vqc_metrics_available": metrics is not None,
        "qaoa_benchmark_available": qaoa is not None,
        "vqc_label_source": (metrics or {}).get("label_source", "unknown"),
        "warning": "Research prototype only. VQC labels are generated rainfall/humidity rules, not observed flood events."
    }


def _vqc_predict(features):
    if not MODEL_PATH.exists():
        raise HTTPException(503, "VQC model file is not installed on the backend")
    try:
        # This pickle is the project's own trained artifact. Only load artifacts
        # supplied by the project owner; never accept user-uploaded pickle files.
        with MODEL_PATH.open("rb") as f:
            saved = pickle.load(f)
        import pennylane as qml
        import pennylane.numpy as pnp
        scaler = saved["scaler"]
        weights = pnp.array(saved["weights"], requires_grad=False)
        classes = list(saved["classes"])
        x = scaler.transform(np.asarray([features], dtype=float))[0]
        n_qubits = int(saved.get("n_qubits", 4))
        n_layers = int(saved.get("n_layers", 2))
        dev = qml.device("default.qubit", wires=n_qubits)
        @qml.qnode(dev)
        def circuit(inputs):
            for i in range(n_qubits):
                qml.RY(inputs[i] * np.pi, wires=i)
            for layer in range(n_layers):
                for i in range(n_qubits):
                    qml.RY(weights[layer, i, 0], wires=i)
                    qml.RZ(weights[layer, i, 1], wires=i)
                for i in range(n_qubits - 1):
                    qml.CNOT(wires=[i, i + 1])
            return tuple(qml.expval(qml.PauliZ(i)) for i in range(len(classes)))
        logits = np.asarray(circuit(x), dtype=float).reshape(-1)
        winner = int(np.argmax(logits))
        return {"class": classes[winner], "classes": classes,
                "raw_outputs": logits.tolist(), "inference": "saved_vqc_model"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"VQC inference unavailable: {type(exc).__name__}: {exc}")


def _zone_priority_table(screening_taluks=None):
    if not ZONES_PATH.exists():
        raise HTTPException(503, "Flood-zone dataset is missing")
    df = pd.read_csv(ZONES_PATH)
    required = {"taluk", "population", "flood_risk", "villages_affected", "distance_from_hq_km"}
    if not required.issubset(df.columns):
        raise HTTPException(500, "Flood-zone dataset has missing priority columns")

    # Restrict allocation candidates to the operator-selected screened taluks.
    if screening_taluks:
        aliases = {
            "chikkodi": "chikodi",
            "raibag": "raybag",
            "athani": "athni"
        }

        def normalize_taluk(value):
            key = str(value or "").strip().casefold().replace(" ", "").replace("-", "")
            return aliases.get(key, key)

        selected_keys = {
            normalize_taluk(name)
            for name in screening_taluks
            if str(name).strip()
        }

        df = df[
            df["taluk"].astype(str).map(normalize_taluk).isin(selected_keys)
        ].copy()

        if df.empty:
            raise HTTPException(
                status_code=422,
                detail="None of the selected screening taluks match the resource priority dataset."
            )

    risk_map = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}
    df["_risk"] = df.flood_risk.map(risk_map).fillna(0)
    z = df.sort_values(["_risk", "population"], ascending=[False, False]).head(4).copy()
    z["risk_weight"] = z.flood_risk.map(risk_map).fillna(0)
    z["population_score"] = z.population / max(float(z.population.max()), 1)
    z["village_score"] = z.villages_affected / max(float(z.villages_affected.max()), 1)
    z["distance_score"] = 1 - z.distance_from_hq_km / max(float(z.distance_from_hq_km.max()), 1)
    z["priority_score"] = .5*z.risk_weight/4 + .25*z.population_score + .20*z.village_score + .05*z.distance_score
    return z


def _build_scenario_impact(
    z, screening_taluks, dam_name, hybrid_risk, exposure_rate, priority_names
):
    """Build independent dam-specific screened taluk and village estimates."""
    village_path = (
        BASE.parent / "frontend" / "public" / "data" /
        "village" / "belagavi_verified_village_points.geojson"
    )

    aliases = {
        "chikkodi": "chikodi", "chikodi": "chikodi",
        "raibag": "raybag", "raybag": "raybag",
        "athani": "athni", "athni": "athni"
    }

    def norm(value):
        key = str(value or "").strip().casefold().replace(" ", "").replace("-", "")
        return aliases.get(key, key)

    if not village_path.exists():
        return {
            "available": False,
            "message": "Village GeoJSON not found",
            "villages": [],
            "taluk_impacts": [],
            "village_count": 0,
            "population_2011": 0
        }

    try:
        geo = json.loads(village_path.read_text())
        requested = {norm(name) for name in screening_taluks if str(name).strip()}
        zone_rows = {
            norm(row["taluk"]): str(row["taluk"]).strip()
            for _, row in z.iterrows()
        }
        selected = {
            key: zone_rows.get(key, str(name).strip())
            for name in screening_taluks
            if (key := norm(name))
        }

        villages = []
        grouped = {}

        for feature in geo.get("features", []):
            props = feature.get("properties") or {}
            key = norm(props.get("taluk"))
            if key not in requested:
                continue

            taluk = selected[key]
            try:
                population = max(0, int(float(props.get("population_2011") or 0)))
            except (TypeError, ValueError):
                population = 0

            if taluk not in grouped:
                grouped[taluk] = {
                    "taluk": taluk,
                    "screened_village_count": 0,
                    "population_2011": 0,
                    "hybrid_risk": hybrid_risk,
                    "estimated_affected_people": 0,
                    "is_priority_taluk": norm(taluk) in priority_names
                }

            grouped[taluk]["screened_village_count"] += 1
            grouped[taluk]["population_2011"] += population

            villages.append({
                "village_name": props.get("village_name", "Village"),
                "taluk": taluk,
                "population_2011": population,
                "screening_risk": hybrid_risk,
                "hybrid_risk": hybrid_risk,
                "estimated_affected_people": int(round(population * exposure_rate)),
                "geometry": feature.get("geometry")
            })

        # Calculate each taluk independently, then sum the rounded taluk totals.
        taluk_impacts = []
        for item in grouped.values():
            item["estimated_affected_people"] = int(round(
                item["population_2011"] * exposure_rate
            ))
            taluk_impacts.append(item)

        total_population = sum(x["population_2011"] for x in taluk_impacts)
        total_affected = sum(x["estimated_affected_people"] for x in taluk_impacts)

        return {
            "available": True,
            "method": "selected_dam_taluk_screening",
            "selected_dam": dam_name or "Not specified",
            "selected_screening_taluks": list(selected.values()),
            "screened_taluks": list(selected.values()),
            "screened_taluk_count": len(selected),
            "taluk_impacts": taluk_impacts,
            "taluk_estimated_affected_total": total_affected,
            "priority_taluk_count": sum(
                1 for item in taluk_impacts if item["is_priority_taluk"]
            ),
            "villages": villages,
            "village_count": len(villages),
            "population_2011": total_population,
            "estimated_affected_people": total_affected,
            "note": (
                "Taluk-wise illustrative exposure estimates based on Census 2011 "
                "village population and the hybrid screening category. Not observed "
                "flood impacts or a hydraulic inundation prediction."
            )
        }
    except Exception as exc:
        return {
            "available": False,
            "message": str(exc),
            "villages": [],
            "taluk_impacts": [],
            "village_count": 0,
            "population_2011": 0
        }


@router.post("/scenario")
def run_scenario(req: ScenarioInput):
    features = [req.rainfall_mm, req.temperature_c, req.humidity_percent, req.wind_speed_kmh]
    vqc = _vqc_predict(features)
    # This is a transparent display score from the classifier category, not a
    # calibrated probability of inundation.
    score_map = {"Low": 0, "Medium": 35, "High": 70, "Critical": 95}
    risk_score = score_map.get(vqc["class"], 0)
    z = _zone_priority_table(req.screening_taluks)
    # Scenario multiplier is a scenario-ranking heuristic, not hydraulic impact.
    scenario_factor = 1 + min(req.rainfall_mm / 200, 1) * .5 + req.soil_moisture_percent / 100 * .15
    priorities = (z.priority_score.to_numpy(dtype=float) * scenario_factor).tolist()
    budget = min(req.resource_budget, len(priorities))
    choices = list(combinations(range(len(priorities)), budget))
    best = max(choices, key=lambda c: sum(priorities[i] for i in c))
    qaoa = _load_qaoa()

    # Resource allocation and impact screening are independent selections.
    priority_names = {
        str(z.iloc[i]["taluk"]).strip().casefold().replace(" ", "").replace("-", "")
        for i in best
    }
    aliases_for_priority = {
        "chikkodi": "chikodi", "raibag": "raybag", "athani": "athni"
    }
    priority_names = {aliases_for_priority.get(x, x) for x in priority_names}

    rainfall = req.rainfall_mm
    humidity = req.humidity_percent

    if rainfall > 100 or (rainfall > 50 and humidity > 80):
        rule_reference = "Critical"
    elif rainfall > 50 or (rainfall > 20 and humidity > 75):
        rule_reference = "High"
    elif rainfall > 20:
        rule_reference = "Medium"
    else:
        rule_reference = "Low"

    severity = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}
    hybrid_class = max(
        [vqc["class"], rule_reference],
        key=lambda category: severity.get(category, 0)
    )

    category_base_rate = {
        "Low": 0.01, "Medium": 0.03, "High": 0.08, "Critical": 0.15
    }
    rainfall_factor = 0.75 + 0.50 * min(rainfall / 200.0, 1.0)
    humidity_factor = 0.75 + 0.25 * (humidity / 100.0)

    def exposure_rate(category):
        return min(
            0.25,
            category_base_rate.get(category, 0.01)
            * rainfall_factor * humidity_factor
        )

    hybrid_rate = exposure_rate(hybrid_class)
    vqc_rate = exposure_rate(vqc["class"])
    rule_rate = exposure_rate(rule_reference)

    if not req.screening_taluks:
        raise HTTPException(
            status_code=422,
            detail="Select at least one surrounding taluk for dam-specific screening."
        )

    scenario_impact = _build_scenario_impact(
        z,
        req.screening_taluks,
        req.dam_name,
        hybrid_class,
        hybrid_rate,
        priority_names
    )

    screened_population = int(scenario_impact.get("population_2011", 0) or 0)
    vqc_affected_people = int(round(screened_population * vqc_rate))
    rule_affected_people = int(round(screened_population * rule_rate))
    hybrid_affected_people = int(
        scenario_impact.get("taluk_estimated_affected_total", 0) or 0
    )

    scenario_impact.update({
        "hybrid_risk": hybrid_class,
        "estimated_affected_people": hybrid_affected_people,
        "estimated_exposure_rate_percent": round(hybrid_rate * 100, 2),
        "vqc_estimated_affected_people": vqc_affected_people,
        "vqc_estimated_exposure_rate_percent": round(vqc_rate * 100, 2),
        "rule_reference_class": rule_reference,
        "rule_estimated_affected_people": rule_affected_people,
        "rule_estimated_exposure_rate_percent": round(rule_rate * 100, 2),
        "affected_people_estimate_difference": abs(
            rule_affected_people - vqc_affected_people
        ),
        "affected_estimate_method": "hybrid_category_taluk_population_exposure_heuristic",
        "affected_estimate_note": (
            "Illustrative prototype estimate calculated separately for each screened "
            "taluk using its Census 2011 village population and the more severe of "
            "the VQC and rainfall/humidity rule categories. Not calibrated against "
            "observed flood impacts and not a confirmed count of affected people."
        )
    })
    return {
        "mode": "scenario_test_only",
        "hybrid_classification": hybrid_class,
        "vqc": {**vqc, "risk_score_display": risk_score,
                "note": "Class label is trained to reproduce generated rainfall/humidity rules; not a verified flood probability."},
        "allocation": {
            "method": "exact_classical_budget_baseline",
            "selected_zones": [str(z.iloc[i].taluk) for i in best],
            "resource_budget": budget,
            "priority_scores": {str(row.taluk): float(priorities[i]) for i, row in enumerate(z.itertuples())},
            "note": "This endpoint computes an exact classical baseline for the supplied scenario. It does not execute a fresh QAOA circuit."
        },
        "qaoa_v4_benchmark": qaoa,
        "inputs": req.model_dump() if hasattr(req, "model_dump") else req.dict(),
        "scenario_impact": scenario_impact,
        "warning": "Scenario-only research output. Not an operational flood warning or dispatch instruction. Reservoir level, inflow/outflow and soil moisture are not hydraulically simulated here."
    }

@router.get("/evaluation")
def evaluation():
    return {"vqc": _load_metrics(), "qaoa_v4": _load_qaoa()}


# ============================================================
# SAVED SCENARIO DATABASE APIs
# ============================================================

class SaveScenarioRequest(BaseModel):
    scenario: dict


@router.post("/scenarios/save")
def save_scenario(req: SaveScenarioRequest):
    scenario = req.scenario

    if not isinstance(scenario, dict) or not scenario.get("scenario_impact"):
        raise HTTPException(400, "Invalid scenario result")

    scenario_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    dam_name = (
        scenario.get("inputs", {}).get("dam_name")
        or scenario.get("scenario_impact", {}).get("selected_dam")
        or "Unknown"
    )

    hybrid_class = (
        scenario.get("hybrid_classification")
        or scenario.get("scenario_impact", {}).get("hybrid_risk")
        or "Unknown"
    )

    affected = int(
        scenario.get("scenario_impact", {}).get(
            "estimated_affected_people", 0
        ) or 0
    )

    try:
        insert(
            """
            INSERT INTO saved_scenarios (
                scenario_id, created_at, dam_name,
                hybrid_class, estimated_affected_people, payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                scenario_id,
                created_at,
                dam_name,
                hybrid_class,
                affected,
                json.dumps(scenario)
            )
        )
    except Exception as exc:
        raise HTTPException(500, f"Unable to save scenario: {exc}")

    return {
        "success": True,
        "scenario_id": scenario_id,
        "created_at": created_at,
        "dam_name": dam_name,
        "hybrid_class": hybrid_class,
        "estimated_affected_people": affected
    }


@router.get("/scenarios")
def list_saved_scenarios():
    data = rows(
        """
        SELECT scenario_id, created_at, dam_name,
               hybrid_class, estimated_affected_people
        FROM saved_scenarios
        ORDER BY id DESC
        """
    )
    return {"count": len(data), "scenarios": data}


@router.get("/scenarios/{scenario_id}")
def get_saved_scenario(scenario_id: str):
    record = one(
        """
        SELECT scenario_id, created_at, dam_name,
               hybrid_class, estimated_affected_people, payload_json
        FROM saved_scenarios
        WHERE scenario_id = ?
        """,
        (scenario_id,)
    )

    if not record:
        raise HTTPException(404, "Saved scenario not found")

    return {
        "scenario_id": record["scenario_id"],
        "created_at": record["created_at"],
        "dam_name": record["dam_name"],
        "hybrid_class": record["hybrid_class"],
        "estimated_affected_people": record["estimated_affected_people"],
        "scenario": json.loads(record["payload_json"])
    }
