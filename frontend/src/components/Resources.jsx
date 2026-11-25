import React, { useEffect, useState } from "react";
import { apiUrl } from "../api";

function Resources() {
    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [officers, setOfficers] = useState(() => {
        try {
            return JSON.parse(
                localStorage.getItem("qrescue:officer-directory") || "{}"
            );
        } catch {
            return {};
        }
    });

    const [editingOfficers, setEditingOfficers] = useState(false);

    const updateOfficer = (key, field, value) => {
        setOfficers((previous) => ({
            ...previous,
            [key]: {
                ...(previous[key] || {}),
                [field]: value
            }
        }));
    };

    const saveOfficers = () => {
        localStorage.setItem(
            "qrescue:officer-directory",
            JSON.stringify(officers)
        );
        setEditingOfficers(false);
    };


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

                    <div className="resource-note">
                        <strong>Prototype data assumptions</strong>
                        <p>
                            Population figures use Census 2011 data. Estimated affected
                            people are calculated as 10% of population. Food and water
                            kit quantities use that estimate; medical and shelter kit
                            quantities use approximately 20%. Boat, rescue-team and
                            ambulance quantities are prototype estimates.
                        </p>
                        <p>
                            These figures are not live field reports, verified resource
                            inventories or confirmed deployment requirements. Validate
                            current population exposure, available stock and field demand
                            before operational use.
                        </p>
                    </div>
                </div>
            </div>


            {/* TOP 3 PRIORITY ZONES */}
            <div className="priority-section">

                <h3>📊 Prototype Priority Ranking</h3>

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
                                        Estimated Affected (10%)
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
                            <th>Population (2011)</th>
                            <th>Estimated Affected</th>
                            <th>Villages</th>
                            <th>Boats</th>
                            <th>Rescue Teams</th>
                            <th>Ambulances</th>
                            <th>Food Kits (Estimate)</th>
                            <th>Water Kits (Estimate)</th>
                            <th>Medical Kits (Estimate)</th>
                            <th>Shelter Kits (Estimate)</th>
                            <th>Life Jackets</th>
                            <th>Prototype Priority Score</th>

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


            {/* DISTRICT AND TALUK OFFICER DIRECTORY */}
            <div className="officer-directory">
                <div className="officer-directory-header">
                    <div>
                        <h3>🏛️ District & Taluk Officers Directory</h3>
                        <p>Emergency administration and responsible officer contacts.</p>
                        <small>Verify all details with the district administration before emergency use.</small>
                    </div>

                    <button
                        type="button"
                        onClick={() => editingOfficers ? saveOfficers() : setEditingOfficers(true)}
                    >
                        {editingOfficers ? "Save Details" : "✏️ Edit Details"}
                    </button>
                </div>

                <div className="officer-group">
                    <h4>District Administration</h4>
                    <div className="officer-card">
                        <h5>Deputy Commissioner (DC), Belagavi</h5>
                        <span className="officer-status">
                            {officers.dc?.name ? "Details entered, not independently verified" : "Not verified"}
                        </span>

                        {editingOfficers ? (
                            <div className="officer-fields">
                                <input placeholder="DC officer name" value={officers.dc?.name || ""} onChange={e => updateOfficer("dc", "name", e.target.value)} />
                                <input placeholder="Office contact number" value={officers.dc?.phone || ""} onChange={e => updateOfficer("dc", "phone", e.target.value)} />
                                <input placeholder="Official email" value={officers.dc?.email || ""} onChange={e => updateOfficer("dc", "email", e.target.value)} />
                            </div>
                        ) : (
                            <div className="officer-details">
                                <p>Name: {officers.dc?.name || "Not verified"}</p>
                                <p>Phone: {officers.dc?.phone || "Not available"}</p>
                                <p>Email: {officers.dc?.email || "Not available"}</p>
                                {officers.dc?.phone && <a href={`tel:${officers.dc.phone}`}>📞 Call DC Office</a>}
                                {officers.dc?.email && <a href={`mailto:${officers.dc.email}`}>✉️ Email DC Office</a>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="officer-group">
                    <h4>Taluk Revenue Officers / Tahsildars</h4>
                    <div className="officer-grid">
                        {resources.map(zone => {
                            const key = `taluk-${zone.taluk}`;
                            const officer = officers[key] || {};

                            return (
                                <div className="officer-card" key={zone.taluk}>
                                    <h5>{zone.taluk}</h5>
                                    <span className="officer-status">
                                        {officer.name ? "Details entered, not independently verified" : "Not verified"}
                                    </span>
                                    <strong>Revenue Officer / Tahsildar</strong>

                                    {editingOfficers ? (
                                        <div className="officer-fields">
                                            <input placeholder="Officer name" value={officer.name || ""} onChange={e => updateOfficer(key, "name", e.target.value)} />
                                            <input placeholder="Contact number" value={officer.phone || ""} onChange={e => updateOfficer(key, "phone", e.target.value)} />
                                            <input placeholder="Official email" value={officer.email || ""} onChange={e => updateOfficer(key, "email", e.target.value)} />
                                        </div>
                                    ) : (
                                        <div className="officer-details">
                                            <p>Name: {officer.name || "Not verified"}</p>
                                            <p>Phone: {officer.phone || "Not available"}</p>
                                            <p>Email: {officer.email || "Not available"}</p>
                                            {officer.phone && <a href={`tel:${officer.phone}`}>📞 Call Officer</a>}
                                            {officer.email && <a href={`mailto:${officer.email}`}>✉️ Email Officer</a>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <p className="officer-disclaimer">
                    <strong>Verification notice:</strong> Contact details entered here are user-provided and have not been independently verified. Confirm officer appointments and contact numbers before operational use. Details are saved in this browser only.
                </p>
            </div>

        </section>
    );
}

export default Resources;
