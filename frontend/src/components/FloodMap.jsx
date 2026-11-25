
import React, { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api";
import "./DistrictIntelligence.css";

const FILES = {
    district: "/data/boundaries/belagavi_district.geojson",
    taluks: "/data/boundaries/belagavi_taluks.geojson",
    rivers: "/data/rivers/belagavi_waterways.geojson",
    mainRiver: "/data/rivers/belagavi_main_river.geojson",
    villages: "/data/village/belagavi_villages_clipped.geojson"
};

const SELECTED_DAMS = [
    "hidkal dam",
    "naviluteertha dam (renukasagar)",
    "rakasakoppa",
    "dhupdal dam"
];

const getFeatures = (data) =>
    data?.type === "FeatureCollection" && Array.isArray(data.features)
        ? data.features
        : [];

const getProp = (properties, candidates) => {
    const entries = Object.entries(properties || {});
    for (const candidate of candidates) {
        const found = entries.find(([key]) =>
            key.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            candidate.toLowerCase().replace(/[^a-z0-9]/g, "")
        );
        if (found && found[1] !== null && found[1] !== "") return found[1];
    }
    return "";
};

const talukName = (feature) =>
    String(getProp(feature.properties, [
        "taluk", "taluk_name", "subdistrict", "name", "shapeName"
    ]) || "Unspecified");

const villageName = (feature) =>
    String(getProp(feature.properties, [
        "village", "village_name", "name", "villageName",
        "shapeName"
    ]) || "Unnamed village");

const numberValue = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-IN");

function Metric({ icon, label, value, note }) {
    return (
        <article className="di-metric">
            <div className="di-metric-icon">{icon}</div>
            <div className="di-metric-label">{label}</div>
            <div className="di-metric-value">{value}</div>
            <div className="di-metric-note">{note}</div>
        </article>
    );
}

export default function FloodMap() {
    const [geo, setGeo] = useState({});
    const [dams, setDams] = useState([]);
    const [resources, setResources] = useState([]);
    const [zones, setZones] = useState([]);
    const [scenarioImpact, setScenarioImpact] = useState(null);

    const [search, setSearch] = useState("");
    const [selectedTaluk, setSelectedTaluk] = useState("All");
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState([]);

    useEffect(() => {
        let active = true;

        const load = async () => {
            const failures = [];

            const geoEntries = await Promise.all(
                Object.entries(FILES).map(async ([key, path]) => {
                    try {
                        const response = await fetch(path);
                        if (!response.ok) throw new Error(path);
                        return [key, await response.json()];
                    } catch {
                        failures.push(key);
                        return [key, null];
                    }
                })
            );

            const apiEntries = await Promise.all([
                ["dams", "/api/dam-monitoring/dams"],
                ["resources", "/api/resources"],
                ["zones", "/api/zones"]
            ].map(async ([key, path]) => {
                try {
                    const response = await fetch(apiUrl(path));
                    if (!response.ok) throw new Error(path);
                    return [key, await response.json()];
                } catch {
                    failures.push(key);
                    return [key, null];
                }
            }));

            if (!active) return;

            setGeo(Object.fromEntries(geoEntries));

            const apiData = Object.fromEntries(apiEntries);

            const damRecords = apiData.dams?.dams ||
                apiData.dams?.data ||
                apiData.dams || [];

            setDams(
                (Array.isArray(damRecords) ? damRecords : []).filter(
                    (dam) => SELECTED_DAMS.includes(
                        String(dam.dam_name || "").trim().toLowerCase()
                    )
                )
            );

            const resourceRecords = apiData.resources?.resources ||
                apiData.resources?.data ||
                apiData.resources || [];

            setResources(Array.isArray(resourceRecords) ? resourceRecords : []);

            const zoneRecords = apiData.zones?.zones || apiData.zones || [];
            setZones(Array.isArray(zoneRecords) ? zoneRecords : []);

            setErrors(failures);
            setLoading(false);
        };

        load();

        const handleScenario = (event) =>
            setScenarioImpact(event.detail || null);

        window.addEventListener("qrescue:scenario", handleScenario);

        return () => {
            active = false;
            window.removeEventListener("qrescue:scenario", handleScenario);
        };
    }, []);

    const villages = useMemo(
        () => getFeatures(geo.villages),
        [geo.villages]
    );

    const taluks = useMemo(
        () => getFeatures(geo.taluks),
        [geo.taluks]
    );

    const rivers = useMemo(
        () => getFeatures(geo.rivers),
        [geo.rivers]
    );

    const mainRivers = useMemo(
        () => getFeatures(geo.mainRiver),
        [geo.mainRiver]
    );

    const talukStats = useMemo(() => {
        const counts = {};
        villages.forEach((feature) => {
            const name = talukName(feature);
            counts[name] = (counts[name] || 0) + 1;
        });

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1]);
    }, [villages]);

    const filteredVillages = useMemo(() => {
        const term = search.trim().toLowerCase();

        return villages.filter((feature) => {
            const name = villageName(feature);
            const taluk = talukName(feature);
            const properties = feature.properties || {};

            const census = String(getProp(properties, [
                "census_code", "censuscode", "village_code",
                "villagecode", "code"
            ]));

            const matchesSearch =
                !term ||
                name.toLowerCase().includes(term) ||
                taluk.toLowerCase().includes(term) ||
                census.toLowerCase().includes(term);

            const matchesTaluk =
                selectedTaluk === "All" || taluk === selectedTaluk;

            return matchesSearch && matchesTaluk;
        });
    }, [villages, search, selectedTaluk]);

    const totalResources = resources.length;

    const validDams = dams.filter((dam) => {
        const lat = numberValue(dam.latitude);
        const lon = numberValue(dam.longitude);
        return lat !== null && lon !== null &&
            lat >= 15 && lat <= 18 && lon >= 73 && lon <= 76;
    });

    if (loading) {
        return (
            <div className="di-loading">
                <div className="di-spinner" />
                Loading Belagavi district intelligence...
            </div>
        );
    }

    return (
        <section className="district-intelligence">
            <div className="di-heading">
                <div>
                    <span className="di-eyebrow">Q-RESCUE / GEOSPATIAL INTELLIGENCE</span>
                    <h2>Belagavi District Intelligence</h2>
                    <p>
                        Administrative geography, village directory,
                        waterways and emergency monitoring records.
                    </p>
                </div>
                <div className="di-live-label">
                    <span /> DATA CONNECTED
                </div>
            </div>

            {errors.length > 0 && (
                <div className="di-warning">
                    Some data sources could not be loaded: {errors.join(", ")}.
                    Available sections remain usable.
                </div>
            )}

            <div className="di-metrics">
                <Metric icon="🏘️" label="Village locations" value={formatNumber(villages.length)} note="GeoJSON village features" />
                <Metric icon="🧭" label="Taluk boundaries" value={formatNumber(taluks.length)} note="Administrative polygons" />
                <Metric icon="🌊" label="Waterway features" value={formatNumber(rivers.length + mainRivers.length)} note="GeoJSON river and stream features" />
                <Metric icon="🏞️" label="Reservoir records" value={formatNumber(dams.length)} note={`${validDams.length} with valid coordinates`} />
            </div>

            {scenarioImpact && (
                <div className="di-scenario">
                    <div>
                        <span className="di-eyebrow">MODEL LAB SCENARIO</span>
                        <h3>Scenario impact received</h3>
                        <p>
                            The latest scenario result has been shared from
                            the model testing lab.
                        </p>
                    </div>
                    <pre>{JSON.stringify(scenarioImpact, null, 2)}</pre>
                </div>
            )}

            <div className="di-grid">
                <section className="di-panel di-taluk-panel">
                    <div className="di-panel-heading">
                        <div>
                            <span className="di-eyebrow">ADMINISTRATIVE PROFILE</span>
                            <h3>Village distribution by taluk</h3>
                        </div>
                        <span className="di-count">{talukStats.length} areas</span>
                    </div>

                    {talukStats.length === 0 ? (
                        <p className="di-muted">Taluk distribution unavailable.</p>
                    ) : (
                        <div className="di-bars">
                            {talukStats.map(([name, count]) => (
                                <button
                                    className={`di-bar-row ${selectedTaluk === name ? "active" : ""}`}
                                    key={name}
                                    onClick={() => setSelectedTaluk(
                                        selectedTaluk === name ? "All" : name
                                    )}
                                >
                                    <span>{name}</span>
                                    <div className="di-bar-track">
                                        <div
                                            className="di-bar-fill"
                                            style={{
                                                width: `${(count / Math.max(...talukStats.map((x) => x[1]))) * 100}%`
                                            }}
                                        />
                                    </div>
                                    <strong>{count}</strong>
                                </button>
                            ))}
                        </div>
                    )}
                    <p className="di-hint">Select a taluk to filter the village directory.</p>
                </section>

                <section className="di-panel">
                    <div className="di-panel-heading">
                        <div>
                            <span className="di-eyebrow">HYDROGRAPHIC NETWORK</span>
                            <h3>River and waterway inventory</h3>
                        </div>
                        <span className="di-icon-large">🌊</span>
                    </div>
                    <div className="di-river-stat">
                        <strong>{formatNumber(mainRivers.length)}</strong>
                        <span>Main river features</span>
                    </div>
                    <div className="di-river-stat">
                        <strong>{formatNumber(rivers.length)}</strong>
                        <span>Waterway features</span>
                    </div>
                    <p className="di-muted">
                        Geographic reference data only. These features do not
                        represent live river flow or water levels.
                    </p>
                </section>
            </div>

            <section className="di-panel di-village-panel">
                <div className="di-panel-heading">
                    <div>
                        <span className="di-eyebrow">LOCATION DIRECTORY</span>
                        <h3>Village intelligence register</h3>
                        <p className="di-muted">
                            Search the district GeoJSON village inventory.
                        </p>
                    </div>
                    <span className="di-count">
                        {formatNumber(filteredVillages.length)} results
                    </span>
                </div>

                <div className="di-filters">
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search village, taluk or census code..."
                    />
                    <select
                        value={selectedTaluk}
                        onChange={(event) => setSelectedTaluk(event.target.value)}
                    >
                        <option value="All">All taluks</option>
                        {talukStats.map(([name]) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>

                <div className="di-table-wrap">
                    <table className="di-table">
                        <thead>
                            <tr>
                                <th>Village</th>
                                <th>Taluk</th>
                                <th>Census / village code</th>
                                <th>Population</th>
                                <th>Flood assessment</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVillages.slice(0, 100).map((feature, index) => {
                                const p = feature.properties || {};
                                const census = getProp(p, [
                                    "census_code", "censuscode",
                                    "village_code", "villagecode", "code"
                                ]);
                                const population = getProp(p, [
                                    "population", "total_population", "tot_p"
                                ]);

                                return (
                                    <tr key={`${census || villageName(feature)}-${index}`}>
                                        <td>{villageName(feature)}</td>
                                        <td>{talukName(feature)}</td>
                                        <td>{census || "Not available"}</td>
                                        <td>{population ? formatNumber(population) : "Not available"}</td>
                                        <td><span className="di-unassessed">Not assessed</span></td>
                                    </tr>
                                );
                            })}
                            {filteredVillages.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="di-empty">
                                        No matching villages found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {filteredVillages.length > 100 && (
                    <p className="di-hint">
                        Showing first 100 results. Refine your search to find
                        a specific village.
                    </p>
                )}
            </section>

            <section className="di-panel">
                <div className="di-panel-heading">
                    <div>
                        <span className="di-eyebrow">WATER INFRASTRUCTURE</span>
                        <h3>Reservoir monitoring register</h3>
                        <p className="di-muted">
                            Database records, not verified live telemetry.
                        </p>
                    </div>
                    <span className="di-count">{dams.length} selected records</span>
                </div>

                <div className="di-dam-grid">
                    {dams.map((dam) => {
                        const lat = numberValue(dam.latitude);
                        const lon = numberValue(dam.longitude);
                        const hasCoordinates = lat !== null && lon !== null &&
                            lat >= 15 && lat <= 18 && lon >= 73 && lon <= 76;

                        return (
                            <article className="di-dam-card" key={dam.id || dam.dam_name}>
                                <span className="di-dam-icon">🏞️</span>
                                <h4>{dam.dam_name}</h4>
                                <p>{dam.river_name || "River not specified"}</p>
                                <div className="di-dam-meta">
                                    {hasCoordinates
                                        ? `${lat.toFixed(5)}, ${lon.toFixed(5)}`
                                        : "Coordinates unavailable"}
                                </div>
                                <span className="di-unassessed">
                                    Telemetry not verified
                                </span>
                            </article>
                        );
                    })}
                    {dams.length === 0 && (
                        <p className="di-muted">No selected reservoir records available.</p>
                    )}
                </div>
            </section>

            <section className="di-panel">
                <div className="di-panel-heading">
                    <div>
                        <span className="di-eyebrow">EMERGENCY PLANNING</span>
                        <h3>Resource allocation overview</h3>
                    </div>
                    <span className="di-count">{totalResources} records</span>
                </div>

                <div className="di-table-wrap">
                    <table className="di-table">
                        <thead>
                            <tr>
                                <th>Taluk</th>
                                <th>River</th>
                                <th>Risk category</th>
                                <th>Population</th>
                                <th>Priority score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resources.map((item, index) => (
                                <tr key={`${item.taluk || "area"}-${index}`}>
                                    <td>{item.taluk || "—"}</td>
                                    <td>{item.river || "—"}</td>
                                    <td>{item.flood_risk || "—"}</td>
                                    <td>{item.population != null ? formatNumber(item.population) : "—"}</td>
                                    <td>{item.priority_score ?? "—"}</td>
                                </tr>
                            ))}
                            {resources.length === 0 && (
                                <tr><td colSpan="5" className="di-empty">Resource data unavailable.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="di-hint">
                    Affected population and required supplies are prototype
                    planning estimates, not confirmed deployments.
                </p>
            </section>

            <div className="di-footer-note">
                <strong>Data integrity note:</strong> Village locations and
                administrative boundaries are geographic reference datasets.
                Villages are marked “Not assessed” unless a validated model
                result is available. Historical observations, prototype
                predictions and live telemetry are kept distinct.
            </div>
        </section>
    );
}
