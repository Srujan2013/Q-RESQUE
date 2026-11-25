import os
import json
import time
import logging
import urllib.request
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from backend.hidkal_scenarios import router as hidkal_scenarios_router
from backend.model_api import router as model_api_router
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.database import init_db, rows, one, insert, execute

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("q-rescue")

def calculate_flood_risk(rainfall: float) -> dict:
    if rainfall >= 100:
        risk, score = "Critical", 95
    elif rainfall >= 50:
        risk, score = "High", 75
    elif rainfall >= 20:
        risk, score = "Medium", 50
    else:
        risk, score = "Low", 20
    return {"risk": risk, "risk_score": score, "prediction_source": "baseline-model"}

class SimulationRequest(BaseModel):
    rainfall_mm: float = Field(ge=0, le=1000)
    population: int = Field(gt=0, le=10_000_000)

class DamRequest(BaseModel):
    dam_name: str = Field(min_length=1, max_length=200)
    river_name: Optional[str] = None
    district: str = "Belagavi"
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    gross_capacity_tmc: Optional[float] = Field(default=None, ge=0)
    frl_m: Optional[float] = Field(default=None, ge=0)
    mddl_m: Optional[float] = Field(default=None, ge=0)
    official_source_name: Optional[str] = None
    official_source_url: Optional[str] = None

class ObservationRequest(BaseModel):
    water_level_m: Optional[float] = None
    storage_tmc: Optional[float] = Field(default=None, ge=0)
    capacity_percent: Optional[float] = Field(default=None, ge=0, le=100)
    inflow_cusecs: Optional[float] = Field(default=None, ge=0)
    outflow_cusecs: Optional[float] = Field(default=None, ge=0)
    gate_status: Optional[str] = None
    observed_at: Optional[str] = None
    source_name: str = Field(min_length=1)
    source_url: Optional[str] = None
    data_status: str = Field(default="UNVERIFIED", pattern="^(LIVE|DELAYED|UNVERIFIED|MANUAL)$")
    notes: Optional[str] = None

class InspectionRequest(BaseModel):
    inspection_date: Optional[str] = None
    inspecting_authority: Optional[str] = None
    inspection_status: Optional[str] = None
    findings: Optional[str] = None
    report_url: Optional[str] = None

class AlertRequest(BaseModel):
    alert_type: str
    severity: str
    description: str
    issuer: Optional[str] = None
    issued_at: Optional[str] = None
    source_url: Optional[str] = None
    active: bool = True

app = FastAPI(title="Q-RESCUE API",
              description="Flood Risk Prediction and Emergency Resource Allocation",
              version="1.1.0")

app.include_router(hidkal_scenarios_router)
app.include_router(model_api_router)

