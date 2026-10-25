import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pathlib import Path
import urllib.request
import json
import time
from datetime import datetime, timezone


def calculate_flood_risk(rainfall: float) -> dict:
    """Calculate baseline flood risk from rainfall thresholds."""

    if rainfall >= 100:
        risk = "Critical"
        risk_score = 95
    elif rainfall >= 50:
        risk = "High"
        risk_score = 75
    elif rainfall >= 20:
        risk = "Medium"
        risk_score = 50
    else:
        risk = "Low"
        risk_score = 20

    return {
        "risk": risk,
        "risk_score": risk_score,
        "prediction_source": "baseline-model"
    }


# ==================================================
# APP
# ==================================================

app = FastAPI(
    title="Q-RESCUE API",
    description="Flood Risk Prediction and Emergency Resource Allocation",
    version="1.0.0"
)


# ==================================================
# CORS
# ==================================================

frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

# Local development origins
frontend_origins.extend([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(frontend_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================================================
# DATA
# ==================================================

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "Data"

RAIN_FILE = DATA_DIR / "belagavi_rainfall_2015_2023.csv"
FLOOD_FILE = DATA_DIR / "belagavi_flood_zones.csv"
GEO_FILE = DATA_DIR / "belagavi_geography.csv"
POPULATION_FILE = DATA_DIR / "belagavi_population_2011.csv"

rainfall_df = pd.read_csv(RAIN_FILE)
flood_df = pd.read_csv(FLOOD_FILE)
geography_df = pd.read_csv(GEO_FILE)
population_df = pd.read_csv(POPULATION_FILE)


# ==================================================
# HEALTH CHECK
# ==================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "Q-RESCUE",
        "message": "Q-RESCUE backend is running"
    }


# ==================================================
# CENSUS POPULATION DATA
# ==================================================

@app.get("/api/population")
def get_population():

    population = population_df.fillna("").to_dict(
        orient="records"
    )

    return {
        "count": len(population),
        "source": "Census 2011 Primary Census Abstract",
        "data": population
    }


# ==================================================
# FLOOD ZONES + CENSUS POPULATION
# ==================================================

@app.get("/api/zone-population")
def get_zone_population():

    population_lookup = dict(
        zip(
            population_df["qrescue_taluk"].astype(str).str.strip(),
            population_df["population_2011"]
        )
    )

    combined = []

    for _, zone in flood_df.iterrows():

        taluk = str(zone["taluk"]).strip()

        combined.append({
            "taluk": taluk,
            "river": zone["river"],
            "latitude": float(zone["latitude"]),
            "longitude": float(zone["longitude"]),
            "flood_risk": zone["flood_risk"],

            "population_2011": population_lookup.get(taluk),

            "villages_affected": int(
                zone["villages_affected"]
            ),

            "bridges_submerged": int(
                zone["bridges_submerged"]
            ),

            "rescue_teams_needed": int(
                zone["rescue_teams_needed"]
            ),

            "boats_needed": int(
                zone["boats_needed"]
            ),

            "distance_from_hq_km": float(
                zone["distance_from_hq_km"]
            )
        })

    return {
        "count": len(combined),
        "population_source":
            "Census 2011 Primary Census Abstract",
        "data": combined
    }


# ==================================================
# RAINFALL DATA
# ==================================================

@app.get("/api/rainfall")
def get_rainfall():

    latest = rainfall_df.iloc[-1]

    return {
        "date": str(latest["date"]),
        "rainfall_mm": float(latest["rainfall_mm"]),
        "temperature_c": float(latest["temperature_c"]),
        "humidity": float(latest["humidity_%"]),
        "wind_speed": float(latest["wind_speed"])
    }


# ==================================================
# FLOOD ZONES
# ==================================================

@app.get("/api/zones")
def get_zones():

    zones = flood_df.fillna("").to_dict(
        orient="records"
    )

    return {
        "count": len(zones),
        "zones": zones
    }


# ==================================================
# FLOOD RISK PREDICTION
# ==================================================

@app.get("/api/predict")
def predict_flood():
    latest = rainfall_df.iloc[-1]

    rainfall = float(latest["rainfall_mm"])
    humidity = float(latest["humidity_%"])

    prediction = calculate_flood_risk(rainfall)

    return {
        **prediction,
        "rainfall_mm": rainfall,
        "humidity": humidity
    }

# ==================================================
# EMERGENCY RESOURCE ALLOCATION
# ==================================================

@app.get("/api/resources")
def get_resources():

    resources = []

    # Create Census population lookup once.
    population_lookup = dict(
        zip(
            population_df["qrescue_taluk"]
            .astype(str)
            .str.strip(),
            population_df["population_2011"]
        )
    )

    for _, zone in flood_df.iterrows():

        # -----------------------------------------
        # BASIC ZONE DATA
        # -----------------------------------------

        taluk = str(zone["taluk"]).strip()
        risk = str(zone["flood_risk"]).strip()

        # Use Census 2011 population.
        # Fall back to flood-zone population if
        # Census value is unavailable.

        population = int(
            population_lookup.get(
                taluk,
                zone["population"]
            )
        )

        villages = int(
            zone["villages_affected"]
        )

        distance = float(
            zone["distance_from_hq_km"]
        )

        # -----------------------------------------
        # PRIORITY SCORE
        # -----------------------------------------

        risk_score_map = {
            "Critical": 100,
            "High": 75,
            "Medium": 50,
            "Low": 25
        }

        risk_score = risk_score_map.get(
            risk,
            25
        )

        population_score = min(
            population / 700000 * 100,
            100
        )

        village_score = min(
            villages / 60 * 100,
            100
        )

        distance_score = min(
            distance / 100 * 100,
            100
        )

        priority_score = (
            risk_score * 0.40
            + population_score * 0.30
            + village_score * 0.20
            + distance_score * 0.10
        )

        priority_score = round(
            priority_score
        )

        # -----------------------------------------
        # AMBULANCE REQUIREMENT
        # -----------------------------------------

        if risk == "Critical":

            ambulances = 4

        elif risk == "High":

            ambulances = 3

        elif risk == "Medium":

            ambulances = 2

        else:

            ambulances = 1

        # -----------------------------------------
        # AFFECTED PEOPLE
        # -----------------------------------------

        # Prototype assumption:
        # 10% of population estimated to be affected.

        affected_people = int(
            population * 0.10
        )

        # -----------------------------------------
        # EMERGENCY RESOURCE ESTIMATES
        # -----------------------------------------

        food_kits = affected_people

        water_kits = affected_people

        medical_kits = max(
            1,
            int(
                affected_people * 0.20
            )
        )

        shelter_kits = max(
            1,
            int(
                affected_people * 0.20
            )
        )

        life_jackets = (
            int(zone["boats_needed"]) * 2
        )

        # -----------------------------------------
        # RESOURCE RECORD
        # -----------------------------------------

        resources.append({

            "taluk": taluk,

            "river": zone["river"],

            "flood_risk": risk,

            "population": population,

            "population_source":
                "Census 2011 Primary Census Abstract",

            "affected_people":
                affected_people,

            "affected_people_source":
                "Prototype estimate: 10% of population",

            "villages_affected":
                villages,

            "boats_needed":
                int(zone["boats_needed"]),

            "rescue_teams_needed":
                int(zone["rescue_teams_needed"]),

            "ambulances_needed":
                ambulances,

            "food_kits_needed":
                food_kits,

            "water_kits_needed":
                water_kits,

            "medical_kits_needed":
                medical_kits,

            "shelter_kits_needed":
                shelter_kits,

            "life_jackets_needed":
                life_jackets,

            "priority_score":
                priority_score,

            "distance_from_hq_km":
                distance
        })

    return {
        "count": len(resources),
        "resources": resources
    }


# ==================================================
# GEOGRAPHY - DAMS
# ==================================================

@app.get("/api/dams")
def get_dams():

    dams = (
        geography_df[
            geography_df["dam"]
            .fillna("")
            .astype(str)
            .str.strip() != ""
        ]
        .fillna("")
        .to_dict(
            orient="records"
        )
    )

    return {
        "count": len(dams),
        "dams": dams
    }


# ==================================================
# GEOGRAPHY - REGIONS
# ==================================================

@app.get("/api/regions")
def get_regions():

    regions = (
        geography_df["region"]
        .dropna()
        .loc[
            geography_df["region"]
            .astype(str)
            .str.strip() != ""
        ]
        .unique()
        .tolist()
    )

    return {
        "count": len(regions),
        "regions": regions
    }


# ==================================================
# GEOGRAPHY - VILLAGES
# ==================================================

@app.get("/api/villages")
def get_villages():

    villages = (
        geography_df
        .fillna("")
        .to_dict(
            orient="records"
        )
    )

    return {
        "count": len(villages),
        "villages": villages
    }


# ==================================================
# COMPLETE GEOGRAPHY DATA
# ==================================================

@app.get("/api/geography")
def get_geography():

    data = (
        geography_df
        .fillna("")
        .to_dict(
            orient="records"
        )
    )

    return {
        "count": len(data),
        "data": data
    }


# ==================================================
# DASHBOARD SUMMARY
# ==================================================


@app.get("/api/dashboard")
def dashboard():
    latest = rainfall_df.iloc[-1]

    rainfall = float(latest["rainfall_mm"])
    humidity = float(latest["humidity_%"])

    # Reuse the shared baseline risk calculation
    prediction = calculate_flood_risk(rainfall)

    return {
        "rainfall": {
            "date": str(latest["date"]),
            "rainfall_mm": rainfall,
            "temperature_c": float(latest["temperature_c"]),
            "humidity": humidity,
            "wind_speed": float(latest["wind_speed"])
        },
        "flood_risk": {
            "risk": prediction["risk"],
            "score": prediction["risk_score"]
        },
        "zones": len(flood_df),
        "status": "Monitoring Active"
    }
    # ==================================================
# LIVE WEATHER CACHE
# ==================================================

WEATHER_CACHE = {
    "data": None,
    "cached_at": 0.0,
}

WEATHER_CACHE_TTL = 600  # 10 minutes
# ==================================================
# LIVE WEATHER
# ==================================================


@app.get("/api/live-weather")
def get_live_weather():
    print(
    f"Live weather fetch failed: {type(e).__name__}: {e}",
    flush=True
)
    # Belagavi city coordinates
    latitude = 15.8497
    longitude = 74.4977

    now = time.time()
    cached_data = WEATHER_CACHE["data"]

    # Reuse recent successful weather data
    if (
        cached_data is not None
        and now - WEATHER_CACHE["cached_at"] < WEATHER_CACHE_TTL
    ):
        return {
            **cached_data,
            "cache_status": "cached",
        }

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}"
        f"&longitude={longitude}"
        "&current=temperature_2m,relative_humidity_2m,precipitation,"
        "rain,wind_speed_10m,weather_code"
        "&timezone=Asia%2FKolkata"
    )

    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Q-RESCUE/1.0"}
        )

        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode())

        current = data["current"]

        result = {
            "location": "Belagavi",
            "latitude": latitude,
            "longitude": longitude,
            "temperature_c": current.get("temperature_2m"),
            "humidity_percent": current.get("relative_humidity_2m"),
            "precipitation_mm": current.get("precipitation"),
            "rain_mm": current.get("rain"),
            "wind_speed_kmh": current.get("wind_speed_10m"),
            "weather_code": current.get("weather_code"),
            "timestamp": current.get("time"),
            "source": "Open-Meteo",
            "data_type": "Current weather model data",
            "cache_status": "fresh",
        }

        WEATHER_CACHE["data"] = result
        WEATHER_CACHE["cached_at"] = time.time()

        return result

    except Exception as e:
        # Serve the last successful result if the provider fails
        if cached_data is not None:
            return {
                **cached_data,
                "cache_status": "stale",
                "warning": "Live weather refresh failed; showing cached data.",
            }

        return {
            "status": "error",
            "message": "Live weather is temporarily unavailable.",
            "error": str(e),
            "location": "Belagavi",
            "source": "Open-Meteo",
        }
