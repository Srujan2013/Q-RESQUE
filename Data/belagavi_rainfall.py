import requests
import pandas as pd

# NASA POWER API - Belagavi coordinates
url = "https://power.larc.nasa.gov/api/temporal/daily/point"

params = {
    "parameters": "PRECTOTCORR,T2M,RH2M,WS2M",
    "community": "AG",
    "longitude": 74.50,
    "latitude": 15.86,
    "start": "20150101",
    "end": "20231231",
    "format": "JSON"
}

print("Downloading Belagavi weather data from NASA...")
response = requests.get(url, params=params)
data = response.json()

properties = data['properties']['parameter']
df = pd.DataFrame(properties)
df.index.name = 'date'
df.columns = ['rainfall_mm', 'temperature_c', 'humidity_%', 'wind_speed']
df.to_csv('Data/belagavi_rainfall_2015_2023.csv')
print("✅ Saved: belagavi_rainfall_2015_2023.csv")
print(df.head(10))