origins = [x.strip().rstrip("/") for x in os.getenv("FRONTEND_ORIGINS", "").split(",") if x.strip()]
origins += [
    "https://q-resque.vercel.app",
    "https://q-resque-p3bg0l9bo-srujan2013s-projects.vercel.app",
    "http://localhost:5173", "http://localhost:5174",
    "http://127.0.0.1:5173", "http://127.0.0.1:5174",
]
app.add_middleware(CORSMiddleware, allow_origins=list(set(origins)),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
init_db()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "Data"

def read_data(filename, required):
    path = DATA_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Required dataset missing: {path}")
    df = pd.read_csv(path)
    missing = set(required) - set(df.columns)
    if missing:
        raise ValueError(f"{filename} missing columns: {sorted(missing)}")
    if df.empty:
        raise ValueError(f"{filename} is empty")
    return df

rainfall_df = read_data("belagavi_rainfall_2015_2023.csv",
    {"date","rainfall_mm","temperature_c","humidity_%","wind_speed"})
flood_df = read_data("belagavi_flood_zones.csv",
    {"taluk","river","latitude","longitude","flood_risk","villages_affected",
     "bridges_submerged","rescue_teams_needed","boats_needed","distance_from_hq_km","population"})
geography_df = read_data("belagavi_geography.csv", {"dam","region"})
population_df = read_data("belagavi_population_2011.csv", {"qrescue_taluk","population_2011"})

@app.get("/health")
def health():
    return {"status":"ok","service":"Q-RESCUE","message":"Q-RESCUE backend is running"}

@app.post("/api/simulate")
def simulate_flood(request: SimulationRequest):
    prediction = calculate_flood_risk(request.rainfall_mm)
    affected = round(request.population * 0.10 * prediction["risk_score"] / 100)
    return {
        "status":"success",
        "scenario":{"rainfall_mm":request.rainfall_mm,"population":request.population},
        "prediction":prediction,
        "estimated_affected_people":affected,
        "estimate_method":"Prototype estimate: population * 10% * risk_score / 100",
        "warning":"Illustrative simulation only. Not a validated hydrological flood forecast."
    }

@app.get("/api/population")
def get_population():
    data = population_df.fillna("").to_dict(orient="records")
    return {"count":len(data),"source":"Census 2011 Primary Census Abstract","data":data}

@app.get("/api/zone-population")
def get_zone_population():
    lookup = dict(zip(population_df.qrescue_taluk.astype(str).str.strip(), population_df.population_2011))
    data = []
    for _, z in flood_df.iterrows():
        taluk = str(z["taluk"]).strip()
        data.append({"taluk":taluk,"river":z["river"],"latitude":float(z["latitude"]),
            "longitude":float(z["longitude"]),"flood_risk":z["flood_risk"],
            "population_2011":lookup.get(taluk),"villages_affected":int(z["villages_affected"]),
            "bridges_submerged":int(z["bridges_submerged"]),
            "rescue_teams_needed":int(z["rescue_teams_needed"]),
            "boats_needed":int(z["boats_needed"]),
            "distance_from_hq_km":float(z["distance_from_hq_km"])})
    return {"count":len(data),"population_source":"Census 2011 Primary Census Abstract","data":data}

@app.get("/api/rainfall")
def get_rainfall():
    r = rainfall_df.iloc[-1]
    return {"date":str(r["date"]),"rainfall_mm":float(r["rainfall_mm"]),
        "temperature_c":float(r["temperature_c"]),"humidity":float(r["humidity_%"]),
        "wind_speed":float(r["wind_speed"]),"data_type":"Historical dataset"}

@app.get("/api/zones")
def get_zones():
    data = flood_df.fillna("").to_dict(orient="records")
    return {"count":len(data),"zones":data}

@app.get("/api/predict")
def predict_flood():
    r = rainfall_df.iloc[-1]
    result = calculate_flood_risk(float(r["rainfall_mm"]))
    return {**result,"rainfall_mm":float(r["rainfall_mm"]),
            "humidity":float(r["humidity_%"]),
            "data_type":"Prediction based on latest dataset record"}

@app.get("/api/resources")
def get_resources():
    lookup = dict(zip(population_df.qrescue_taluk.astype(str).str.strip(), population_df.population_2011))
    scores = {"Critical":100,"High":75,"Medium":50,"Low":25}
    result = []
    for _, z in flood_df.iterrows():
        taluk, risk = str(z["taluk"]).strip(), str(z["flood_risk"]).strip()
        census = lookup.get(taluk)
        if pd.isna(census):
            pop, pop_source = int(z["population"]), "Flood-zone dataset"
        else:
            pop, pop_source = int(census), "Census 2011 Primary Census Abstract"
        villages, distance = int(z["villages_affected"]), float(z["distance_from_hq_km"])
        priority = round(scores.get(risk,25)*.4 + min(pop/700000*100,100)*.3
                         + min(villages/60*100,100)*.2 + min(distance,100)*.1)
        ambulances = 4 if risk=="Critical" else 3 if risk=="High" else 2 if risk=="Medium" else 1
        affected = int(pop*.10)
        result.append({"taluk":taluk,"river":z["river"],"flood_risk":risk,
            "population":pop,"population_source":pop_source,"affected_people":affected,
            "affected_people_source":"Prototype estimate: 10% of population",
            "villages_affected":villages,"boats_needed":int(z["boats_needed"]),
            "rescue_teams_needed":int(z["rescue_teams_needed"]),
            "ambulances_needed":ambulances,"food_kits_needed":affected,
            "water_kits_needed":affected,"medical_kits_needed":max(1,int(affected*.2)),
            "shelter_kits_needed":max(1,int(affected*.2)),
            "life_jackets_needed":int(z["boats_needed"])*2,
            "priority_score":priority,"distance_from_hq_km":distance})
    result.sort(key=lambda x:x["priority_score"], reverse=True)
    return {"count":len(result),"resources":result}

@app.get("/api/dams")
def get_dams():
    data = geography_df[geography_df["dam"].fillna("").astype(str).str.strip()!=""].fillna("").to_dict(orient="records")
    return {"count":len(data),"dams":data}

@app.get("/api/regions")
def get_regions():
    data = geography_df["region"].dropna()
    return {"count":int(data.nunique()),"regions":data.astype(str).str.strip().loc[data.astype(str).str.strip()!=""].unique().tolist()}

@app.get("/api/villages")
def get_villages():
    data = geography_df.fillna("").to_dict(orient="records")
    return {"count":len(data),"villages":data}

@app.get("/api/geography")
def get_geography():
    data = geography_df.fillna("").to_dict(orient="records")
    return {"count":len(data),"data":data}

@app.get("/api/dashboard")
def dashboard():
    r = rainfall_df.iloc[-1]
    p = calculate_flood_risk(float(r["rainfall_mm"]))
    return {"rainfall":{"date":str(r["date"]),"rainfall_mm":float(r["rainfall_mm"]),
        "temperature_c":float(r["temperature_c"]),"humidity":float(r["humidity_%"]),
        "wind_speed":float(r["wind_speed"]),"data_type":"Historical dataset"},
        "flood_risk":{"risk":p["risk"],"score":p["risk_score"]},
        "zones":len(flood_df),"status":"Monitoring Active"}

WEATHER_CACHE = {"data":None,"cached_at":0.0}
WEATHER_CACHE_TTL = 600

@app.get("/api/live-weather")
def get_live_weather():
    lat, lon = 15.8497, 74.4977
    now, cached = time.time(), WEATHER_CACHE["data"]
    if cached is not None and now-WEATHER_CACHE["cached_at"] < WEATHER_CACHE_TTL:
        return {**cached,"cache_status":"cached"}
    providers = [
        ("Open-Meteo","https://api.open-meteo.com/v1/forecast"
         f"?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,weather_code&timezone=Asia%2FKolkata"),
        ("MET Norway","https://api.met.no/weatherapi/locationforecast/2.0/compact"
         f"?lat={lat}&lon={lon}")]
    errors=[]
    for provider,url in providers:
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"Q-RESCUE/1.0 (flood monitoring prototype)"})
            with urllib.request.urlopen(req,timeout=12) as response:
                data=json.loads(response.read().decode("utf-8"))
            if provider=="Open-Meteo":
                c=data["current"]
                result={"temperature_c":c.get("temperature_2m"),"humidity_percent":c.get("relative_humidity_2m"),
                    "precipitation_mm":c.get("precipitation"),"rain_mm":c.get("rain"),
                    "wind_speed_kmh":c.get("wind_speed_10m"),"weather_code":c.get("weather_code"),"timestamp":c.get("time")}
            else:
                c=data["properties"]["timeseries"][0]; d=c["data"]["instant"]["details"]
                nxt=c["data"].get("next_1_hours",{}); rd=nxt.get("details",{})
                ws=d.get("wind_speed")
                result={"temperature_c":d.get("air_temperature"),"humidity_percent":d.get("relative_humidity"),
                    "precipitation_mm":rd.get("precipitation_amount"),"rain_mm":rd.get("precipitation_amount"),
                    "wind_speed_kmh":ws*3.6 if ws is not None else None,
                    "weather_code":nxt.get("summary",{}).get("symbol_code"),"timestamp":c.get("time")}
            result.update({"location":"Belagavi","latitude":lat,"longitude":lon,
                "source":provider,"data_type":"Current weather model data","cache_status":"fresh"})
            WEATHER_CACHE.update({"data":result,"cached_at":time.time()})
            return result
        except Exception as exc:
            logger.warning("Weather provider %s failed: %s",provider,exc)
            errors.append(f"{provider}: {type(exc).__name__}")
    if cached is not None:
        return {**cached,"cache_status":"stale","warning":"All live weather refresh attempts failed."}
    return {"status":"unavailable","message":"All weather providers are temporarily unavailable.",
        "location":"Belagavi","temperature_c":None,"humidity_percent":None,
        "precipitation_mm":None,"rain_mm":None,"wind_speed_kmh":None,
        "weather_code":None,"source":None,"errors":errors}

