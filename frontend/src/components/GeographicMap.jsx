
import React, { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api";
import "./GeographicMap.css";

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

function getFeatures(data) {
    return data?.type === "FeatureCollection" &&
        Array.isArray(data.features)
        ? data.features
        : [];
}

function getProperty(properties, names) {
    const entries = Object.entries(properties || {});

    for (const name of names) {
        const found = entries.find(([key]) =>
            key.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            name.toLowerCase().replace(/[^a-z0-9]/g, "")
        );

        if (found && found[1] !== null && found[1] !== "") {
            return String(found[1]);
        }
    }

    return "";
}

function getCoordinates(value, result = []) {
    if (!Array.isArray(value)) return result;

    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    ) {
        result.push(value);
    } else {
        value.forEach(item => getCoordinates(item, result));
    }

    return result;
}

function getFeatureCoordinates(feature) {
    return getCoordinates(feature?.geometry?.coordinates || []);
}

function getLabelCoordinate(feature) {
    const points = getFeatureCoordinates(feature);

    if (!points.length) return null;

    const longitudes = points.map(p => p[0]);
    const latitudes = points.map(p => p[1]);

    return [
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
        (Math.min(...latitudes) + Math.max(...latitudes)) / 2
    ];
}

function getTalukName(feature) {
    return getProperty(feature.properties, [
        "taluk",
        "taluk_name",
        "subdistrict",
        "name",
        "shapeName"
    ]) || "Taluk";
}

function getVillageName(feature) {
    return getProperty(feature.properties, [
        "village",
        "village_name",
        "name",
        "shapeName"
    ]) || "Unnamed village";
}

function getRiverName(feature) {
    return getProperty(feature.properties, [
        "name",
        "name:en",
        "name_en",
        "river",
        "waterway"
    ]);
}

function getGeometryPath(geometry, project) {
    if (!geometry) return "";

    const commands = [];

    const addLine = (coordinates, close = false) => {
        if (!coordinates?.length) return;

        coordinates.forEach((coordinate, index) => {
            const [x, y] = project(coordinate);

            commands.push(
                `${index === 0 ? "M" : "L"} ${x} ${y}`
            );
        });

        if (close) commands.push("Z");
    };

    const processPolygon = polygon => {
        polygon.forEach(ring => addLine(ring, true));
    };

    switch (geometry.type) {
        case "Polygon":
            processPolygon(geometry.coordinates);
            break;

        case "MultiPolygon":
            geometry.coordinates.forEach(processPolygon);
            break;

        case "LineString":
            addLine(geometry.coordinates);
            break;

        case "MultiLineString":
            geometry.coordinates.forEach(line => addLine(line));
            break;

        default:
            break;
    }

    return commands.join(" ");
}

function getDamCoordinates(dam) {
    const lat = Number(dam.latitude);
    const lon = Number(dam.longitude);

    if (
        dam.latitude === null ||
        dam.longitude === null ||
        dam.latitude === "" ||
        dam.longitude === "" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < 15 || lat > 18 ||
        lon < 73 || lon > 76
    ) {
        return null;
    }

    return [lon, lat];
}

