import pandas as pd

belagavi_data = {
    'taluk': [
        'Chikkodi', 'Nippani', 'Raibag',
        'Athani', 'Kagwad', 'Gokak',
        'Hukkeri', 'Khanapur', 'Bailhongal',
        'Savadatti'
    ],
    'river': [
        'Krishna', 'Krishna', 'Krishna',
        'Krishna', 'Krishna', 'Ghataprabha',
        'Hiranyakeshi', 'Malaprabha', 'Malaprabha',
        'Malaprabha'
    ],
    'latitude': [
        16.43, 16.40, 16.49,
        16.73, 16.58, 16.16,
        16.23, 15.64, 15.80,
        15.76
    ],
    'longitude': [
        74.59, 74.38, 74.77,
        75.07, 74.71, 74.82,
        74.52, 74.64, 75.00,
        75.06
    ],
    'population': [
        45000, 38000, 22000,
        31000, 18000, 62000,
        28000, 19000, 35000,
        24000
    ],
    'flood_risk': [
        'Critical', 'Critical', 'High',
        'High', 'Medium', 'Critical',
        'High', 'Medium', 'Low',
        'Medium'
    ],
    'villages_affected': [
        45, 38, 22, 28, 15, 52, 30, 12, 8, 18
    ],
    'bridges_submerged': [
        5, 4, 3, 2, 1, 6, 3, 2, 1, 2
    ],
    'rescue_teams_needed': [
        4, 3, 2, 2, 1, 5, 3, 1, 1, 2
    ],
    'boats_needed': [
        3, 3, 2, 2, 1, 4, 2, 1, 0, 1
    ],
    'distance_from_hq_km': [
        55, 46, 72, 95, 68, 80, 42, 38, 48, 60
    ]
}

df = pd.DataFrame(belagavi_data)
df.to_csv('Data/belagavi_flood_zones.csv', index=False)
print("✅ Saved: belagavi_flood_zones.csv")
print(df)
