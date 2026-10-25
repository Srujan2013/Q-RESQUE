
import os
import json
import time
import logging
import urllib.request
from pathlib import Path

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ==================================================
# LOGGING
# ==================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("q-rescue")


# ==================================================
# FLOOD RISK CALCULATION
# ==================================================

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
        "prediction_source": "baseline-model",
    }


# ==================================================
# APP
# ==================================================

app = FastAPI(
    title="Q-RESCUE API",
    description="Flood Risk Prediction and Emergency Resource Allocation",
    version="1.0.0",
)


# ==================================================
# CORS
# ==================================================

frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

# Production frontend origins
frontend_origins.extend([
    "https://q-resque.vercel.app",
    "https://q-resque-p3bg0l9bo-srujan2013s-projects.vercel.app",
])

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
# DATA LOADING
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
        "message": "Q-RESCUE backend is running",
    }


# ==================================================
# CENSUS POPULATION DATA
# ==================================================

@app.get("/api/population")
def get_population():
    population = population_df.fillna("").to_dict(orient="records")

    return {
        "count": len(population),
        "source": "Census 2011 Primary Census Abstract",
        "data": population,
    }


# ==================================================
# FLOOD ZONES + CENSUS POPULATION
# ==================================================

@app.get("/api/zone-population")
def get_zone_population():
    population_lookup = dict(
        zip(
            population_df["qrescue_taluk"].astype(str).str.strip(),
            population_df["population_2011"],
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
            "villages_affected": int(zone["villages_affected"]),
            "bridges_submerged": int(zone["bridges_submerged"]),
            "rescue_teams_needed": int(zone["rescue_teams_needed"]),
            "boats_needed": int(zone["boats_needed"]),
            "distance_from_hq_km": float(zone["distance_from_hq_km"]),
        })

    return {
        "count": len(combined),
        "population_source": "Census 2011 Primary Census Abstract",
        "data": combined,
    }


# ==================================================
# HISTORICAL RAINFALL DATA
# ==================================================

@app.get("/api/rainfall")
def get_rainfall():
    latest = rainfall_df.iloc[-1]

    return {
        "date": str(latest["date"]),
        "rainfall_mm": float(latest["rainfall_mm"]),
        "temperature_c": float(latest["temperature_c"]),
        "humidity": float(latest["humidity_%"]),
        "wind_speed": float(latest["wind_speed"]),
        "data_type": "Historical dataset",
    }


# ==================================================
# FLOOD ZONES
# ==================================================

@app.get("/api/zones")
def get_zones():
    zones = flood_df.fillna("").to_dict(orient="records")

    return {
        "count": len(zones),
        "zones": zones,
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
        "humidity": humidity,
        "data_type": "Prediction based on latest dataset record",
    }


# ==================================================
# EMERGENCY RESOURCE ALLOCATION
# ==================================================

@app.get("/api/resources")
def get_resources():
    resources = []

    population_lookup = dict(
        zip(
            population_df["qrescue_taluk"].astype(str).str.strip(),
            population_df["population_2011"],
        )
    )

    risk_score_map = {
        "Critical": 100,
        "High": 75,
        "Medium": 50,
        "Low": 25,
    }

    for _, zone in flood_df.iterrows():
        taluk = str(zone["taluk"]).strip()
        risk = str(zone["flood_risk"]).strip()

        census_population = population_lookup.get(taluk)

        # Use Census population where available.
        # Otherwise use the population in the flood-zone dataset.
        if pd.isna(census_population):
            population = int(zone["population"])
            population_source = "Flood-zone dataset"
        else:
            population = int(census_population)
            population_source = "Census 2011 Primary Census Abstract"

        villages = int(zone["villages_affected"])
        distance = float(zone["distance_from_hq_km"])

        risk_score = risk_score_map.get(risk, 25)

        population_score = min(population / 700000 * 100, 100)
        village_score = min(villages / 60 * 100, 100)
        distance_score = min(distance / 100 * 100, 100)

        priority_score = round(
            risk_score * 0.40
            + population_score * 0.30
            + village_score * 0.20
            + distance_score * 0.10
        )

        if risk == "Critical":
            ambulances = 4
        elif risk == "High":
            ambulances = 3
        elif risk == "Medium":
            ambulances = 2
        else:
            ambulances = 1

        # Prototype assumption: 10% of the population is affected.
        affected_people = int(population * 0.10)

        food_kits = affected_people
        water_kits = affected_people
        medical_kits = max(1, int(affected_people * 0.20))
        shelter_kits = max(1, int(affected_people * 0.20))
        life_jackets = int(zone["boats_needed"]) * 2

        resources.append({
            "taluk": taluk,
            "river": zone["river"],
            "flood_risk": risk,
            "population": population,
            "population_source": population_source,
            "affected_people": affected_people,
            "affected_people_source": (
                "Prototype estimate: 10% of population"
            ),
            "villages_affected": villages,
            "boats_needed": int(zone["boats_needed"]),
            "rescue_teams_needed": int(zone["rescue_teams_needed"]),
            "ambulances_needed": ambulances,
            "food_kits_needed": food_kits,
            "water_kits_needed": water_kits,
            "medical_kits_needed": medical_kits,
            "shelter_kits_needed": shelter_kits,
            "life_jackets_needed": life_jackets,
            "priority_score": priority_score,
            "distance_from_hq_km": distance,
        })

    resources.sort(
        key=lambda item: item["priority_score"],
        reverse=True,
    )

    return {
        "count": len(resources),
        "resources": resources,
    }


