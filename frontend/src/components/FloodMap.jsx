import React, { useEffect, useState } from "react";

import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Popup,
    Polyline,
    GeoJSON,
    useMap
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import { apiUrl } from "../api";


// ==================================================
// MAP CENTER
// ==================================================

const BELAGAVI_CENTER = [15.8497, 74.4977];


// ==================================================
// RISK COLORS
// ==================================================

const getRiskColor = (risk) => {
    switch (String(risk).toLowerCase()) {
        case "critical":
            return "#dc2626";

        case "high":
            return "#ef4444";

        case "medium":
            return "#f59e0b";

        case "low":
            return "#22c55e";

        default:
            return "#64748b";
    }
};


// ==================================================
// MAP CONTROLLER
// ==================================================

function MapController() {
    const map = useMap();

    useEffect(() => {

        const timer = setTimeout(() => {

            map.setView(
                BELAGAVI_CENTER,
                9,
                {
                    animate: false
                }
            );

        }, 300);

        return () => clearTimeout(timer);

    }, [map]);

    return null;
}


// ==================================================
// FLOOD MAP
// ==================================================

function FloodMap() {

    const [zones, setZones] = useState([]);

    const [boundary, setBoundary] = useState(null);

    const [rivers, setRivers] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    const [riverError, setRiverError] = useState(false);


    // ==================================================
    // FETCH FLOOD ZONES
    // ==================================================

    useEffect(() => {

        fetch(apiUrl("/api/zones"))

            .then((response) => {

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch flood zones"
                    );
                }

                return response.json();

            })

            .then((data) => {

                console.log(
                    "Q-RESCUE flood zones:",
                    data
                );

                setZones(data.zones || []);

                setLoading(false);

            })

            .catch((error) => {

                console.error(error);

                setError(
                    "Unable to load flood zones"
                );

                setLoading(false);

            });

    }, []);


    // ==================================================
    // FETCH BELAGAVI DISTRICT BOUNDARY
    // ==================================================

    useEffect(() => {

        const boundaryUrl =
            "https://raw.githubusercontent.com/" +
            "civictech-India/INDIA-GEO-JSON-Datasets/" +
            "refs/heads/main/Karnataka_District_Boundary.json";


        fetch(boundaryUrl)

            .then((response) => {

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch district boundary"
                    );
                }

                return response.json();

            })

            .then((data) => {

                console.log(
                    "Belagavi district boundary loaded"
                );

                setBoundary(data);

            })

            .catch((error) => {

                console.error(
                    "Boundary error:",
                    error
                );

            });

    }, []);


    // ==================================================
    // FETCH REAL RIVER GEOMETRY FROM OPENSTREETMAP
    // ==================================================

    useEffect(() => {

        const overpassQuery = `
            [out:json][timeout:30];

            way
              ["waterway"="river"]
              ["name"~"Krishna|Ghataprabha|Malaprabha|Markandeya|Hiranyakeshi|Agrani",i]
              (15.2,74.0,17.2,75.9);

            out geom;
        `;


        const overpassUrl =
            "https://overpass-api.de/api/interpreter?data=" +
            encodeURIComponent(overpassQuery);


        fetch(overpassUrl)

            .then((response) => {

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch river data"
                    );
                }

                return response.json();

            })

            .then((data) => {

                console.log(
                    "Q-RESCUE river data:",
                    data
                );

                setRivers(data.elements || []);

            })

            .catch((error) => {

                console.error(
                    "River data error:",
                    error
                );

                setRiverError(true);

            });

    }, []);


    // ==================================================
    // LOADING
    // ==================================================

    if (loading) {

        return (

            <section className="flood-map-section">

                <div className="flood-map-header">

                    <div>

                        <h2>
                            🗺️ Flood Risk Map
                        </h2>

                        <p>
                            Belagavi district flood
                            monitoring zones
                        </p>

                    </div>

                </div>

                <div className="map-loading">

                    Loading real geographic map...

                </div>

            </section>

        );
    }


    // ==================================================
    // ERROR
    // ==================================================

    if (error) {

        return (

            <section className="flood-map-section">

                <div className="flood-map-header">

                    <div>

                        <h2>
                            🗺️ Flood Risk Map
                        </h2>

                        <p>
                            Belagavi district flood
                            monitoring zones
                        </p>

                    </div>

                </div>

                <div className="map-error">

                    {error}

                </div>

            </section>

        );
    }


    // ==================================================
    // MAP
    // ==================================================

    return (

        <section className="flood-map-section">


            {/* ==========================================
                HEADER
            ========================================== */}

            <div className="flood-map-header">

                <div>

                    <h2>
                        🗺️ Flood Risk Map
                    </h2>

                    <p>
                        Belagavi district flood
                        monitoring zones
                    </p>

                </div>


                <div className="monitoring-status">

                    <span className="status-indicator"></span>

                    Monitoring Active

                </div>

            </div>


            {/* ==========================================
                REAL MAP
            ========================================== */}

            <div className="real-map-container">


                <MapContainer

                    center={BELAGAVI_CENTER}

                    zoom={9}

                    scrollWheelZoom={true}

                    className="qrescue-map"

                >

                    <MapController />


                    {/* ==================================
                        OPEN STREET MAP
                    ================================== */}

                    <TileLayer

                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

                    />


                    {/* ==================================
                        BELAGAVI DISTRICT BOUNDARY
                    ================================== */}

                    {boundary && (

                        <GeoJSON

                            data={boundary}

                            filter={(feature) => {

                                const properties =
                                    feature?.properties || {};

                                const district =
                                    String(
                                        properties.District || ""
                                    ).toUpperCase();

                                return district === "BELAGAVI";

                            }}

                            style={() => ({

                                color: "#1d4ed8",

                                weight: 3,

                                opacity: 0.9,

                                fillColor: "#60a5fa",

                                fillOpacity: 0.08

                            })}

                            onEachFeature={(
                                feature,
                                layer
                            ) => {

                                layer.bindPopup(
                                    "<strong>Belagavi District</strong><br/>" +
                                    "District boundary"
                                );

                            }}

                        />

                    )}


                    {/* ==================================
                        REAL RIVERS
                    ================================== */}

                    {rivers.map((river, index) => {

                        if (
                            !river.geometry ||
                            river.geometry.length < 2
                        ) {
                            return null;
                        }


                        const positions =
                            river.geometry.map(
                                (point) => [
                                    point.lat,
                                    point.lon
                                ]
                            );


                        const riverName =
                            river.tags?.name ||
                            "River";


                        return (

                            <Polyline

                                key={
                                    `river-${river.id}-${index}`
                                }

                                positions={positions}

                                pathOptions={{

                                    color: "#0284c7",

                                    weight: 4,

                                    opacity: 0.85

                                }}

                            >

                                <Popup>

                                    <div>

                                        <strong>
                                            🌊 {riverName}
                                        </strong>

                                        <br />

                                        <span>
                                            OpenStreetMap river
                                            geometry
                                        </span>

                                    </div>

                                </Popup>

                            </Polyline>

                        );

                    })}


                    {/* ==================================
                        FLOOD ZONE MARKERS
                    ================================== */}

                    {zones.map((zone, index) => {

                        const latitude =
                            Number(zone.latitude);

                        const longitude =
                            Number(zone.longitude);


                        if (
                            !Number.isFinite(latitude) ||
                            !Number.isFinite(longitude)
                        ) {
                            return null;
                        }


                        const risk =
                            zone.flood_risk;


                        const color =
                            getRiskColor(risk);


                        return (

                            <CircleMarker

                                key={
                                    `${zone.taluk}-${index}`
                                }

                                center={[
                                    latitude,
                                    longitude
                                ]}

                                radius={10}

                                pathOptions={{

                                    color: "#ffffff",

                                    weight: 3,

                                    fillColor: color,

                                    fillOpacity: 0.9

                                }}

                            >

                                <Popup>

                                    <div className="zone-popup">

                                        <h3>
                                            {zone.taluk}
                                        </h3>


                                        <div

                                            className="popup-risk"

                                            style={{
                                                color: color
                                            }}

                                        >

                                            ● {risk} Risk

                                        </div>


                                        <div className="popup-details">

                                            <p>

                                                🌊 River:

                                                <strong>
                                                    {" "}
                                                    {zone.river}
                                                </strong>

                                            </p>


                                            <p>

                                                📍 Latitude:

                                                <strong>
                                                    {" "}
                                                    {latitude.toFixed(4)}
                                                </strong>

                                            </p>


                                            <p>

                                                📍 Longitude:

                                                <strong>
                                                    {" "}
                                                    {longitude.toFixed(4)}
                                                </strong>

                                            </p>


                                            <p>

                                                🏘️ Villages:

                                                <strong>
                                                    {" "}
                                                    {zone.villages_affected}
                                                </strong>

                                            </p>


                                            <p>

                                                🚑 Rescue Teams:

                                                <strong>
                                                    {" "}
                                                    {zone.rescue_teams_needed}
                                                </strong>

                                            </p>


                                            <p>

                                                🚤 Boats:

                                                <strong>
                                                    {" "}
                                                    {zone.boats_needed}
                                                </strong>

                                            </p>

                                        </div>

                                    </div>

                                </Popup>

                            </CircleMarker>

                        );

                    })}


                </MapContainer>


                {/* ==================================
                    LEGEND
                ================================== */}

                <div className="map-legend">

                    <div className="legend-item">

                        <span
                            className="legend-dot critical"
                        ></span>

                        Critical

                    </div>


                    <div className="legend-item">

                        <span
                            className="legend-dot high"
                        ></span>

                        High

                    </div>


                    <div className="legend-item">

                        <span
                            className="legend-dot medium"
                        ></span>

                        Medium

                    </div>


                    <div className="legend-item">

                        <span
                            className="legend-dot low"
                        ></span>

                        Low

                    </div>


                    {/* RIVER LEGEND */}

                    <div className="legend-item">

                        <span className="legend-river"></span>

                        Rivers

                    </div>

                </div>


                {/* ==================================
                    ZONE COUNT
                ================================== */}

                <div className="map-zone-count">

                    <strong>
                        {zones.length}
                    </strong>

                    <span>
                        Flood Zones
                    </span>

                </div>


                {/* ==================================
                    MAP DATA STATUS
                ================================== */}

                <div className="map-data-status">

                    <div>
                        🔵 District Boundary
                    </div>

                    <div>
                        🌊 {riverError
                            ? "River layer unavailable"
                            : `${rivers.length} river segments`}
                    </div>

                    <div>
                        📍 {zones.length} flood zones
                    </div>

                </div>


            </div>

        </section>

    );
}


export default FloodMap;
