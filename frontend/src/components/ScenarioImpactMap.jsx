import React, { useEffect, useMemo, useState } from "react";
import {
    MapContainer,
    TileLayer,
    GeoJSON,
    LayerGroup,
    CircleMarker,
    Popup,
    LayersControl,
    ScaleControl,
    useMap
} from "react-leaflet";

import L from "leaflet";
import { apiUrl } from "../api";
import "leaflet/dist/leaflet.css";
import "./ScenarioImpactMap.css";

const riskColors = {
    Critical: "#dc2626",
    High: "#dc2626",
    Medium: "#f59e0b",
    Low: "#16a34a",
    Unknown: "#64748b"
};

function FitDistrictBounds({ district }) {
    const map = useMap();

    useEffect(() => {
        if (!district) return;

        const layer = L.geoJSON(district);
        const bounds = layer.getBounds();

        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [25, 25],
                maxZoom: 10
            });
        }
    }, [district, map]);

    return null;
}

function InvalidateMapSize() {
    const map = useMap();

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            map.invalidateSize();
        });

        return () => cancelAnimationFrame(frame);
    }, [map]);

    return null;
}

const normalizeTaluk = value =>
    String(value || "").trim().toLowerCase().replace(/[\s-]/g, "")
        .replace("chikkodi", "chikodi")
        .replace("raibag", "raybag")
        .replace("athani", "athni");

const riskColor = risk => ({
    Critical: "#dc2626",
    High: "#dc2626",
    Medium: "#f59e0b",
    Low: "#16a34a"
}[risk] || "#64748b");

const villageValue = (village, key) =>
    village?.[key] ?? village?.properties?.[key];

const normalizedRisk = value => {
    const risk = String(value || "").trim().toLowerCase();
    if (risk === "critical") return "Critical";
    if (risk === "high") return "High";
    if (risk === "medium") return "Medium";
    if (risk === "low") return "Low";
    return "Unknown";
};

const riskRank = risk => ({
    Low: 1, Medium: 2, High: 3, Critical: 4
}[normalizedRisk(risk)] || 0);

function TalukBoundaries({ data, scenarioImpact, talukImpacts }) {
    if (!data) return null;

    const impacts = new Map(
        (talukImpacts || []).map(item => [
            normalizeTaluk(item.taluk), item
        ])
    );

    return (
        <GeoJSON
            key={JSON.stringify((talukImpacts || []).map(item => [item.taluk, item.hybrid_risk, item.estimated_affected_people]))}
            data={data}
            style={feature => {
                const name = feature.properties?.display_name ||
                    feature.properties?.shapeName || "";
                const impact = impacts.get(normalizeTaluk(name));
                if (!impact) {
                    return {
                        color: "#94a3b8", weight: 1, opacity: 0.65,
                        fillColor: "#cbd5e1", fillOpacity: 0.025
                    };
                }
                const color = riskColor(impact.hybrid_risk);
                return {
                    color, weight: 2.5, opacity: 1,
                    fillColor: color, fillOpacity: 0.42
                };
            }}
            onEachFeature={(feature, layer) => {
                const name = feature.properties?.display_name ||
                    feature.properties?.shapeName || "Taluk";
                const impact = impacts.get(normalizeTaluk(name));
                layer.bindTooltip(name, {
                    permanent: true,
                    direction: "center",
                    className: "belagavi-taluk-label"
                });
                if (impact) {
                    layer.bindPopup(
                        `<strong>${name}</strong><br/>Hybrid screening: ${impact.hybrid_risk}` +
                        `<br/>Screened villages: ${impact.screened_village_count}` +
                        `<br/>2011 population: ${Number(impact.population_2011).toLocaleString("en-IN")}` +
                        `<br/>Estimated affected: ${Number(impact.estimated_affected_people).toLocaleString("en-IN")}` +
                        `<br/>Resource priority: ${impact.is_priority_taluk ? "Selected" : "Not selected"}`
                    );
                } else {
                    layer.bindPopup(`<strong>${name}</strong><br/>Not in current scenario screening`);
                }
            }}
        />
    );
}

