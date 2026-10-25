import React, { useEffect, useState } from "react";
import { apiUrl } from "../api";

function GeographyPanel() {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(apiUrl("/api/zone-population"))
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch zone data");
                }

                return response.json();
            })
            .then((data) => {
                setZones(data.data);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setError("Unable to load flood zone data");
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <section className="geography-dashboard">
                <h2>📊 Flood Zone Overview</h2>
                <p>Loading flood zone data...</p>
            </section>
        );
    }

    if (error) {
        return (
            <section className="geography-dashboard">
                <h2>📊 Flood Zone Overview</h2>
                <p>{error}</p>
            </section>
        );
    }

    const criticalZones = zones.filter(
        (zone) => zone.flood_risk === "Critical"
    ).length;

    const highZones = zones.filter(
        (zone) => zone.flood_risk === "High"
    ).length;

    const totalPopulation = zones.reduce(
        (sum, zone) =>
            sum + Number(zone.population_2011 || 0),
        0
    );

    const totalVillages = zones.reduce(
        (sum, zone) =>
            sum + Number(zone.villages_affected || 0),
        0
    );

    return (
        <section className="geography-dashboard">

            {/* HEADER */}

            <div className="geography-header">

                <div>
                    <h2>📊 Flood Zone Overview</h2>

                    <p>
                        Population and emergency conditions
                        across identified flood-prone zones.
                    </p>
                </div>

                <div className="monitoring-status">
                    <span className="status-dot"></span>
                    Monitoring Active
                </div>

            </div>


            {/* SUMMARY CARDS */}

            <div className="geography-summary">

                <div className="geo-summary-card">
                    <div className="geo-summary-icon">🌊</div>

                    <div>
                        <strong>{zones.length}</strong>
                        <span>Flood Zones</span>
                    </div>
                </div>


                <div className="geo-summary-card critical-summary">
                    <div className="geo-summary-icon">🚨</div>

                    <div>
                        <strong>{criticalZones}</strong>
                        <span>Critical Zones</span>
                    </div>
                </div>


                <div className="geo-summary-card high-summary">
                    <div className="geo-summary-icon">⚠️</div>

                    <div>
                        <strong>{highZones}</strong>
                        <span>High Risk Zones</span>
                    </div>
                </div>


                <div className="geo-summary-card">
                    <div className="geo-summary-icon">👥</div>

                    <div>
                        <strong>
                            {totalPopulation.toLocaleString()}
                        </strong>
                        <span>Census Population</span>
                    </div>
                </div>


                <div className="geo-summary-card">
                    <div className="geo-summary-icon">🏘️</div>

                    <div>
                        <strong>{totalVillages}</strong>
                        <span>Villages Affected</span>
                    </div>
                </div>

            </div>


            {/* ZONE TITLE */}

            <div className="zone-section-title">

                <div>
                    <h3>Flood Zone Details</h3>
                    <p>Emergency situation by taluk</p>
                </div>

                <span>
                    {zones.length} zones monitored
                </span>

            </div>


            {/* ZONE CARDS */}

            <div className="zone-dashboard-grid">

                {zones.map((zone) => (

                    <div
                        className={`zone-dashboard-card ${zone.flood_risk.toLowerCase()}`}
                        key={zone.taluk}
                    >

                        {/* HEADER */}

                        <div className="zone-card-header">

                            <div>
                                <h3>{zone.taluk}</h3>

                                <p>
                                    🌊 {zone.river}
                                </p>
                            </div>

                            <span
                                className={`zone-risk ${zone.flood_risk.toLowerCase()}`}
                            >
                                {zone.flood_risk}
                            </span>

                        </div>


                        {/* POPULATION */}

                        <div className="zone-population">

                            <div className="population-icon">
                                👥
                            </div>

                            <div>

                                <strong>
                                    {Number(
                                        zone.population_2011 || 0
                                    ).toLocaleString()}
                                </strong>

                                <span>
                                    Census Population
                                </span>

                            </div>

                        </div>


                        {/* METRICS */}

                        <div className="zone-metrics">

                            <div className="zone-metric">
                                <span>🏘️</span>

                                <div>
                                    <strong>
                                        {zone.villages_affected}
                                    </strong>

                                    <small>
                                        Villages
                                    </small>
                                </div>
                            </div>


                            <div className="zone-metric">
                                <span>🚑</span>

                                <div>
                                    <strong>
                                        {zone.rescue_teams_needed}
                                    </strong>

                                    <small>
                                        Rescue Teams
                                    </small>
                                </div>
                            </div>


                            <div className="zone-metric">
                                <span>🚤</span>

                                <div>
                                    <strong>
                                        {zone.boats_needed}
                                    </strong>

                                    <small>
                                        Boats
                                    </small>
                                </div>
                            </div>


                            <div className="zone-metric">
                                <span>📍</span>

                                <div>
                                    <strong>
                                        {zone.distance_from_hq_km}
                                    </strong>

                                    <small>
                                        km from HQ
                                    </small>
                                </div>
                            </div>

                        </div>


                        {/* FOOTER */}

                        <div className="zone-card-footer">

                            <span>
                                Emergency monitoring
                            </span>

                            <div className="active-indicator">
                                <span></span>
                                Active
                            </div>

                        </div>

                    </div>

                ))}

            </div>

        </section>
    );
}

export default GeographyPanel;