export default function GeographicMap() {
    const [data, setData] = useState({});
    const [dams, setDams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState([]);

    const [zoom, setZoom] = useState(1);
    const [selectedVillage, setSelectedVillage] = useState(null);
    const [selectedDam, setSelectedDam] = useState(null);

    const [layers, setLayers] = useState({
        district: true,
        taluks: true,
        talukNames: true,
        rivers: true,
        riverNames: true,
        villages: true,
        dams: true,
        damNames: true
    });

    useEffect(() => {
        let active = true;

        async function loadData() {
            const failures = [];

            const geoEntries = await Promise.all(
                Object.entries(FILES).map(async ([key, path]) => {
                    try {
                        const response = await fetch(path);

                        if (!response.ok) {
                            throw new Error(path);
                        }

                        const result = await response.json();

                        if (
                            result.type !== "FeatureCollection" ||
                            !Array.isArray(result.features)
                        ) {
                            throw new Error("Invalid GeoJSON");
                        }

                        return [key, result];
                    } catch (error) {
                        console.error("GeoJSON loading error:", key, error);
                        failures.push(key);
                        return [key, null];
                    }
                })
            );

            let damRecords = [];

            try {
                const response = await fetch(
                    apiUrl("/api/dam-monitoring/dams")
                );

                if (!response.ok) {
                    throw new Error("Dam API unavailable");
                }

                const result = await response.json();

                damRecords =
                    result.dams ||
                    result.data ||
                    [];
            } catch (error) {
                console.error("Dam loading error:", error);
                failures.push("dam records");
            }

            if (!active) return;

            setData(Object.fromEntries(geoEntries));

            setDams(
                damRecords.filter(dam =>
                    SELECTED_DAMS.includes(
                        String(dam.dam_name || "")
                            .trim()
                            .toLowerCase()
                    )
                )
            );

            setErrors(failures);
            setLoading(false);
        }

        loadData();

        return () => {
            active = false;
        };
    }, []);

    const districtFeatures = getFeatures(data.district);
    const talukFeatures = getFeatures(data.taluks);
    const villageFeatures = getFeatures(data.villages);

    const riverFeatures = [
        ...getFeatures(data.mainRiver),
        ...getFeatures(data.rivers)
    ];

    const validDams = useMemo(
        () => dams.filter(dam => getDamCoordinates(dam)),
        [dams]
    );

    const bounds = useMemo(() => {
        const allFeatures = [
            ...districtFeatures,
            ...talukFeatures,
            ...riverFeatures,
            ...villageFeatures
        ];

        const points = allFeatures.flatMap(getFeatureCoordinates);

        if (!points.length) return null;

        const longitudes = points.map(p => p[0]);
        const latitudes = points.map(p => p[1]);

        return {
            minLon: Math.min(...longitudes),
            maxLon: Math.max(...longitudes),
            minLat: Math.min(...latitudes),
            maxLat: Math.max(...latitudes)
        };
    }, [data]);

    const project = coordinate => {
        if (!bounds) return [500, 350];

        const padding = 45;
        const width = 910;
        const height = 610;

        const lonRange = bounds.maxLon - bounds.minLon || 1;
        const latRange = bounds.maxLat - bounds.minLat || 1;

        const scale = Math.min(
            width / lonRange,
            height / latRange
        );

        const mapWidth = lonRange * scale;
        const mapHeight = latRange * scale;

        const offsetX = (width - mapWidth) / 2;
        const offsetY = (height - mapHeight) / 2;

        const x = padding + offsetX +
            (coordinate[0] - bounds.minLon) * scale;

        const y = 655 - padding - offsetY -
            (coordinate[1] - bounds.minLat) * scale;

        return [x, y];
    };

    const toggleLayer = key => {
        setLayers(previous => ({
            ...previous,
            [key]: !previous[key]
        }));
    };

    const layerOptions = [
        ["district", "District boundary", "#38bdf8"],
        ["taluks", "Taluk boundaries", "#a78bfa"],
        ["talukNames", "Taluk names", "#e9d5ff"],
        ["rivers", "Rivers and waterways", "#22d3ee"],
        ["riverNames", "River names", "#67e8f9"],
        ["villages", "Village locations", "#fbbf24"],
        ["dams", "Dam locations", "#fb7185"],
        ["damNames", "Dam names", "#fecdd3"]
    ];

    if (loading) {
        return (
            <div className="geo-loading">
                <div className="geo-spinner" />
                Loading Belagavi geographic datasets...
            </div>
        );
    }

    if (!bounds) {
        return (
            <div className="geo-error">
                <h2>Geographic data unavailable</h2>
                <p>
                    Could not load the district or geographic reference files.
                    Check the public/data directory.
                </p>
            </div>
        );
    }

    return (
        <section className="geo-page">

            <header className="geo-header">
                <div>
                    <span className="geo-eyebrow">
                        Q-RESCUE / GEOSPATIAL INTELLIGENCE
                    </span>

                    <h1>Belagavi Geographic Map</h1>

                    <p>
                        Explore taluks, villages, rivers and reservoir
                        locations across Belagavi district.
                    </p>
                </div>

                <div className="geo-header-badge">
                    <span className="geo-status-dot" />
                    GEOGRAPHIC DATA LOADED
                </div>
            </header>

            {errors.length > 0 && (
                <div className="geo-warning">
                    Some data could not be loaded: {errors.join(", ")}
                </div>
            )}

            <div className="geo-summary">
                <div>
                    <strong>{villageFeatures.length.toLocaleString("en-IN")}</strong>
                    <span>Village locations</span>
                </div>

                <div>
                    <strong>{talukFeatures.length}</strong>
                    <span>Taluk boundaries</span>
                </div>

                <div>
                    <strong>{riverFeatures.length}</strong>
                    <span>Waterway features</span>
                </div>

                <div>
                    <strong>{validDams.length}</strong>
                    <span>Dams with coordinates</span>
                </div>
            </div>

            <div className="geo-layout">

                <aside className="geo-sidebar">
                    <h3>Map layers</h3>

                    {layerOptions.map(([key, label, color]) => (
                        <label className="geo-layer" key={key}>
                            <input
                                type="checkbox"
                                checked={layers[key]}
                                onChange={() => toggleLayer(key)}
                            />

                            <span
                                className="geo-layer-dot"
                                style={{ background: color }}
                            />

                            {label}
                        </label>
                    ))}

                    <div className="geo-divider" />

                    <h3>Map information</h3>

                    <div className="geo-info">
                        <span>District features</span>
                        <strong>{districtFeatures.length}</strong>
                    </div>

                    <div className="geo-info">
                        <span>Taluk polygons</span>
                        <strong>{talukFeatures.length}</strong>
                    </div>

                    <div className="geo-info">
                        <span>Village points</span>
                        <strong>{villageFeatures.length}</strong>
                    </div>

                    <div className="geo-info">
                        <span>River features</span>
                        <strong>{riverFeatures.length}</strong>
                    </div>

                    <div className="geo-info">
                        <span>Selected dam records</span>
                        <strong>{dams.length}</strong>
                    </div>

                    <div className="geo-divider" />

                    <p className="geo-disclaimer">
                        Geographic reference map. Dam markers show database
                        coordinates, not live dam telemetry. River features
                        do not represent live water levels.
                    </p>
                </aside>

                <div className="geo-map-area">

                    <div className="geo-toolbar">
                        <span>BELAGAVI DISTRICT · KARNATAKA</span>

                        <div>
                            <button onClick={() =>
                                setZoom(value => Math.min(value * 1.3, 5))
                            }>
                                +
                            </button>

                            <button onClick={() =>
                                setZoom(value => Math.max(value / 1.3, 1))
                            }>
                                −
                            </button>

                            <button onClick={() => {
                                setZoom(1);
                                setSelectedVillage(null);
                                setSelectedDam(null);
                            }}>
                                Reset
                            </button>
                        </div>
                    </div>

                    <svg
                        className="geo-svg"
                        viewBox="0 0 1000 700"
                        role="img"
                        aria-label="Belagavi district geographic map"
                    >
                        <defs>
                            <pattern
                                id="geo-grid"
                                width="50"
                                height="50"
                                patternUnits="userSpaceOnUse"
                            >
                                <path
                                    d="M 50 0 L 0 0 0 50"
                                    fill="none"
                                    stroke="#263b52"
                                    strokeWidth="0.7"
                                />
                            </pattern>
                        </defs>

                        <rect
                            width="1000"
                            height="700"
                            fill="#0c1929"
                        />

                        <rect
                            width="1000"
                            height="700"
                            fill="url(#geo-grid)"
                        />

                        <g
                            transform={`translate(${500 - 500 * zoom} ${350 - 350 * zoom}) scale(${zoom})`}
                        >

                            {/* DISTRICT BOUNDARY */}
                            {layers.district && districtFeatures.map((feature, i) => (
                                <path
                                    key={`district-${i}`}
                                    d={getGeometryPath(feature.geometry, project)}
                                    fill="#164e63"
                                    fillOpacity="0.20"
                                    stroke="#38bdf8"
                                    strokeWidth="3"
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}

                            {/* TALUK BOUNDARIES */}
                            {layers.taluks && talukFeatures.map((feature, i) => (
                                <path
                                    key={`taluk-${i}`}
                                    d={getGeometryPath(feature.geometry, project)}
                                    fill="#8b5cf6"
                                    fillOpacity="0.09"
                                    stroke="#a78bfa"
                                    strokeWidth="1.3"
                                    vectorEffect="non-scaling-stroke"
                                >
                                    <title>{getTalukName(feature)}</title>
                                </path>
                            ))}

                            {/* TALUK LABELS */}
                            {layers.talukNames && talukFeatures.map((feature, i) => {
                                const coordinate = getLabelCoordinate(feature);

                                if (!coordinate) return null;

                                const [x, y] = project(coordinate);

                                return (
                                    <text
                                        key={`taluk-label-${i}`}
                                        x={x}
                                        y={y}
                                        textAnchor="middle"
                                        className="geo-taluk-label"
                                    >
                                        {getTalukName(feature)}
                                    </text>
                                );
                            })}

                            {/* RIVER NETWORK */}
                            {layers.rivers && riverFeatures.map((feature, i) => (
                                <path
                                    key={`river-${i}`}
                                    d={getGeometryPath(feature.geometry, project)}
                                    fill="none"
                                    stroke="#22d3ee"
                                    strokeWidth="1.7"
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}

                            {/* RIVER LABELS */}
                            {layers.riverNames && riverFeatures.map((feature, i) => {
                                const coordinate = getLabelCoordinate(feature);
                                const name = getRiverName(feature);

                                if (!coordinate || !name) return null;

                                const [x, y] = project(coordinate);

                                return (
                                    <text
                                        key={`river-label-${i}`}
                                        x={x}
                                        y={y}
                                        textAnchor="middle"
                                        className="geo-river-label"
                                    >
                                        {name}
                                    </text>
                                );
                            })}

                            {/* DAM MARKERS */}
                            {layers.dams && validDams.map((dam, i) => {
                                const coordinate = getDamCoordinates(dam);
                                const [x, y] = project(coordinate);

                                const selected = selectedDam?.id === dam.id;

                                return (
                                    <g
                                        key={`dam-${dam.id || i}`}
                                        className="geo-dam-marker"
                                        onClick={() => {
                                            setSelectedDam(dam);
                                            setSelectedVillage(null);
                                        }}
                                    >
                                        <circle
                                            cx={x}
                                            cy={y}
                                            r={selected ? 9 : 6}
                                            fill="#fb7185"
                                            stroke="#ffffff"
                                            strokeWidth="1.5"
                                            vectorEffect="non-scaling-stroke"
                                        />

                                        {layers.damNames && (
                                            <text
                                                x={x + 10}
                                                y={y - 10}
                                                className="geo-dam-label"
                                            >
                                                {dam.dam_name}
                                            </text>
                                        )}

                                        <title>{dam.dam_name}</title>
                                    </g>
                                );
                            })}

                            {/* VILLAGE POINTS */}
                            {layers.villages && villageFeatures.map((feature, i) => {
                                if (feature.geometry?.type !== "Point") {
                                    return null;
                                }

                                const coordinate = feature.geometry.coordinates;

                                if (
                                    !Array.isArray(coordinate) ||
                                    coordinate.length < 2
                                ) return null;

                                const [x, y] = project(coordinate);

                                const selected = selectedVillage?.index === i;

                                return (
                                    <circle
                                        key={`village-${i}`}
                                        cx={x}
                                        cy={y}
                                        r={selected ? 6 : 2.5}
                                        fill={selected ? "#ffffff" : "#fbbf24"}
                                        stroke="#0c1929"
                                        strokeWidth="0.8"
                                        vectorEffect="non-scaling-stroke"
                                        className="geo-village-point"
                                        onClick={() => {
                                            setSelectedVillage({
                                                index: i,
                                                name: getVillageName(feature),
                                                taluk: getTalukName(feature),
                                                census: getProperty(
                                                    feature.properties,
                                                    [
                                                        "census_code",
                                                        "village_code",
                                                        "code"
                                                    ]
                                                ) || "Not available"
                                            });

                                            setSelectedDam(null);
                                        }}
                                    >
                                        <title>
                                            {getVillageName(feature)}
                                        </title>
                                    </circle>
                                );
                            })}
                        </g>
                    </svg>

                    {selectedVillage && (
                        <div className="geo-popup">
                            <button
                                onClick={() => setSelectedVillage(null)}
                                aria-label="Close"
                            >
                                ×
                            </button>

                            <span className="geo-popup-label">
                                VILLAGE DETAILS
                            </span>

                            <strong>{selectedVillage.name}</strong>

                            <span>
                                Taluk: {selectedVillage.taluk}
                            </span>

                            <span>
                                Census code: {selectedVillage.census}
                            </span>
                        </div>
                    )}

                    {selectedDam && (
                        <div className="geo-popup">
                            <button
                                onClick={() => setSelectedDam(null)}
                                aria-label="Close"
                            >
                                ×
                            </button>

                            <span className="geo-popup-label">
                                RESERVOIR DETAILS
                            </span>

                            <strong>{selectedDam.dam_name}</strong>

                            <span>
                                River: {selectedDam.river_name || "Not specified"}
                            </span>

                            <span>
                                Latitude: {selectedDam.latitude}
                            </span>

                            <span>
                                Longitude: {selectedDam.longitude}
                            </span>

                            <span>Telemetry: Not verified</span>
                        </div>
                    )}

                    <div className="geo-legend">
                        <span><i className="legend-district" /> District</span>
                        <span><i className="legend-taluk" /> Taluk</span>
                        <span><i className="legend-river" /> Rivers</span>
                        <span><i className="legend-village" /> Villages</span>
                        <span><i className="legend-dam" /> Dams</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
