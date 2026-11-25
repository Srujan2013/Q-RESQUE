import React, { useEffect, useMemo, useState } from "react";
import {
    MapContainer,
    TileLayer,
    GeoJSON,
    CircleMarker,
    Popup,
    ScaleControl,
    useMap
} from "react-leaflet";
import { apiUrl } from "../api";
import "leaflet/dist/leaflet.css";
import "./RescueOperations.css";
import EvacuationPlanner from "./EvacuationPlanner";

const riskColors = {
    Critical: "#dc2626",
    High: "#f97316",
    Medium: "#eab308",
    Low: "#16a34a"
};

function normalizeTaluk(value) {
    const key = String(value || "").toLowerCase().replace(/[\s-]/g, "");
    const aliases = {
        chikkodi: "chikodi",
        chikodi: "chikodi",
        raibag: "raybag",
        raybag: "raybag",
        athani: "athni",
        athni: "athni"
    };
    return aliases[key] || key;
}

function MapResize() {
    const map = useMap();

    useEffect(() => {
        const frame = requestAnimationFrame(() => map.invalidateSize());
        return () => cancelAnimationFrame(frame);
    }, [map]);

    return null;
}

function FitScenario({ villages }) {
    const map = useMap();

    useEffect(() => {
        if (!villages.length) return;

        const points = villages
            .map(v => v.geometry?.coordinates)
            .filter(c => Array.isArray(c) && c.length >= 2)
            .map(([lon, lat]) => [lat, lon]);

        if (points.length) {
            map.fitBounds(points, { padding: [30, 30], maxZoom: 11 });
        }
    }, [villages, map]);

    return null;
}

