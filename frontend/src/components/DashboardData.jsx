import React, { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api";

function DashboardData() {
    const [dashboard, setDashboard] = useState(null);
    const [liveWeather, setLiveWeather] = useState(null);

    const [loading, setLoading] = useState(true);
    const [weatherLoading, setWeatherLoading] = useState(true);

    const [error, setError] = useState("");
    const [weatherError, setWeatherError] = useState("");

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("All");
    const [sortAsc, setSortAsc] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState(null);

    // =========================================================
    // FETCH DASHBOARD DATA
    // =========================================================

    useEffect(() => {
        fetch(apiUrl("/api/dashboard"))
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch dashboard data");
                }

                return response.json();
            })
            .then((data) => {
                setDashboard(data);
                setLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setError("Unable to connect to Q-RESCUE backend");
                setLoading(false);
            });
    }, []);

    // =========================================================
    // FETCH LIVE WEATHER
    // =========================================================

    useEffect(() => {
        const fetchLiveWeather = () => {
            setWeatherLoading(true);

            fetch(apiUrl("/api/live-weather"))
                .then((response) => {
                    if (!response.ok) {
                        throw new Error("Failed to fetch live weather");
                    }

                    return response.json();
                })
                .then((data) => {
                    if (data.status === "error") {
                        throw new Error(data.message);
                    }

                    setLiveWeather(data);
                    setWeatherError("");
                    setWeatherLoading(false);
                })
                .catch((error) => {
                    console.error(error);
                    setWeatherError("Unable to fetch live weather");
                    setWeatherLoading(false);
                });
        };

        fetchLiveWeather();

        // Refresh current weather every 5 minutes
        const weatherInterval = setInterval(
            fetchLiveWeather,
            5 * 60 * 1000
        );

        return () => clearInterval(weatherInterval);
    }, []);

    // =========================================================
    // WEATHER CONDITION
    // =========================================================

    const getWeatherCondition = (code) => {
        const weatherCodes = {
            0: "Clear",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Fog",
            48: "Rime fog",
            51: "Light drizzle",
            53: "Moderate drizzle",
            55: "Dense drizzle",
            61: "Light rain",
            63: "Moderate rain",
            65: "Heavy rain",
            71: "Light snow",
            73: "Moderate snow",
            75: "Heavy snow",
            80: "Rain showers",
            81: "Moderate rain showers",
            82: "Heavy rain showers",
            95: "Thunderstorm",
            96: "Thunderstorm with hail",
            99: "Severe thunderstorm with hail",
        };

        return weatherCodes[code] || "Unknown";
    };

    // =========================================================
    // CREATE MONITORING METRICS
    // =========================================================

    const metrics = useMemo(() => {
        if (!dashboard) {
            return [];
        }

        const rainfall = liveWeather
            ? Number(liveWeather.rain_mm || 0)
            : Number(dashboard.rainfall.rainfall_mm || 0);

        const temperature = liveWeather
            ? Number(liveWeather.temperature_c || 0)
            : Number(dashboard.rainfall.temperature_c || 0);

        const humidity = liveWeather
            ? Number(liveWeather.humidity_percent || 0)
            : Number(dashboard.rainfall.humidity || 0);

        const windSpeed = liveWeather
            ? Number(liveWeather.wind_speed_kmh || 0)
            : Number(dashboard.rainfall.wind_speed || 0);

        const weatherCondition = liveWeather
            ? getWeatherCondition(liveWeather.weather_code)
            : "Historical data";

        return [
            {
                id: "rainfall",
                metric: "Rainfall",
                category: "Weather",
                value: `${rainfall} mm`,
                rawValue: rainfall,
                percentage: Math.min(rainfall, 100),
                status:
                    rainfall >= 100
                        ? "Critical"
                        : rainfall >= 50
                            ? "High"
                            : rainfall >= 20
                                ? "Medium"
                                : "Low",
                icon: "🌧️",
                description: liveWeather
                    ? "Current rainfall from live weather API"
                    : "Latest recorded rainfall",
            },

            {
                id: "temperature",
                metric: "Temperature",
                category: "Weather",
                value: `${temperature} °C`,
                rawValue: temperature,
                percentage: Math.min(
                    (temperature / 40) * 100,
                    100
                ),
                status: "Normal",
                icon: "🌡️",
                description: liveWeather
                    ? "Current temperature from live weather API"
                    : "Latest recorded temperature",
            },

            {
                id: "humidity",
                metric: "Humidity",
                category: "Weather",
                value: `${humidity}%`,
                rawValue: humidity,
                percentage: humidity,
                status:
                    humidity >= 80
                        ? "High"
                        : "Normal",
                icon: "💧",
                description: liveWeather
                    ? "Current atmospheric humidity"
                    : "Atmospheric humidity",
            },

            {
                id: "wind",
                metric: "Wind Speed",
                category: "Weather",
                value: `${windSpeed} km/h`,
                rawValue: windSpeed,
                percentage: Math.min(
                    (windSpeed / 60) * 100,
                    100
                ),
                status:
                    windSpeed >= 40
                        ? "High"
                        : "Normal",
                icon: "💨",
                description: liveWeather
                    ? "Current wind speed from live weather API"
                    : "Latest recorded wind speed",
            },

            {
                id: "condition",
                metric: "Weather Condition",
                category: "Weather",
                value: weatherCondition,
                rawValue: liveWeather
                    ? liveWeather.weather_code
                    : 0,
                percentage: 100,
                status: "Monitoring",
                icon: "☁️",
                description: liveWeather
                    ? "Current weather condition"
                    : "Historical weather condition",
            },

            {
                id: "risk",
                metric: "Flood Risk",
                category: "Risk",
                value: dashboard.flood_risk.risk,
                rawValue: dashboard.flood_risk.score,
                percentage: dashboard.flood_risk.score,
                status: dashboard.flood_risk.risk,
                icon: "⚠️",
                description: "Current flood risk level",
            },

            {
                id: "risk-score",
                metric: "Risk Score",
                category: "Risk",
                value: `${dashboard.flood_risk.score} / 100`,
                rawValue: dashboard.flood_risk.score,
                percentage: dashboard.flood_risk.score,
                status: dashboard.flood_risk.risk,
                icon: "📊",
                description: "Current flood risk score",
            },

            {
                id: "zones",
                metric: "Flood Zones",
                category: "Monitoring",
                value: dashboard.zones,
                rawValue: dashboard.zones,
                percentage: Math.min(
                    (dashboard.zones / 20) * 100,
                    100
                ),
                status: "Monitoring",
                icon: "📍",
                description: "Flood zones currently monitored",
            },

            {
                id: "system",
                metric: "System Status",
                category: "Monitoring",
                value: dashboard.status,
                rawValue: 1,
                percentage: 100,
                status: "Active",
                icon: "🛰️",
                description: "Q-RESCUE monitoring system",
            },
        ];
    }, [dashboard, liveWeather]);

    // =========================================================
    // FILTER + SEARCH + SORT
    // =========================================================

    const filteredMetrics = useMemo(() => {
        let result = [...metrics];

        if (filter !== "All") {
            result = result.filter(
                (item) => item.category === filter
            );
        }

        if (search.trim()) {
            const query = search.toLowerCase();

            result = result.filter(
                (item) =>
                    item.metric
                        .toLowerCase()
                        .includes(query) ||
                    item.category
                        .toLowerCase()
                        .includes(query) ||
                    String(item.value)
                        .toLowerCase()
                        .includes(query) ||
                    item.description
                        .toLowerCase()
                        .includes(query)
            );
        }

        result.sort((a, b) =>
            sortAsc
                ? a.rawValue - b.rawValue
                : b.rawValue - a.rawValue
        );

        return result;
    }, [metrics, filter, search, sortAsc]);

    // =========================================================
    // INDICATOR COUNTS
    // =========================================================

    const criticalCount = metrics.filter(
        (item) => item.status === "Critical"
    ).length;

    const highCount = metrics.filter(
        (item) => item.status === "High"
    ).length;

    // =========================================================
    // LOADING STATE
    // =========================================================

    if (loading) {
        return (
            <section className="dashboard-data">
                <div className="loading-state">
                    Loading Q-RESCUE monitoring data...
                </div>
            </section>
        );
    }

    // =========================================================
    // ERROR STATE
    // =========================================================

    if (error || !dashboard) {
        return (
            <section className="dashboard-data">
                <div className="error-state">
                    {error || "Unable to load dashboard"}
                </div>
            </section>
        );
    }

    return (
        <section className="dashboard-data" id="monitoring">

            {/* =================================================
                HEADER
            ================================================= */}

            <div className="dashboard-header">

                <div>

                    <div className="live-badge">
                        <span className="status-dot green"></span>
                        LIVE MONITORING
                    </div>

                    <h2>
                        Live Monitoring Dashboard
                    </h2>

                    <p>
                        Real-time environmental conditions
                        and flood monitoring status.
                    </p>

                </div>

                <div className="dashboard-date">

                    <span>
                        Weather Update
                    </span>

                    <strong>
                        {liveWeather
                            ? liveWeather.timestamp
                            : "Loading..."}
                    </strong>

                </div>

            </div>


            {/* =================================================
                LIVE WEATHER STATUS
            ================================================= */}

            <div className="live-weather-banner">

                <div className="live-weather-source">

                    <span className="live-pulse">
                        🟢
                    </span>

                    <div>
                        <strong>
                            LIVE WEATHER
                        </strong>

                        <small>
                            {liveWeather
                                ? `Current conditions for ${liveWeather.location}`
                                : "Connecting to weather service..."}
                        </small>
                    </div>

                </div>

                <div className="weather-source-text">

                    <span>
                        Source: Open-Meteo
                    </span>

                    <small>
                        Current weather model data
                    </small>

                </div>

            </div>


            {/* =================================================
                MAIN DASHBOARD PANELS
            ================================================= */}

            <div className="dashboard-panels">

                {/* ---------------------------------------------
                    PANEL 1: LIVE WEATHER
                --------------------------------------------- */}

                <div className="dashboard-panel">

                    <div className="panel-header">

                        <div className="panel-icon">
                            🌦️
                        </div>

                        <div>

                            <h3>
                                Current Weather
                            </h3>

                            <p>
                                {liveWeather
                                    ? liveWeather.location
                                    : "Loading weather..."}
                            </p>

                        </div>

                    </div>


                    {weatherLoading ? (

                        <div className="weather-loading">
                            Fetching current weather...
                        </div>

                    ) : weatherError ? (

                        <div className="weather-error">
                            {weatherError}
                        </div>

                    ) : liveWeather ? (

                        <div className="panel-metrics">

                            <div className="panel-metric">

                                <div className="metric-label">
                                    🌧️ Rainfall
                                </div>

                                <strong>
                                    {liveWeather.rain_mm} mm
                                </strong>

                                <small>
                                    Current reading
                                </small>

                            </div>


                            <div className="panel-metric">

                                <div className="metric-label">
                                    🌡️ Temperature
                                </div>

                                <strong>
                                    {liveWeather.temperature_c}°C
                                </strong>

                                <small>
                                    Current reading
                                </small>

                            </div>


                            <div className="panel-metric">

                                <div className="metric-label">
                                    💧 Humidity
                                </div>

                                <strong>
                                    {liveWeather.humidity_percent}%
                                </strong>

                                <small>
                                    Atmospheric
                                </small>

                            </div>


                            <div className="panel-metric">

                                <div className="metric-label">
                                    💨 Wind
                                </div>

                                <strong>
                                    {liveWeather.wind_speed_kmh} km/h
                                </strong>

                                <small>
                                    Current speed
                                </small>

                            </div>


                            <div className="panel-metric">

                                <div className="metric-label">
                                    ☁️ Condition
                                </div>

                                <strong>
                                    {getWeatherCondition(
                                        liveWeather.weather_code
                                    )}
                                </strong>

                                <small>
                                    Weather condition
                                </small>

                            </div>

                        </div>

                    ) : null}

                </div>


                {/* ---------------------------------------------
                    PANEL 2: FLOOD RISK
                --------------------------------------------- */}

                <div className="dashboard-panel">

                    <div className="panel-header">

                        <div className="panel-icon">
                            ⚠️
                        </div>

                        <div>

                            <h3>
                                Flood Risk
                            </h3>

                            <p>
                                Current risk assessment
                            </p>

                        </div>

                    </div>


                    <div className="risk-display">

                        <div className="risk-main">

                            <span>
                                Current Risk
                            </span>

                            <strong
                                className={
                                    dashboard
                                        .flood_risk
                                        .risk
                                        .toLowerCase()
                                }
                            >
                                {
                                    dashboard
                                        .flood_risk
                                        .risk
                                }
                            </strong>

                        </div>


                        <div className="risk-score">

                            <div className="score-header">

                                <span>
                                    Risk Score
                                </span>

                                <strong>
                                    {
                                        dashboard
                                            .flood_risk
                                            .score
                                    }
                                    /100
                                </strong>

                            </div>


                            <div className="score-bar">

                                <div
                                    className={
                                        dashboard
                                            .flood_risk
                                            .risk
                                            .toLowerCase()
                                    }
                                    style={{
                                        width: `${dashboard
                                            .flood_risk
                                            .score
                                            }%`,
                                    }}
                                ></div>

                            </div>


                            <div className="score-scale">

                                <span>Low</span>
                                <span>Medium</span>
                                <span>High</span>
                                <span>Critical</span>

                            </div>

                        </div>

                    </div>

                </div>


                {/* ---------------------------------------------
                    PANEL 3: SYSTEM MONITORING
                --------------------------------------------- */}

                <div className="dashboard-panel">

                    <div className="panel-header">

                        <div className="panel-icon">
                            🛰️
                        </div>

                        <div>

                            <h3>
                                System Monitoring
                            </h3>

                            <p>
                                Q-RESCUE operational status
                            </p>

                        </div>

                    </div>


                    <div className="system-metrics">

                        <div className="system-metric">

                            <span>
                                🟢 System Status
                            </span>

                            <strong className="active-text">
                                Active
                            </strong>

                        </div>


                        <div className="system-metric">

                            <span>
                                📍 Flood Zones
                            </span>

                            <strong>
                                {dashboard.zones}
                            </strong>

                        </div>


                        <div className="system-metric">

                            <span>
                                📡 Monitoring
                            </span>

                            <strong>
                                {dashboard.zones} zones
                            </strong>

                        </div>


                        <div className="system-metric">

                            <span>
                                🔄 Service
                            </span>

                            <strong className="active-text">
                                Online
                            </strong>

                        </div>

                    </div>

                </div>

            </div>


            {/* =================================================
                QUICK STATUS BAR
            ================================================= */}

            <div className="quick-status">

                <div>
                    <span className="status-dot green"></span>
                    System Operational
                </div>

                <div>
                    <span className="status-dot red"></span>
                    Critical Indicators:{" "}
                    <strong>{criticalCount}</strong>
                </div>

                <div>
                    <span className="status-dot orange"></span>
                    High Indicators:{" "}
                    <strong>{highCount}</strong>
                </div>

                <div>
                    📡 Monitoring{" "}
                    <strong>{dashboard.zones}</strong>{" "}
                    flood zones
                </div>

            </div>


            {/* =================================================
                TABLE HEADER
            ================================================= */}

            <div className="table-section-header">

                <div>

                    <h3>
                        📋 Monitoring Metrics
                    </h3>

                    <p>
                        Click any row to view additional details.
                    </p>

                </div>

                <span className="metric-count">
                    {filteredMetrics.length} metrics
                </span>

            </div>


            {/* =================================================
                CONTROLS
            ================================================= */}

            <div className="monitoring-controls">

                <div className="search-box">

                    <span>
                        🔎
                    </span>

                    <input
                        type="text"
                        placeholder="Search monitoring data..."
                        value={search}
                        onChange={(event) =>
                            setSearch(event.target.value)
                        }
                    />

                    {search && (
                        <button
                            className="clear-search"
                            onClick={() => setSearch("")}
                        >
                            ×
                        </button>
                    )}

                </div>


                <select
                    value={filter}
                    onChange={(event) =>
                        setFilter(event.target.value)
                    }
                >

                    <option value="All">
                        All Categories
                    </option>

                    <option value="Weather">
                        Weather
                    </option>

                    <option value="Risk">
                        Risk
                    </option>

                    <option value="Monitoring">
                        Monitoring
                    </option>

                </select>


                <button
                    type="button"
                    className="sort-button"
                    onClick={() => setSortAsc(!sortAsc)}
                >
                    {sortAsc
                        ? "↑ Lowest First"
                        : "↓ Highest First"}
                </button>

            </div>


            {/* =================================================
                MONITORING TABLE
            ================================================= */}

            <div className="monitoring-table-container">

                <table className="monitoring-table">

                    <thead>

                        <tr>

                            <th>
                                Metric
                            </th>

                            <th>
                                Category
                            </th>

                            <th>
                                Current Value
                            </th>

                            <th>
                                Status
                            </th>

                            <th>
                                Level
                            </th>

                            <th>
                                Description
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        {filteredMetrics.length === 0 ? (

                            <tr>

                                <td
                                    colSpan="6"
                                    className="no-results"
                                >
                                    🔎 No monitoring data found.
                                </td>

                            </tr>

                        ) : (

                            filteredMetrics.map((item) => (

                                <tr
                                    key={item.id}
                                    className={
                                        selectedMetric === item.id
                                            ? "selected-row"
                                            : ""
                                    }
                                    onClick={() =>
                                        setSelectedMetric(
                                            selectedMetric === item.id
                                                ? null
                                                : item.id
                                        )
                                    }
                                >

                                    <td>

                                        <div className="metric-name">

                                            <span className="metric-icon">
                                                {item.icon}
                                            </span>

                                            <strong>
                                                {item.metric}
                                            </strong>

                                        </div>

                                    </td>


                                    <td>

                                        <span className="category-badge">
                                            {item.category}
                                        </span>

                                    </td>


                                    <td>

                                        <strong className="metric-value">
                                            {item.value}
                                        </strong>

                                    </td>


                                    <td>

                                        <span
                                            className={`status-badge ${item.status
                                                .toLowerCase()
                                                .replace(
                                                    /\s+/g,
                                                    "-"
                                                )}`}
                                        >
                                            {item.status}
                                        </span>

                                    </td>


                                    <td>

                                        <div className="level-container">

                                            <div className="level-bar">

                                                <div
                                                    className={`level-fill ${item.status
                                                        .toLowerCase()
                                                        .replace(
                                                            /\s+/g,
                                                            "-"
                                                        )}`}
                                                    style={{
                                                        width: `${item.percentage}%`,
                                                    }}
                                                ></div>

                                            </div>

                                            <span>
                                                {Math.round(
                                                    item.percentage
                                                )}
                                                %
                                            </span>

                                        </div>

                                    </td>


                                    <td className="metric-description">

                                        {item.description}

                                    </td>

                                </tr>

                            ))

                        )}

                    </tbody>

                </table>

            </div>


            {/* =================================================
                SELECTED METRIC DETAILS
            ================================================= */}

            {selectedMetric && (

                <div className="metric-details">

                    {(() => {

                        const selected =
                            metrics.find(
                                (item) =>
                                    item.id === selectedMetric
                            );

                        if (!selected) {
                            return null;
                        }

                        return (
                            <>

                                <div className="details-icon">
                                    {selected.icon}
                                </div>


                                <div className="details-content">

                                    <div className="details-title">

                                        <h3>
                                            {selected.metric}
                                        </h3>

                                        <span
                                            className={`status-badge ${selected.status
                                                .toLowerCase()
                                                .replace(
                                                    /\s+/g,
                                                    "-"
                                                )}`}
                                        >
                                            {selected.status}
                                        </span>

                                    </div>


                                    <p>
                                        {selected.description}
                                    </p>


                                    <div className="details-stats">

                                        <span>
                                            Current Value
                                            <b>
                                                {selected.value}
                                            </b>
                                        </span>

                                        <span>
                                            Category
                                            <b>
                                                {selected.category}
                                            </b>
                                        </span>

                                        <span>
                                            Level
                                            <b>
                                                {Math.round(
                                                    selected.percentage
                                                )}
                                                %
                                            </b>
                                        </span>

                                    </div>

                                </div>

                            </>
                        );

                    })()}

                </div>

            )}

        </section>
    );
}

export default DashboardData;
