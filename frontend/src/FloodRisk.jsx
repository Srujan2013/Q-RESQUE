import React, { useEffect, useState } from "react";
import "./App.css";
import { apiUrl } from "./api";

function FloodRisk() {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(apiUrl("/api/zones"))
            .then((response) => response.json())
            .then((data) => {
                setZones(data.zones);
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error fetching zones:", error);
                setLoading(false);
            });
    }, []);

    const getRiskClass = (risk) => {
        if (risk === "Critical") return "risk-critical";
        if (risk === "High") return "risk-high";
        if (risk === "Medium") return "risk-medium";
        return "risk-low";
    };

    if (loading) {
        return <div className="page-container">Loading flood risk data...</div>;
    }

    return (
        <div className="page-container">

            <h1>⚠️ Flood Risk Analysis</h1>

            <p className="page-subtitle">
                Real-time flood risk information for Belagavi district
            </p>

            <div className="risk-grid">

                {zones.map((zone) => (
                    <div className="risk-zone-card" key={zone.taluk}>

                        <div className="zone-header">
                            <div>
                                <h2>{zone.taluk}</h2>
                                <p>🌊 {zone.river} River</p>
                            </div>

                            <span className={`risk-badge ${getRiskClass(zone.flood_risk)}`}>
                                {zone.flood_risk}
                            </span>
                        </div>

                        <div className="zone-stats">

                            <div>
                                <strong>👥</strong>
                                <span>Population</span>
                                <b>{zone.population.toLocaleString()}</b>
                            </div>

                            <div>
                                <strong>🏘️</strong>
                                <span>Villages</span>
                                <b>{zone.villages_affected}</b>
                            </div>

                            <div>
                                <strong>🌉</strong>
                                <span>Bridges</span>
                                <b>{zone.bridges_submerged}</b>
                            </div>

                            <div>
                                <strong>🚑</strong>
                                <span>Rescue Teams</span>
                                <b>{zone.rescue_teams_needed}</b>
                            </div>

                            <div>
                                <strong>🚤</strong>
                                <span>Boats</span>
                                <b>{zone.boats_needed}</b>
                            </div>

                            <div>
                                <strong>📍</strong>
                                <span>Distance</span>
                                <b>{zone.distance_from_hq_km} km</b>
                            </div>

                        </div>

                    </div>
                ))}

            </div>
        </div>
    );
}

export default FloodRisk;