export default function RescueOperations() {
    const [scenario, setScenario] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("qrescue:last-scenario") || "null");
        } catch {
            return null;
        }
    });
    const [resources, setResources] = useState([]);
    const [talukGeo, setTalukGeo] = useState(null);
    const [resourceError, setResourceError] = useState("");
    const [mapError, setMapError] = useState("");
    const [loadingResources, setLoadingResources] = useState(true);

    // District and taluk officer directory
    const [officers, setOfficers] = useState(() => {
        try {
            return JSON.parse(
                localStorage.getItem("qrescue:rescue-officers") || "{}"
            );
        } catch {
            return {};
        }
    });
    const [editingOfficers, setEditingOfficers] = useState(false);

    function updateOfficer(key, field, value) {
        setOfficers(previous => ({
            ...previous,
            [key]: {
                ...(previous[key] || {}),
                [field]: value
            }
        }));
    }

    function saveOfficerDirectory() {
        localStorage.setItem(
            "qrescue:rescue-officers",
            JSON.stringify(officers)
        );
        setEditingOfficers(false);
    }


    const [savedScenarios, setSavedScenarios] = useState([]);
    const [selectedScenarioId, setSelectedScenarioId] = useState("");
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState("");

    async function loadSavedScenarios() {
        setLoadingHistory(true);
        setHistoryError("");

        try {
            const response = await fetch(apiUrl("/api/models/scenarios"));
            if (!response.ok) {
                throw new Error("Could not load saved scenarios");
            }

            const data = await response.json();
            setSavedScenarios(data.scenarios || []);
        } catch (error) {
            setHistoryError(error.message);
        } finally {
            setLoadingHistory(false);
        }
    }

    async function loadSavedScenario(scenarioId) {
        if (!scenarioId) return;

        setHistoryError("");

        try {
            const response = await fetch(
                apiUrl(`/api/models/scenarios/${encodeURIComponent(scenarioId)}`)
            );

            if (!response.ok) {
                throw new Error("Could not load this saved scenario");
            }

            const data = await response.json();

            if (!data.scenario) {
                throw new Error("The saved scenario has no scenario data");
            }

            setScenario(data.scenario);
            setSelectedScenarioId(scenarioId);
            localStorage.setItem(
                "qrescue:last-scenario",
                JSON.stringify(data.scenario)
            );
        } catch (error) {
            setHistoryError(error.message);
        }
    }

    useEffect(() => {
        const handleScenario = event => setScenario(event.detail || null);
        window.addEventListener("qrescue:scenario-result", handleScenario);

        return () => window.removeEventListener(
            "qrescue:scenario-result",
            handleScenario
        );
    }, []);

    useEffect(() => {
        loadSavedScenarios();
    }, []);

    useEffect(() => {
        let active = true;

        fetch(apiUrl("/api/resources"))
            .then(response => {
                if (!response.ok) throw new Error("Resource API request failed");
                return response.json();
            })
            .then(data => {
                if (active) setResources(data.resources || []);
            })
            .catch(error => {
                if (active) setResourceError(error.message);
            })
            .finally(() => {
                if (active) setLoadingResources(false);
            });

        fetch("/data/boundaries/belagavi_taluks.geojson")
            .then(response => {
                if (!response.ok) throw new Error("Taluk boundary file unavailable");
                return response.json();
            })
            .then(data => {
                if (active) setTalukGeo(data);
            })
            .catch(error => {
                if (active) setMapError(error.message);
            });

        return () => {
            active = false;
        };
    }, []);

    const impact = scenario?.scenario_impact;
    const villages = impact?.villages || [];
    const selectedZones = scenario?.allocation?.selected_zones || [];

    const selectedKeys = useMemo(
        () => new Set(selectedZones.map(normalizeTaluk)),
        [selectedZones]
    );

    // Match each selected priority taluk to its scenario-specific impact estimate.
    const talukImpactByKey = useMemo(() => {
        const entries = impact?.taluk_impacts || [];
        return new Map(
            entries.map(item => [
                normalizeTaluk(item.taluk || item.taluk_name || item.name),
                item
            ])
        );
    }, [impact]);

    const getAffectedPeople = zone => {
        const talukImpact = talukImpactByKey.get(normalizeTaluk(zone.taluk));
        if (!talukImpact) return null;

        const estimate = Number(talukImpact.estimated_affected_people);
        return Number.isFinite(estimate) ? Math.max(0, estimate) : null;
    };

    // Illustrative planning ratios, rounded up separately for each taluk.
    const allocatedResources = useMemo(
        () => resources
            .filter(zone => selectedKeys.has(normalizeTaluk(zone.taluk)))
            .map(zone => {
                const affected = getAffectedPeople(zone);

                if (affected === null) {
                    return {
                        ...zone,
                        affected_people: null,
                        boats_needed: null,
                        rescue_teams_needed: null,
                        ambulances_needed: null,
                        food_kits_needed: null,
                        water_kits_needed: null,
                        medical_kits_needed: null,
                        shelter_kits_needed: null
                    };
                }

                return {
                    ...zone,
                    affected_people: affected,
                    boats_needed: Math.ceil(affected / 250),
                    rescue_teams_needed: Math.ceil(affected / 100),
                    ambulances_needed: Math.ceil(affected / 500),
                    food_kits_needed: affected,
                    water_kits_needed: affected,
                    medical_kits_needed: Math.ceil(affected / 10),
                    shelter_kits_needed: Math.ceil(affected / 5)
                };
            }),
        [resources, selectedKeys, talukImpactByKey]
    );

    const totals = useMemo(() => allocatedResources.reduce((sum, zone) => {
        sum.boats += Number(zone.boats_needed || 0);
        sum.teams += Number(zone.rescue_teams_needed || 0);
        sum.ambulances += Number(zone.ambulances_needed || 0);
        sum.affected += getAffectedPeople(zone) ?? 0;
        sum.food += Number(zone.food_kits_needed || 0);
        sum.water += Number(zone.water_kits_needed || 0);
        sum.medical += Number(zone.medical_kits_needed || 0);
        sum.shelter += Number(zone.shelter_kits_needed || 0);
        return sum;
    }, {
        boats: 0, teams: 0, ambulances: 0, affected: 0,
        food: 0, water: 0, medical: 0, shelter: 0
    }), [allocatedResources, talukImpactByKey]);

    const selectedVillageKeys = useMemo(
        () => new Set(villages.map(v => normalizeTaluk(v.taluk))),
        [villages]
    );

    return (
        <main className="rescue-operations">
            <header className="rescue-header">
                <div>
                    <span className="rescue-kicker">Q-RESCUE RESPONSE WORKSPACE</span>
                    <h1>Rescue Operations Centre</h1>
                    <p>
                        Scenario-based affected-area screening, resource planning
                        and evacuation-route readiness.
                    </p>
                </div>
                <span className={`rescue-status ${scenario ? "scenario-ready" : ""}`}>
                    {scenario ? "SCENARIO LOADED" : "AWAITING MODEL LAB TEST"}
                </span>
            </header>

            <section className="saved-scenarios-panel">
                <div>
                    <h2>Saved Scenarios</h2>
                    <p>Load a previously tested and saved model scenario.</p>
                </div>

                <div className="saved-scenarios-controls">
                    <select
                        value={selectedScenarioId}
                        onChange={event => loadSavedScenario(event.target.value)}
                        disabled={loadingHistory || savedScenarios.length === 0}
                    >
                        <option value="">
                            {loadingHistory
                                ? "Loading saved scenarios..."
                                : savedScenarios.length
                                    ? "Choose a saved scenario"
                                    : "No saved scenarios found"}
                        </option>

                        {savedScenarios.map(item => (
                            <option key={item.scenario_id} value={item.scenario_id}>
                                {[
                                    item.dam_name || "Unnamed dam",
                                    item.hybrid_class || "Unclassified",
                                    item.created_at || ""
                                ].filter(Boolean).join(" | ")}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={loadSavedScenarios}
                        disabled={loadingHistory}
                    >
                        {loadingHistory ? "Refreshing..." : "Refresh"}
                    </button>
                </div>

                {historyError && (
                    <p className="rescue-error">{historyError}</p>
                )}
            </section>

            {!scenario && (
                <section className="rescue-empty">
                    <h2>No scenario loaded</h2>
                    <p>
                        Open <strong>Model Lab</strong>, enter rainfall and weather
                        conditions, and run a scenario. Its selected taluks and
                        village screening results will appear here automatically.
                    </p>
                </section>
            )}

            {scenario && (
                <>
                    <section className="rescue-summary-grid">
                        <article>
                            <span>Predicted category</span>
                            <strong>{scenario.vqc?.class || "Unavailable"}</strong>
                            <small>VQC scenario output, not a calibrated probability</small>
                        </article>
                        <article>
                            <span>Selected response zones</span>
                            <strong>{selectedZones.length}</strong>
                            <small>Chosen by the classical budget baseline</small>
                        </article>
                        <article>
                            <span>Screened village locations</span>
                            <strong>{Number(impact?.village_count || villages.length).toLocaleString("en-IN")}</strong>
                            <small>Taluk-level screening, not village inundation</small>
                        </article>
                        <article>
                            <span>Population in selected villages</span>
                            <strong>{Number(impact?.population_2011 || 0).toLocaleString("en-IN")}</strong>
                            <small>Census 2011 reference population</small>
                        </article>
                    </section>

                    <section className="rescue-panel">
                        <div className="rescue-panel-heading">
                            <div>
                                <span className="rescue-kicker">GEOGRAPHIC SCENARIO VIEW</span>
                                <h2>Selected response areas</h2>
                                <p>
                                    Highlighted taluks and village points belong to
                                    the selected scenario.
                                </p>
                            </div>
                            <span className="rescue-map-legend">
                                <i /> Scenario-selected village
                            </span>
                        </div>

                        <div className="rescue-map">
                            <MapContainer
                                center={[16.1, 74.7]}
                                zoom={9}
                                minZoom={8}
                                maxZoom={16}
                                scrollWheelZoom
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <ScaleControl position="bottomleft" />
                                <MapResize />
                                {talukGeo && (
                                    <GeoJSON
                                        data={talukGeo}
                                        style={feature => {
                                            const name =
                                                feature.properties?.display_name ||
                                                feature.properties?.shapeName;
                                            const selected = selectedKeys.has(normalizeTaluk(name));
                                            return {
                                                color: selected ? "#b91c1c" : "#64748b",
                                                weight: selected ? 3 : 1,
                                                fillColor: selected ? "#fb923c" : "#cbd5e1",
                                                fillOpacity: selected ? 0.20 : 0.025
                                            };
                                        }}
                                        onEachFeature={(feature, layer) => {
                                            const name =
                                                feature.properties?.display_name ||
                                                feature.properties?.shapeName ||
                                                "Taluk";
                                            layer.bindTooltip(name);
                                        }}
                                    />
                                )}
                                {villages.map((village, index) => {
                                    const coordinates = village.geometry?.coordinates;
                                    if (!Array.isArray(coordinates)) return null;
                                    const [lon, lat] = coordinates;
                                    const color = riskColors[village.screening_risk] || "#64748b";

                                    return (
                                        <CircleMarker
                                            key={`${village.taluk}-${village.village_name}-${index}`}
                                            center={[lat, lon]}
                                            radius={5}
                                            pathOptions={{
                                                color,
                                                fillColor: color,
                                                fillOpacity: 0.9,
                                                weight: 1
                                            }}
                                        >
                                            <Popup>
                                                <strong>{village.village_name}</strong>
                                                <p>Taluk: {village.taluk}</p>
                                                <p>Screening category: {village.screening_risk}</p>
                                                <p>
                                                    Population (2011):{" "}
                                                    {Number(village.population_2011 || 0).toLocaleString("en-IN")}
                                                </p>
                                                <small>
                                                    This village inherits its taluk screening category.
                                                    It is not a confirmed flooded location.
                                                </small>
                                            </Popup>
                                        </CircleMarker>
                                    );
                                })}
                                <FitScenario villages={villages} />
                            </MapContainer>
                        </div>

                        {mapError && <p className="rescue-error">{mapError}</p>}
                        {!villages.length && (
                            <p className="rescue-warning">
                                Village screening geometry was not returned for this scenario.
                                The map cannot highlight selected village locations.
                            </p>
                        )}
                        <p className="rescue-footnote">
                            Taluk boundaries are reference administrative geometry.
                            Village markers show screened locations only, not observed
                            flood extent or water depth.
                        </p>
                    </section>

                    <section className="rescue-panel">
                        <div className="rescue-panel-heading">
                            <div>
                                <span className="rescue-kicker">RESOURCE PLANNING</span>
                                <h2>Proposed zone-wise resource allocation</h2>
                                <p>
                                    Affected-person estimates come from the current
                                    model scenario. Vehicle and kit quantities remain
                                    prototype estimates from the resource dataset.
                                </p>
                            </div>
                            <span className="rescue-method">
                                {scenario.allocation?.method || "Scenario allocation"}
                            </span>
                        </div>

                        {loadingResources && <p>Loading resource estimates...</p>}
                        {resourceError && <p className="rescue-error">{resourceError}</p>}

                        {!loadingResources && !resourceError && allocatedResources.length === 0 && (
                            <p className="rescue-warning">
                                No resource records matched the selected zones.
                                Check the taluk names returned by the scenario and resource API.
                            </p>
                        )}

                        {allocatedResources.length > 0 && (
                            <>
                                <div className="rescue-resource-totals">
                                    <div>
                                        <strong>{totals.affected.toLocaleString("en-IN")}</strong>
                                        <span>Estimated affected people in selected priority taluks</span>
                                    </div>
                                    <div><strong>{totals.boats}</strong><span>Estimated boats</span></div>
                                    <div><strong>{totals.teams}</strong><span>Estimated rescue teams</span></div>
                                    <div><strong>{totals.ambulances}</strong><span>Estimated ambulances</span></div>
                                    <div><strong>{totals.food.toLocaleString("en-IN")}</strong><span>Food kits estimate</span></div>
                                    <div><strong>{totals.water.toLocaleString("en-IN")}</strong><span>Water kits estimate</span></div>
                                </div>

                                <div className="rescue-table-wrap">
                                    <table className="rescue-table">
                                        <thead>
                                            <tr>
                                                <th>Selected taluk</th>
                                                <th>Risk label</th>
                                                <th>Priority</th>
                                                <th>Estimated affected people</th>
                                                <th>Boats</th>
                                                <th>Rescue teams</th>
                                                <th>Ambulances</th>
                                                <th>Food kits</th>
                                                <th>Water kits</th>
                                                <th>Medical kits</th>
                                                <th>Shelter kits</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allocatedResources.map(zone => (
                                                <tr key={zone.taluk}>
                                                    <td><strong>{zone.taluk}</strong></td>
                                                    <td>{zone.flood_risk}</td>
                                                    <td>
                                                        {Number(
                                                            scenario.allocation?.priority_scores?.[zone.taluk] ??
                                                            zone.priority_score
                                                        ).toFixed(1)}
                                                    </td>
                                                    <td>
                                                        {zone.affected_people === null
                                                            ? "Unavailable"
                                                            : zone.affected_people.toLocaleString("en-IN")}
                                                    </td>
                                                    <td>{zone.boats_needed}</td>
                                                    <td>{zone.rescue_teams_needed}</td>
                                                    <td>{zone.ambulances_needed}</td>
                                                    <td>{Number(zone.food_kits_needed).toLocaleString("en-IN")}</td>
                                                    <td>{Number(zone.water_kits_needed).toLocaleString("en-IN")}</td>
                                                    <td>{Number(zone.medical_kits_needed).toLocaleString("en-IN")}</td>
                                                    <td>{Number(zone.shelter_kits_needed).toLocaleString("en-IN")}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        <div className="rescue-warning">
                            <strong>Planning estimates, not dispatch orders</strong>
                            <p>
                                Estimated affected people are taken from the loaded
                                scenario's taluk-wise impact results and are not observed
                                victim counts. Food, water, medical and shelter kit values,
                                boats, ambulances and rescue teams remain prototype
                                resource estimates. They do not represent verified stock,
                                available vehicles, crew rosters, live field demand or
                                dispatched teams. Confirm inventory and incident reports
                                before assigning resources.
                            </p>
                            <p>
                                Allocation method: {scenario.allocation?.method || "Not specified"}.
                                The current scenario uses a classical budget baseline,
                                not a live QAOA dispatch run.
                            </p>
                        </div>
                    </section>


                    {/* DISTRICT OFFICER DIRECTORY */}
                    <section className="rescue-panel officer-directory">
                        <div className="rescue-panel-heading">
                            <div>
                                <span className="rescue-kicker">EMERGENCY CONTACTS</span>
                                <h2>District & Taluk Officers Directory</h2>
                                <p>
                                    Contact details for district administration,
                                    revenue officers and emergency coordination.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="officer-edit-button"
                                onClick={() =>
                                    editingOfficers
                                        ? saveOfficerDirectory()
                                        : setEditingOfficers(true)
                                }
                            >
                                {editingOfficers ? "Save Details" : "Edit Contacts"}
                            </button>
                        </div>

                        <div className="officer-contact-grid">
                            {[
                                {
                                    key: "dc",
                                    title: "Deputy Commissioner (DC)",
                                    subtitle: "Belagavi District"
                                },
                                {
                                    key: "control-room",
                                    title: "District Emergency Control Room",
                                    subtitle: "Emergency coordination"
                                }
                            ].map(item => {
                                const person = officers[item.key] || {};

                                return (
                                    <article className="officer-contact-card" key={item.key}>
                                        <div className="officer-card-title">
                                            <div>
                                                <h3>{item.title}</h3>
                                                <p>{item.subtitle}</p>
                                            </div>
                                            <span className="officer-unverified">
                                                {person.name && person.phone
                                                    ? "Entered · Verify"
                                                    : "Not verified"}
                                            </span>
                                        </div>

                                        {editingOfficers ? (
                                            <div className="officer-input-grid">
                                                <input
                                                    placeholder="Name / responsible person"
                                                    value={person.name || ""}
                                                    onChange={e => updateOfficer(item.key, "name", e.target.value)}
                                                />
                                                <input
                                                    placeholder="Designation"
                                                    value={person.designation || ""}
                                                    onChange={e => updateOfficer(item.key, "designation", e.target.value)}
                                                />
                                                <input
                                                    placeholder="Official phone number"
                                                    value={person.phone || ""}
                                                    onChange={e => updateOfficer(item.key, "phone", e.target.value)}
                                                />
                                                <input
                                                    placeholder="Official email"
                                                    value={person.email || ""}
                                                    onChange={e => updateOfficer(item.key, "email", e.target.value)}
                                                />
                                            </div>
                                        ) : (
                                            <div className="officer-contact-details">
                                                <p><strong>Name:</strong> {person.name || "Not entered"}</p>
                                                <p><strong>Designation:</strong> {person.designation || "Not entered"}</p>
                                                <p><strong>Phone:</strong> {person.phone || "Not entered"}</p>
                                                <p><strong>Email:</strong> {person.email || "Not entered"}</p>
                                                <div className="officer-contact-actions">
                                                    {person.phone && (
                                                        <a href={`tel:${person.phone}`}>Call</a>
                                                    )}
                                                    {person.email && (
                                                        <a href={`mailto:${person.email}`}>Email</a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>

                        <div className="officer-taluk-heading">
                            <h3>Taluk Revenue Officers / Tahsildars</h3>
                            <p>Contacts are shown for the taluks in the current resource allocation.</p>
                        </div>

                        <div className="officer-contact-grid">
                            {allocatedResources.map(zone => {
                                const key = `taluk-${zone.taluk}`;
                                const person = officers[key] || {};

                                return (
                                    <article className="officer-contact-card" key={key}>
                                        <div className="officer-card-title">
                                            <div>
                                                <h3>{zone.taluk}</h3>
                                                <p>Revenue Officer / Tahsildar</p>
                                            </div>
                                            <span className="officer-unverified">
                                                {person.name && person.phone
                                                    ? "Entered · Verify"
                                                    : "Not verified"}
                                            </span>
                                        </div>

                                        {editingOfficers ? (
                                            <div className="officer-input-grid">
                                                <input
                                                    placeholder="Officer name"
                                                    value={person.name || ""}
                                                    onChange={e => updateOfficer(key, "name", e.target.value)}
                                                />
                                                <input
                                                    placeholder="Designation"
                                                    value={person.designation || "Tahsildar"}
                                                    onChange={e => updateOfficer(key, "designation", e.target.value)}
                                                />
                                                <input
                                                    placeholder="Official phone number"
                                                    value={person.phone || ""}
                                                    onChange={e => updateOfficer(key, "phone", e.target.value)}
                                                />
                                                <input
                                                    placeholder="Official email"
                                                    value={person.email || ""}
                                                    onChange={e => updateOfficer(key, "email", e.target.value)}
                                                />
                                            </div>
                                        ) : (
                                            <div className="officer-contact-details">
                                                <p><strong>Name:</strong> {person.name || "Not entered"}</p>
                                                <p><strong>Designation:</strong> {person.designation || "Tahsildar"}</p>
                                                <p><strong>Phone:</strong> {person.phone || "Not entered"}</p>
                                                <p><strong>Email:</strong> {person.email || "Not entered"}</p>
                                                <div className="officer-contact-actions">
                                                    {person.phone && (
                                                        <a href={`tel:${person.phone}`}>Call</a>
                                                    )}
                                                    {person.email && (
                                                        <a href={`mailto:${person.email}`}>Email</a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>

                        <div className="officer-verification-note">
                            <strong>Important:</strong> Contact information is manually entered
                            and is not independently verified. Confirm current officer
                            appointments and official contact numbers before emergency use.
                            Details are stored in this browser only and are not shared
                            automatically with other administrators.
                        </div>
                    </section>

                    <EvacuationPlanner villages={villages} />
                </>
            )}

            <section className="rescue-panel rescue-next-step">
                <h2>How to use this screen</h2>
                <ol>
                    <li>Open Model Lab.</li>
                    <li>Enter a rainfall and weather scenario.</li>
                    <li>Run the test and inspect its selected response zones.</li>
                    <li>Open Rescue Operations to view the matching map and resource estimates.</li>
                </ol>
            </section>
        </main>
    );
}