export default function ScenarioImpactMap({ scenarioImpact }) {
    const [district, setDistrict] = useState(null);
    const [taluks, setTaluks] = useState(null);
    const [rivers, setRivers] = useState(null);
    const [mainRiver, setMainRiver] = useState(null);
    const [villages, setVillages] = useState([]);
    const [dams, setDams] = useState([]);
    const [selectedVillage, setSelectedVillage] = useState(null);
    const [mapError, setMapError] = useState("");

    useEffect(() => {
        let active = true;

        async function loadGeographicLayers() {
            try {
                const paths = [
                    "/data/boundaries/belagavi_district.geojson",
                    "/data/boundaries/belagavi_taluks.geojson",
                    "/data/rivers/belagavi_waterways.geojson",
                    "/data/rivers/belagavi_main_river.geojson",
                    "/data/village/belagavi_villages_clipped.geojson"
                ];

                const responses = await Promise.all(
                    paths.map(path => fetch(path))
                );

                const failed = responses.find(response => !response.ok);

                if (failed) {
                    throw new Error(
                        "A Belagavi geographic layer could not be loaded."
                    );
                }

                const [
                    districtData,
                    talukData,
                    riverData,
                    mainRiverData,
                    villageData
                ] = await Promise.all(
                    responses.map(response => response.json())
                );

                if (!active) return;

                setDistrict(districtData);
                setTaluks(talukData);
                setRivers(riverData);
                setMainRiver(mainRiverData);
                setVillages(villageData.features || []);

                setMapError("");
            } catch (error) {
                if (active) setMapError(error.message);
            }
        }

        async function loadDams() {
            try {
                const response = await fetch(
                    apiUrl("/api/dam-monitoring/dams")
                );

                if (!response.ok) return;

                const data = await response.json();

                const records = Array.isArray(data)
                    ? data
                    : data.dams || data.reservoirs || [];

                if (active) {
                    setDams(records.filter(d => {
                        const lat = Number(d.latitude);
                        const lon = Number(d.longitude);

                        return Number.isFinite(lat) &&
                            Number.isFinite(lon) &&
                            lat >= 15.3 && lat <= 16.95 &&
                            lon >= 74.0 && lon <= 75.5;
                    }));
                }
            } catch (error) {
                console.warn("Dam markers unavailable:", error);
            }
        }

        loadGeographicLayers();
        loadDams();

        return () => {
            active = false;
        };
    }, []);

    // Scenario API villages are currently returned as flat objects:
    // { village_name, taluk, population_2011, screening_risk, geometry }.
    // Older map code expected GeoJSON-style properties, so read both formats.
    const scenarioVillages = scenarioImpact?.available
        ? (scenarioImpact.villages || [])
        : villages;

    const screenedTalukNames = useMemo(() => {
        const explicit = scenarioImpact?.screened_taluks ||
            scenarioImpact?.selected_screening_taluks ||
            scenarioImpact?.screening_taluks ||
            [];
        const names = explicit.map(item =>
            typeof item === "string" ? item : item?.taluk || item?.name
        ).filter(Boolean);

        if (names.length) return [...new Map(
            names.map(name => [normalizeTaluk(name), name])
        ).values()];

        return [...new Map(
            scenarioVillages
                .map(v => villageValue(v, "taluk"))
                .filter(Boolean)
                .map(name => [normalizeTaluk(name), name])
        ).values()];
    }, [scenarioImpact, scenarioVillages]);

    const scenarioTalukImpacts = useMemo(() => {
        const selected = new Set(screenedTalukNames.map(normalizeTaluk));
        const supplied = scenarioImpact?.taluk_impacts || [];
        const filtered = supplied.filter(item =>
            selected.size === 0 || selected.has(normalizeTaluk(item.taluk))
        );

        if (filtered.length) return filtered;

        // Fallback: derive taluk summaries from the scenario's screened villages.
        // This keeps the map usable if an API response omits taluk_impacts.
        const grouped = new Map();
        scenarioVillages.forEach(village => {
            const taluk = villageValue(village, "taluk");
            if (!taluk) return;
            const key = normalizeTaluk(taluk);
            if (!grouped.has(key)) grouped.set(key, {
                taluk,
                screened_village_count: 0,
                population_2011: 0,
                estimated_affected_people: 0,
                hybrid_risk: "Low",
                is_priority_taluk: false
            });
            const item = grouped.get(key);
            item.screened_village_count += 1;
            item.population_2011 += Number(villageValue(village, "population_2011") || 0);
            item.estimated_affected_people += Number(villageValue(village, "estimated_affected_people") || 0);
            const risk = normalizedRisk(
                villageValue(village, "hybrid_risk") ||
                villageValue(village, "screening_risk") ||
                villageValue(village, "risk")
            );
            if (riskRank(risk) > riskRank(item.hybrid_risk)) item.hybrid_risk = risk;
        });

        const priorityNames = new Set(
            (scenarioImpact?.priority_taluks || scenarioImpact?.allocation?.selected_zones || [])
                .map(item => normalizeTaluk(typeof item === "string" ? item : item?.taluk || item?.zone || item?.name))
        );
        return [...grouped.values()].map(item => ({
            ...item,
            is_priority_taluk: priorityNames.has(normalizeTaluk(item.taluk))
        }));
    }, [scenarioImpact, scenarioVillages, screenedTalukNames]);

    const riskCounts = useMemo(() => {
        return villages.reduce((counts, village) => {
            const risk =
                villageValue(village, "hybrid_risk") ||
                villageValue(village, "screening_risk") ||
                villageValue(village, "flood_status") ||
                "Unknown";

            counts[risk] = (counts[risk] || 0) + 1;
            return counts;
        }, {});
    }, [villages]);

    const totalPopulation = useMemo(() => {
        return villages.reduce(
            (sum, village) =>
                sum + Number(villageValue(village, "population_2011") || 0),
            0
        );
    }, [villages]);

    const riskForVillage = village => normalizedRisk(
        villageValue(village, "hybrid_risk") ||
        villageValue(village, "screening_risk") ||
        villageValue(village, "flood_status") ||
        villageValue(village, "risk")
    );

    const displayRisk = risk =>
        risk === "Unknown" || risk === "NOT_ASSESSED" ? "Not assessed" : risk;

    return (
        <section className="scenario-map-panel">
            <div className="scenario-map-heading">
                <div>
                    <span className="scenario-map-kicker">
                        BELAGAVI DISTRICT GIS
                    </span>
                    <h2>Belagavi Flood Intelligence Map</h2>
                    <p>
                        {scenarioImpact?.available
                            ? "Selected dam, screened taluk boundaries and village-level screening locations."
                            : "District boundary, taluk divisions, mapped waterways and village coordinates."}
                    </p>
                </div>

                <span className="scenario-map-status">
                    {scenarioImpact?.available ? "DAM SCENARIO VIEW" : "DISTRICT VIEW"}
                </span>
            </div>

            <div className="scenario-map-stats">
                <div>
                    <strong>{(scenarioImpact?.village_count ?? villages.length).toLocaleString("en-IN")}</strong>
                    <span>{scenarioImpact?.available ? "Screened village locations" : "Village locations"}</span>
                </div>
                <div>
                    <strong>
                        {taluks?.features?.length || 0}
                    </strong>
                    <span>Administrative polygons</span>
                </div>
                <div>
                    <strong>{scenarioImpact?.available ? screenedTalukNames.length : (taluks?.features?.length || 0)}</strong>
                    <span>{scenarioImpact?.available ? "Screened taluks" : "Administrative polygons"}</span>
                </div>
            </div>

            <div className="scenario-map-legend">
                <span><i style={{ background: "#dc2626" }} /> High / Critical screened region</span>
                <span><i style={{ background: "#f59e0b" }} /> Medium screened region</span>
                <span><i style={{ background: "#16a34a" }} /> Low screened region</span>
                <span><i style={{ background: "#64748b" }} /> Not in current screening</span>
                <span><i className="river-legend" /> Rivers</span>
            </div>

            <div className="scenario-map-container">
                <MapContainer
                    center={[16.1, 74.7]}
                    zoom={9}
                    minZoom={8}
                    maxZoom={16}
                    scrollWheelZoom
                    className="scenario-leaflet-map"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <ScaleControl position="bottomleft" />
                    <InvalidateMapSize />

                    <LayersControl position="topright">
                        {district && (
                            <LayersControl.Overlay
                                checked
                                name="Belagavi district boundary"
                            >
                                <GeoJSON
                                    data={district}
                                    style={{
                                        color: "#1d4ed8",
                                        weight: 4,
                                        opacity: 1,
                                        fillColor: "#60a5fa",
                                        fillOpacity: 0.04
                                    }}
                                    onEachFeature={(feature, layer) => {
                                        layer.bindPopup(
                                            "<strong>Belagavi District</strong>"
                                        );
                                    }}
                                />
                            </LayersControl.Overlay>
                        )}

                        {taluks && (
                            <LayersControl.Overlay
                                checked
                                name="Taluk boundaries and labels"
                            >
                                <TalukBoundaries data={taluks} scenarioImpact={scenarioImpact} talukImpacts={scenarioTalukImpacts} />
                            </LayersControl.Overlay>
                        )}

                        {rivers && (
                            <LayersControl.Overlay
                                checked
                                name="River and waterway network"
                            >
                                <GeoJSON
                                    data={rivers}
                                    style={{
                                        color: "#38a3d1",
                                        weight: 2,
                                        opacity: 0.8
                                    }}
                                />
                            </LayersControl.Overlay>
                        )}

                        {mainRiver && (
                            <LayersControl.Overlay
                                checked
                                name="Main river"
                            >
                                <GeoJSON
                                    data={mainRiver}
                                    style={{
                                        color: "#075985",
                                        weight: 4,
                                        opacity: 0.95
                                    }}
                                />
                            </LayersControl.Overlay>
                        )}

                        <LayersControl.Overlay
                            checked
                            name="Village locations"
                        >
                            <LayerGroup>
                                {scenarioVillages.map((village, index) => {
                                    const coordinates =
                                        village.geometry?.coordinates;

                                    if (!coordinates) return null;

                                    const [lon, lat] = coordinates;
                                    const risk = riskForVillage(village);
                                    const color =
                                        riskColors[risk] || riskColors.Unknown;

                                    return (
                                        <CircleMarker
                                            key={
                                                villageValue(village, "census_village_code") ||
                                                villageValue(village, "village_name") ||
                                                index
                                            }
                                            center={[lat, lon]}
                                            radius={3.5}
                                            pathOptions={{
                                                color,
                                                fillColor: color,
                                                fillOpacity: 0.8,
                                                weight: 0.7
                                            }}
                                            eventHandlers={{
                                                click: () =>
                                                    setSelectedVillage(village)
                                            }}
                                        >
                                            <Popup>
                                                <strong>
                                                    {villageValue(village, "village_name") ||
                                                        "Village"}
                                                </strong>
                                                <p>
                                                    Taluk:{" "}
                                                    {villageValue(village, "taluk") || "Unknown"}
                                                </p>
                                                <p>
                                                    Population (2011):{" "}
                                                    {Number(
                                                        villageValue(village, "population_2011") || 0
                                                    ).toLocaleString("en-IN")}
                                                </p>
                                                <p>
                                                    Screening status: {displayRisk(risk)}
                                                </p>
                                                <p>
                                                    Estimated affected (prototype): {Number(villageValue(village, "estimated_affected_people") || 0).toLocaleString("en-IN")}
                                                </p>
                                                <small>
                                                    Historical village location.
                                                    This marker is not a live flood observation.
                                                </small>
                                            </Popup>
                                        </CircleMarker>
                                    );
                                })}
                            </LayerGroup>
                        </LayersControl.Overlay>

                        {dams.length > 0 && (
                            <LayersControl.Overlay
                                checked
                                name="Reservoir API markers"
                            >
                                <LayerGroup>
                                    {dams.map((dam, index) => (
                                        <CircleMarker
                                            key={dam.id || dam.dam_name || index}
                                            center={[
                                                Number(dam.latitude),
                                                Number(dam.longitude)
                                            ]}
                                            radius={8}
                                            pathOptions={{
                                                color: "#1d4ed8",
                                                fillColor: "#60a5fa",
                                                fillOpacity: 1
                                            }}
                                        >
                                            <Popup>
                                                <strong>
                                                    {dam.dam_name || "Reservoir"}
                                                </strong>
                                                <p>
                                                    River: {dam.river_name || "Not available"}
                                                </p>
                                                <small>
                                                    Location from dam monitoring API.
                                                </small>
                                            </Popup>
                                        </CircleMarker>
                                    ))}
                                </LayerGroup>
                            </LayersControl.Overlay>
                        )}
                    </LayersControl>

                    <FitDistrictBounds district={district} />
                </MapContainer>
            </div>

            <div className="scenario-map-notice">
                <strong>Geographic data notes</strong>
                <p>
                    District and administrative boundaries are derived from
                    the downloaded ADM2 2021 and ADM3 2018 datasets.
                    Village points are filtered against the district polygon.
                    River lines are clipped to the district boundary.
                    Administrative boundaries should be checked against
                    current official records before operational use.
                </p>
            </div>

            <div className="scenario-safe-status">
                <strong>{scenarioImpact?.available ? "Dam-specific regional screening" : "Evacuation and safe-location layer"}</strong>
                <span>
                    {scenarioImpact?.available
                        ? `Selected dam: ${scenarioImpact.selected_dam || "Not specified"}. Red taluk polygons and village markers indicate High/Critical model screening categories, not observed inundation. Screened taluks are separate from resource-priority taluks.`
                        : "Not yet available. Verified shelters, road-network data and validated destination information are required before evacuation routes can be recommended."}
                </span>
            </div>

            {selectedVillage && (
                <div className="scenario-selected-village">
                    <button
                        type="button"
                        onClick={() => setSelectedVillage(null)}
                        aria-label="Close village details"
                    >
                        ×
                    </button>
                    <h3>
                        {villageValue(selectedVillage, "village_name")}
                    </h3>
                    <p>
                        Taluk: {villageValue(selectedVillage, "taluk")}
                    </p>
                    <p>
                        Population:{" "}
                        {Number(
                            villageValue(selectedVillage, "population_2011") || 0
                        ).toLocaleString("en-IN")}
                    </p>
                    <p>
                        Status: {displayRisk(riskForVillage(selectedVillage))}
                    </p>
                </div>
            )}

            {mapError && (
                <p className="scenario-map-error">{mapError}</p>
            )}
        </section>
    );
}
