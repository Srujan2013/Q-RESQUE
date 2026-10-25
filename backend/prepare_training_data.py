from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "Data"

INPUT_FILE = DATA_DIR / "belagavi_rainfall_2015_2023.csv"
OUTPUT_FILE = DATA_DIR / "qrescue_weather_training.csv"

# Load historical weather data
df = pd.read_csv(INPUT_FILE)

# Parse dates and sort chronologically
df["date"] = pd.to_datetime(
    df["date"].astype(str),
    format="%Y%m%d",
    errors="coerce"
)

df = df.dropna(subset=["date"]).sort_values("date")

# Ensure weather measurements are numeric
weather_columns = [
    "rainfall_mm",
    "temperature_c",
    "humidity_%",
    "wind_speed",
]

for column in weather_columns:
    df[column] = pd.to_numeric(df[column], errors="coerce")

df = df.dropna(subset=weather_columns)

# Add cumulative rainfall features
df["rainfall_3day_mm"] = (
    df["rainfall_mm"]
    .rolling(window=3, min_periods=3)
    .sum()
)

df["rainfall_7day_mm"] = (
    df["rainfall_mm"]
    .rolling(window=7, min_periods=7)
    .sum()
)

# Add calendar features
df["month"] = df["date"].dt.month
df["day_of_year"] = df["date"].dt.dayofyear

# Remove rows without complete rolling windows
df = df.dropna().reset_index(drop=True)

# Save prepared features. Flood labels will be added separately
# when reliable historical event data is available.
df.to_csv(OUTPUT_FILE, index=False)

print("Q-RESCUE training data preparation complete")
print("Output:", OUTPUT_FILE)
print("Rows:", len(df))
print("Columns:", list(df.columns))
print("\nPreview:")
print(df.head().to_string(index=False))
