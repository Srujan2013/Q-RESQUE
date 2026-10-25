from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pathlib import Path
import urllib.request
import json


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
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
# SHARED BASELINE FLOOD-RISK FUNCTION
# ==================================================

def calculate_flood_risk(rainfall):
    """Return the prototype risk category and score from rainfall."""
    rainfall = float(rainfall)

    if rainfall >= 100:
        return {"risk": "Critical", "score": 95}
    elif rainfall >= 50:
        return {"risk": "High", "score": 75}
    elif rainfall >= 20:
        return {"risk": "Medium", "score": 50}
    else:
        return {"risk": "Low", "score": 20}


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

# --------------------------------------------------
# CENSUS POPULATION DATA
# --------------------------------------------------

@app.get("/api/population")
def get_population():

    population = population_df.fillna("").to_dict(orient="records")

    return {
        "count": len(population),
        "source": "Census 2011 Primary Census Abstract",
        "data": population
    }

    # --------------------------------------------------
# FLOOD ZONES + CENSUS POPULATION
# --------------------------------------------------

@app.get("/api/zone-population")
def get_zone_population():

    # Create a lookup dictionary from Census population data
    population_lookup = dict(
        zip(
            population_df["qrescue_taluk"],
            population_df["population_2011"]
        )
    )

    combined = []

    for _, zone in flood_df.iterrows():

        taluk = zone["taluk"]

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
            "distance_from_hq_km": float(zone["distance_from_hq_km"])
        })

    return {
        "count": len(combined),
        "population_source": "Census 2011 Primary Census Abstract",
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

    zones = flood_df.fillna("").to_dict(orient="records")

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

    # Prototype baseline based on historical CSV rainfall.
    result = calculate_flood_risk(rainfall)
    risk = result["risk"]
    risk_score = result["score"]

    return {
        "risk": risk,
        "risk_score": risk_score,
        "rainfall_mm": rainfall,
        "humidity": humidity,
        "prediction_source": "baseline-model"
    }

# --------------------------------------------------
# EMERGENCY RESOURCE ALLOCATION
# --------------------------------------------------

@app.get("/api/resources")
def get_resources():

    resources = []

    for _, zone in flood_df.iterrows():

        risk = str(zone["flood_risk"]).strip()

        taluk = str(zone["taluk"]).strip()

        population_lookup = dict(
            zip(
                population_df["qrescue_taluk"].astype(str).str.strip(),
                population_df["population_2011"]
            )
        )

        population = int(
            population_lookup.get(
                taluk,
                zone["population"]
            )
        )

        villages = int(zone["villages_affected"])
        distance = float(zone["distance_from_hq_km"])

        # -----------------------------------------
        # PRIORITY SCORE
        # -----------------------------------------

        # Prototype priority score, normalized to a 0-100 display scale.
        risk_weight_map = {
            "Low": 1,
            "Medium": 2,
            "High": 3,
            "Critical": 4
        }

        risk_component = risk_weight_map.get(risk, 1) / 4

        # Use one consistent population source for all zone comparisons.
        population_lookup = dict(
            zip(
                population_df["qrescue_taluk"].astype(str).str.strip(),
                population_df["population_2011"]
            )
        )

        population_values = [
            float(population_lookup.get(
                str(row["taluk"]).strip(),
                row["population"]
            ))
            for _, row in flood_df.iterrows()
        ]

        max_population = max(max(population_values, default=1), 1)
        max_villages = max(float(flood_df["villages_affected"].max()), 1)
        max_distance = max(float(flood_df["distance_from_hq_km"].max()), 1)

        population_component = min(population / max_population, 1)
        village_component = min(villages / max_villages, 1)
        proximity_component = max(0, 1 - distance / max_distance)

        priority_score = round(100 * (
            0.50 * risk_component
            + 0.25 * population_component
            + 0.20 * village_component
            + 0.05 * proximity_component
        ), 2)

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

        affected_people = int(population * 0.10)

        # -----------------------------------------
        # EMERGENCY RESOURCES
        # -----------------------------------------

        food_kits = affected_people
        water_kits = affected_people

        medical_kits = max(
            1,
            int(affected_people * 0.20)
        )

        shelter_kits = max(
            1,
            int(affected_people * 0.20)
        )

        life_jackets = int(
            zone["boats_needed"]
        ) * 2

        # -----------------------------------------
        # RESOURCE RECORD
        # -----------------------------------------

        resources.append({

            "taluk": zone["taluk"],
            "river": zone["river"],
            "flood_risk": risk,

            "population": population,
            "affected_people": affected_people,
            "villages_affected": villages,

            "boats_needed": int(
                zone["boats_needed"]
            ),

            "rescue_teams_needed": int(
                zone["rescue_teams_needed"]
            ),

            "ambulances_needed": ambulances,

            "food_kits_needed": food_kits,
            "water_kits_needed": water_kits,
            "medical_kits_needed": medical_kits,
            "shelter_kits_needed": shelter_kits,
            "life_jackets_needed": life_jackets,

            "priority_score": priority_score,

            "distance_from_hq_km": distance
        })

    return {
        "count": len(resources),
        "resources": resources
    }
# GEOGRAPHY - DAMS
# --------------------------------------------------

@app.get("/api/dams")
def get_dams():

    dams = (
        geography_df["dam"]
        .dropna()
        .loc[geography_df["dam"].astype(str).str.strip() != ""]
        .unique()
        .tolist()
    )

    return {
        "count": len(dams),
        "dams": dams
    }
# --------------------------------------------------
# GEOGRAPHY - REGIONS
# --------------------------------------------------

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
    # --------------------------------------------------
# GEOGRAPHY - VILLAGES
# --------------------------------------------------

@app.get("/api/villages")
def get_villages():

    villages = geography_df.fillna("").to_dict(orient="records")

    return {
        "count": len(villages),
        "villages": villages
    }
    # --------------------------------------------------
# COMPLETE GEOGRAPHY DATA
# --------------------------------------------------

@app.get("/api/geography")
def get_geography():
    data = geography_df.fillna("").to_dict(orient="records")

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

    # Prototype baseline based on historical CSV rainfall.
    risk_result = calculate_flood_risk(rainfall)
    risk = risk_result["risk"]
    risk_score = risk_result["score"]

    return {
        "rainfall": {
            "date": str(latest["date"]),
            "rainfall_mm": rainfall,
            "temperature_c": float(latest["temperature_c"]),
            "humidity": humidity,
            "wind_speed": float(latest["wind_speed"])
        },

        "flood_risk": {
            "risk": risk,
            "score": risk_score
        },

        "zones": len(flood_df),

        "status": "Monitoring Active"
    }
# ==================================================
# LIVE WEATHER
# ==================================================

@app.get("/api/live-weather")
def get_live_weather():

    # Belagavi city coordinates
    latitude = 15.8497
    longitude = 74.4977

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}"
        f"&longitude={longitude}"
        "&current=temperature_2m,relative_humidity_2m,precipitation,"
        "rain,wind_speed_10m,weather_code"
        "&timezone=Asia%2FKolkata"
    )

    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())

        current = data["current"]

        return {
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
            "data_type": "Current weather model data"
        }

    except Exception as e:
        return {
            "status": "error",
            "message": "Unable to fetch live weather data",
            "error": str(e)
        }
