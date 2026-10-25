import React, { useEffect, useState } from "react";
import { apiUrl } from "../api";

function Resources() {
    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(apiUrl("/api/resources"))
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch resources");
                }

                return response.json();
            })
            .then((data) => {
                const sortedResources = [...data.resources].sort(
                    (a, b) => b.priority_score - a.priority_score
                );

                setResources(sortedResources);
                setLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setError("Unable to load resource data");
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <section className="resources-section">
                <h2>Emergency Resource Allocation</h2>
                <p>Loading resource data...</p>
            </section>
        );
    }

    if (error) {
        return (
            <section className="resources-section">
                <h2>Emergency Resource Allocation</h2>
                <p>{error}</p>
            </section>
        );
    }

    const topThree = resources.slice(0, 3);

    return (
        <section className="resources-section">

            {/* HEADER */}
            <div className="resources-header">
                <div>
                    <h2>Emergency Resource Allocation</h2>

                    <p>
                        Zones are ranked using prototype weights for flood risk,
                        population, affected villages, and proximity to headquarters.
                    </p>

                    <p className="resource-note">
                        Priority scores are experimental decision-support estimates,
                        not validated emergency deployment instructions.
                    </p>
                </div>
            </div>


            {/* TOP 3 PRIORITY ZONES */}
            <div className="priority-section">

                <h3>🚨 Top Emergency Priority Zones</h3>

                <div className="priority-grid">

                    {topThree.map((zone, index) => (

                        <div
                            className={`priority-card priority-${index + 1}`}
                            key={zone.taluk}
                        >

                            <div className="priority-rank">
                                #{index + 1}
                            </div>

                            <div className="priority-info">

                                <h4>{zone.taluk}</h4>

                                <span
                                    className={`risk-badge ${zone.flood_risk.toLowerCase()}`}
                                >
                                    {zone.flood_risk}
                                </span>

                                <div className="priority-score">
                                    Priority Score:
                                    <strong>
                                        {Number(zone.priority_score).toFixed(2)}
                                    </strong>
                                </div>

                            </div>


                            <div className="priority-resources">

                                <div>
                                    <span>👥</span>
                                    <strong>
                                        {zone.affected_people.toLocaleString()}
                                    </strong>
                                    <small>
                                        Estimated Affected
                                    </small>
                                </div>

                                <div>
                                    <span>🚑</span>
                                    <strong>
                                        {zone.ambulances_needed}
                                    </strong>
                                    <small>
                                        Ambulances
                                    </small>
                                </div>

                                <div>
                                    <span>🚤</span>
                                    <strong>
                                        {zone.boats_needed}
                                    </strong>
                                    <small>
                                        Boats
                                    </small>
                                </div>

                                <div>
                                    <span>👨‍🚒</span>
                                    <strong>
                                        {zone.rescue_teams_needed}
                                    </strong>
                                    <small>
                                        Rescue Teams
                                    </small>
                                </div>

                            </div>

                        </div>

                    ))}

                </div>

            </div>


            {/* RESOURCE TABLE */}
            <div className="table-container">

                <table className="resource-table">

                    <thead>

                        <tr>

                            <th>Priority</th>
                            <th>Area</th>
                            <th>River</th>
                            <th>Risk</th>
                            <th>Population</th>
                            <th>Estimated Affected</th>
                            <th>Villages</th>
                            <th>Boats</th>
                            <th>Rescue Teams</th>
                            <th>Ambulances</th>
                            <th>Food Kits</th>
                            <th>Water Kits</th>
                            <th>Medical Kits</th>
                            <th>Shelter Kits</th>
                            <th>Life Jackets</th>
                            <th>Priority Score</th>

                        </tr>

                    </thead>


                    <tbody>

                        {resources.map((zone, index) => (

                            <tr key={zone.taluk}>

                                <td>
                                    <span className="priority-number">
                                        #{index + 1}
                                    </span>
                                </td>

                                <td>{zone.taluk}</td>

                                <td>{zone.river}</td>

                                <td>

                                    <span
                                        className={`risk-badge ${zone.flood_risk.toLowerCase()}`}
                                    >
                                        {zone.flood_risk}
                                    </span>

                                </td>

                                <td>
                                    {zone.population.toLocaleString()}
                                </td>

                                <td>
                                    {zone.affected_people.toLocaleString()}
                                </td>

                                <td>
                                    {zone.villages_affected}
                                </td>

                                <td>
                                    {zone.boats_needed}
                                </td>

                                <td>
                                    {zone.rescue_teams_needed}
                                </td>

                                <td>
                                    {zone.ambulances_needed}
                                </td>

                                <td>
                                    {zone.food_kits_needed.toLocaleString()}
                                </td>

                                <td>
                                    {zone.water_kits_needed.toLocaleString()}
                                </td>

                                <td>
                                    {zone.medical_kits_needed.toLocaleString()}
                                </td>

                                <td>
                                    {zone.shelter_kits_needed.toLocaleString()}
                                </td>

                                <td>
                                    {zone.life_jackets_needed}
                                </td>

                                <td>
                                    <strong>
                                        {Number(zone.priority_score).toFixed(2)}
                                    </strong>
                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

        </section>
    );
}

export default Resources;
