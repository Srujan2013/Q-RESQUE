from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
FILE = BASE_DIR / "Data" / "qrescue_weather_training.csv"

df = pd.read_csv(FILE)

print("Q-RESCUE TRAINING DATA CHECK")
print("=" * 40)
print("Total records:", len(df))
print("Date range:", df["date"].min(), "to", df["date"].max())
print("Missing values:")
print(df.isnull().sum())
print("\nWeather statistics:")
print(df[[
    "rainfall_mm",
    "temperature_c",
    "humidity_%",
    "wind_speed",
    "rainfall_3day_mm",
    "rainfall_7day_mm"
]].describe().round(2))

print("\nRainfall distribution:")
print(df["rainfall_mm"].describe())