# ==================================================
# GEOGRAPHY: DAMS
# ==================================================

@app.get("/api/dams")
def get_dams():
    dams = (
        geography_df[
            geography_df["dam"]
            .fillna("")
            .astype(str)
            .str.strip()
            != ""
        ]
        .fillna("")
        .to_dict(orient="records")
    )

    return {
        "count": len(dams),
        "dams": dams,
    }


# ==================================================
# GEOGRAPHY: REGIONS
# ==================================================

@app.get("/api/regions")
def get_regions():
    regions = (
        geography_df["region"]
        .dropna()
        .loc[
            geography_df["region"]
            .astype(str)
            .str.strip()
            != ""
        ]
        .unique()
        .tolist()
    )

    return {
        "count": len(regions),
        "regions": regions,
    }


# ==================================================
# GEOGRAPHY: VILLAGES
# ==================================================

@app.get("/api/villages")
def get_villages():
    villages = geography_df.fillna("").to_dict(orient="records")

    return {
        "count": len(villages),
        "villages": villages,
    }


# ==================================================
# COMPLETE GEOGRAPHY DATA
# ==================================================

@app.get("/api/geography")
def get_geography():
    data = geography_df.fillna("").to_dict(orient="records")

    return {
        "count": len(data),
        "data": data,
    }


# ==================================================
# DASHBOARD SUMMARY
# ==================================================

@app.get("/api/dashboard")
def dashboard():
    latest = rainfall_df.iloc[-1]

    rainfall = float(latest["rainfall_mm"])
    humidity = float(latest["humidity_%"])

    prediction = calculate_flood_risk(rainfall)

    return {
        "rainfall": {
            "date": str(latest["date"]),
            "rainfall_mm": rainfall,
            "temperature_c": float(latest["temperature_c"]),
            "humidity": humidity,
            "wind_speed": float(latest["wind_speed"]),
            "data_type": "Historical dataset",
        },
        "flood_risk": {
            "risk": prediction["risk"],
            "score": prediction["risk_score"],
        },
        "zones": len(flood_df),
        "status": "Monitoring Active",
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
    latitude = 15.8497
    longitude = 74.4977

    now = time.time()
    cached_data = WEATHER_CACHE["data"]

    # Return recently fetched data without contacting the provider.
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
        "&current=temperature_2m,relative_humidity_2m,"
        "precipitation,rain,wind_speed_10m,weather_code"
        "&timezone=Asia%2FKolkata"
    )

    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Q-RESCUE/1.0"},
        )

        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        current = data.get("current")

        if not isinstance(current, dict):
            raise ValueError("Weather provider returned no current data")

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

        # Store only successful weather responses.
        WEATHER_CACHE["data"] = result
        WEATHER_CACHE["cached_at"] = time.time()

        logger.info("Live weather fetched successfully")

        return result

    except Exception as exc:
        logger.exception("Live weather fetch failed")

        # Reuse the previous successful response if available.
        if cached_data is not None:
            return {
                **cached_data,
                "cache_status": "stale",
                "warning": (
                    "Weather refresh failed. "
                    "Showing previously cached weather."
                ),
            }

        # Never present historical records as live weather.
        return {
            "status": "unavailable",
            "message": "Live weather is temporarily unavailable.",
            "error": str(exc),
            "location": "Belagavi",
            "source": "Open-Meteo",
        }