# Dam monitoring database APIs. Records are stored as submitted; this does not
# connect to a live telemetry feed or certify structural safety.
@app.get("/api/dam-monitoring/dams")
def monitored_dams():
    data=rows("SELECT * FROM dams WHERE district=? ORDER BY dam_name",("Belagavi",))
    return {"count":len(data),"data_status":"DATABASE_RECORDS_ONLY","dams":data}

@app.post("/api/dam-monitoring/dams")
def create_dam(req: DamRequest):
    try:
        dam_id=insert("""INSERT INTO dams(dam_name,river_name,district,latitude,longitude,
            gross_capacity_tmc,frl_m,mddl_m,official_source_name,official_source_url)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (req.dam_name.strip(),req.river_name,req.district,req.latitude,req.longitude,
             req.gross_capacity_tmc,req.frl_m,req.mddl_m,req.official_source_name,req.official_source_url))
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(409,"Dam already exists")
        raise
    return {"status":"created","dam":one("SELECT * FROM dams WHERE id=?",(dam_id,))}


@app.delete("/api/dam-monitoring/dams/{dam_id}")
def delete_dam(dam_id: int):
    require_dam(dam_id)

    execute("DELETE FROM dam_observations WHERE dam_id=?", (dam_id,))
    execute("DELETE FROM dam_inspections WHERE dam_id=?", (dam_id,))
    execute("DELETE FROM dam_alerts WHERE dam_id=?", (dam_id,))
    execute("DELETE FROM dams WHERE id=?", (dam_id,))

    return {
        "status": "deleted",
        "dam_id": dam_id,
        "message": "Dam and associated records deleted successfully"
    }


def require_dam(dam_id):
    if not one("SELECT id FROM dams WHERE id=?",(dam_id,)):
        raise HTTPException(404,"Dam not found")

@app.get("/api/dam-monitoring/dams/{dam_id}/observations")
def list_observations(dam_id:int, limit:int=Query(50,ge=1,le=500)):
    require_dam(dam_id)
    data=rows("SELECT * FROM dam_observations WHERE dam_id=? ORDER BY fetched_at DESC LIMIT ?",(dam_id,limit))
    return {"dam_id":dam_id,"count":len(data),"observations":data}

@app.post("/api/dam-monitoring/dams/{dam_id}/observations")
def add_observation(dam_id:int, req:ObservationRequest):
    require_dam(dam_id)
    oid=insert("""INSERT INTO dam_observations(dam_id,water_level_m,storage_tmc,capacity_percent,
        inflow_cusecs,outflow_cusecs,gate_status,observed_at,source_name,source_url,data_status,notes)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (dam_id,req.water_level_m,req.storage_tmc,req.capacity_percent,req.inflow_cusecs,
         req.outflow_cusecs,req.gate_status,req.observed_at,req.source_name,req.source_url,req.data_status,req.notes))
    return {"status":"recorded","observation_id":oid,"data_status":req.data_status}

@app.get("/api/dam-monitoring/dams/{dam_id}/inspections")
def list_inspections(dam_id:int):
    require_dam(dam_id)
    data=rows("SELECT * FROM dam_inspections WHERE dam_id=? ORDER BY inspection_date DESC",(dam_id,))
    return {"dam_id":dam_id,"count":len(data),"inspections":data}

@app.post("/api/dam-monitoring/dams/{dam_id}/inspections")
def add_inspection(dam_id:int, req:InspectionRequest):
    require_dam(dam_id)
    iid=insert("""INSERT INTO dam_inspections(dam_id,inspection_date,inspecting_authority,
        inspection_status,findings,report_url) VALUES(?,?,?,?,?,?)""",
        (dam_id,req.inspection_date,req.inspecting_authority,req.inspection_status,req.findings,req.report_url))
    return {"status":"recorded","inspection_id":iid}

@app.get("/api/dam-monitoring/dams/{dam_id}/alerts")
def list_alerts(dam_id:int, active_only:bool=True):
    require_dam(dam_id)
    sql="SELECT * FROM dam_alerts WHERE dam_id=?"
    if active_only: sql += " AND active=1"
    sql += " ORDER BY issued_at DESC"
    data=rows(sql,(dam_id,))
    return {"dam_id":dam_id,"count":len(data),"alerts":data}

@app.post("/api/dam-monitoring/dams/{dam_id}/alerts")
def add_alert(dam_id:int, req:AlertRequest):
    require_dam(dam_id)
    aid=insert("""INSERT INTO dam_alerts(dam_id,alert_type,severity,description,issuer,issued_at,source_url,active)
        VALUES(?,?,?,?,?,?,?,?)""",
        (dam_id,req.alert_type,req.severity,req.description,req.issuer,req.issued_at,req.source_url,int(req.active)))
    return {"status":"recorded","alert_id":aid}

@app.get("/api/dam-monitoring/summary")
def dam_summary():
    dams=rows("SELECT * FROM dams WHERE district=? ORDER BY dam_name",("Belagavi",))
    summary=[]
    for dam in dams:
        obs=rows("SELECT * FROM dam_observations WHERE dam_id=? ORDER BY fetched_at DESC LIMIT 1",(dam["id"],))
        ins=rows("SELECT * FROM dam_inspections WHERE dam_id=? ORDER BY inspection_date DESC LIMIT 1",(dam["id"],))
        alert=rows("SELECT COUNT(*) AS n FROM dam_alerts WHERE dam_id=? AND active=1",(dam["id"],))
        summary.append({**dam,"latest_observation":obs[0] if obs else None,
            "latest_inspection":ins[0] if ins else None,"active_alert_count":alert[0]["n"],
            "measurement_status":obs[0]["data_status"] if obs else "UNAVAILABLE"})
    return {"count":len(summary),"dams":summary,
        "warning":"Stored records only. No live dam telemetry is connected and no structural safety certification is inferred."}
