import React, { useEffect, useMemo, useState } from "react";
import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Polyline,
    Popup,
    useMap
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./EvacuationPlanner.css";

function FitRoute({ origin, destination, geometry }) {
    const map = useMap();

    useEffect(() => {
        if (geometry?.coordinates?.length) {
            const bounds = geometry.coordinates.map(([lon, lat]) => [lat, lon]);
            map.fitBounds(bounds, { padding: [35, 35] });
        } else if (origin) {
            map.setView([origin.lat, origin.lon], 11);
        }
    }, [map, origin, destination, geometry]);

    return null;
}

export default function EvacuationPlanner({ villages = [] }) {
    const [originIndex, setOriginIndex] = useState("0");
    const [destinationName, setDestinationName] = useState("");
    const [destinationLat, setDestinationLat] = useState("");
    const [destinationLon, setDestinationLon] = useState("");
    const [capacity, setCapacity] = useState("");
    const [route, setRoute] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [autoLoading, setAutoLoading] = useState(false);
    const [autoCandidates, setAutoCandidates] = useState([]);

    const validVillages = useMemo(() => villages.filter(v => {
        const c = v.geometry?.coordinates;
        return Array.isArray(c) &&
            c.length >= 2 &&
            Number.isFinite(Number(c[0])) &&
            Number.isFinite(Number(c[1]));
    }), [villages]);

    const selectedVillage = validVillages[Number(originIndex)] || null;
    const coords = selectedVillage?.geometry?.coordinates;

    const origin = coords
        ? { lon: Number(coords[0]), lat: Number(coords[1]) }
        : null;

    const destination = {
        lat: Number(destinationLat),
        lon: Number(destinationLon)
    };

    async function calculateRoute(event) {
        event.preventDefault();
        setError("");
        setRoute(null);

        if (!origin) {
            setError("Select a village with valid coordinates.");
            return;
        }

        if (!destinationName.trim()) {
            setError("Enter a destination name.");
            return;
        }

        if (
            !destinationLat.trim() ||
            !destinationLon.trim() ||
            !Number.isFinite(destination.lat) ||
            !Number.isFinite(destination.lon) ||
            destination.lat < -90 ||
            destination.lat > 90 ||
            destination.lon < -180 ||
            destination.lon > 180
        ) {
            setError("Enter valid destination latitude and longitude.");
            return;
        }

        if (origin.lat === destination.lat && origin.lon === destination.lon) {
            setError("Origin and destination cannot be the same point.");
            return;
        }

        setLoading(true);

        try {
            const url =
                `https://router.project-osrm.org/route/v1/driving/` +
                `${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
                `?overview=full&geometries=geojson&steps=false`;

            const response = await fetch(url);
            if (!response.ok) throw new Error("Routing service request failed.");

            const data = await response.json();

            if (data.code !== "Ok" || !data.routes?.length) {
                throw new Error("No driving route was found between these points.");
            }

            const result = data.routes[0];

            setRoute({
                geometry: result.geometry,
                distanceKm: result.distance / 1000,
                durationMinutes: result.duration / 60,
                destinationName: destinationName.trim(),
                capacity: capacity.trim()
            });
        } catch (err) {
            setError(
                `${err.message} Check your internet connection and coordinates, then try again.`
            );
        } finally {
            setLoading(false);
        }
    }


    function selectCandidate(candidate) {
        setDestinationName(candidate.name);
        setDestinationLat(String(candidate.lat));
        setDestinationLon(String(candidate.lon));
        setCapacity("");

        setRoute({
            geometry: candidate.geometry,
            distanceKm: candidate.distanceKm,
            durationMinutes: candidate.durationMinutes,
            destinationName: candidate.name,
            capacity: "",
            destinationSource: "OpenStreetMap candidate",
            destinationType: candidate.type
        });
    }

    async function findNearestDestinations() {
        setError("");
        setRoute(null);
        setAutoCandidates([]);

        if (!origin) {
            setError("Select a village with valid coordinates.");
            return;
        }

        setAutoLoading(true);

        try {
            const radius = 20000;

            const query = `
[out:json][timeout:30];
(
  node(around:${radius},${origin.lat},${origin.lon})["amenity"~"shelter|school|hospital|clinic|community_centre"];
  way(around:${radius},${origin.lat},${origin.lon})["amenity"~"shelter|school|hospital|clinic|community_centre"];
  relation(around:${radius},${origin.lat},${origin.lon})["amenity"~"shelter|school|hospital|clinic|community_centre"];
  node(around:${radius},${origin.lat},${origin.lon})["social_facility"];
  way(around:${radius},${origin.lat},${origin.lon})["social_facility"];
  relation(around:${radius},${origin.lat},${origin.lon})["social_facility"];
);
out center tags;
`;

            const overpassServers = [
                "https://overpass-api.de/api/interpreter",
                "https://overpass.kumi.systems/api/interpreter",
                "https://overpass.nchc.org.tw/api/interpreter"
            ];

            let data = null;
            let lastSearchError = null;

            for (const server of overpassServers) {
                const controller = new AbortController();
                const searchTimeout = setTimeout(
                    () => controller.abort(),
                    15000
                );

                try {
                    const response = await fetch(server, {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded;charset=UTF-8"
                        },
                        body: `data=${encodeURIComponent(query)}`,
                        signal: controller.signal
                    });

                    if (!response.ok) {
                        throw new Error(`Search server returned HTTP ${response.status}`);
                    }

                    const result = await response.json();

                    if (!Array.isArray(result.elements)) {
                        throw new Error("Invalid destination search response.");
                    }

                    data = result;
                    break;
                } catch (serverError) {
                    lastSearchError = serverError;
                    console.warn(
                        "Overpass server failed, trying fallback:",
                        server,
                        serverError.message
                    );
                } finally {
                    clearTimeout(searchTimeout);
                }
            }

            if (!data) {
                throw new Error(
                    `All destination search servers failed. ${
                        lastSearchError?.message || "Please try again later."
                    }`
                );
            }
            const seen = new Set();

            const candidates = (data.elements || [])
                .map(item => {
                    const tags = item.tags || {};
                    const lat = Number(item.lat ?? item.center?.lat);
                    const lon = Number(item.lon ?? item.center?.lon);

                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                        return null;
                    }

                    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
                    if (seen.has(key)) return null;
                    seen.add(key);

                    const type =
                        tags.amenity || tags.social_facility || "public facility";

                    const distance = 6371 * 2 * Math.asin(Math.sqrt(
                        Math.sin((lat - origin.lat) * Math.PI / 360) ** 2 +
                        Math.cos(origin.lat * Math.PI / 180) *
                        Math.cos(lat * Math.PI / 180) *
                        Math.sin((lon - origin.lon) * Math.PI / 360) ** 2
                    ));

                    return {
                        id: item.id,
                        name: tags.name || `${type.replaceAll("_", " ")} (unnamed)`,
                        type: type.replaceAll("_", " "),
                        lat,
                        lon,
                        straightDistanceKm: distance
                    };
                })
                .filter(Boolean)
                .filter(item => item.straightDistanceKm > 0.02)
                .sort((a, b) => a.straightDistanceKm - b.straightDistanceKm)
                .slice(0, 8);

            if (!candidates.length) {
                throw new Error("No mapped public facilities found within 20 km.");
            }

            const routed = await Promise.all(
                candidates.map(async candidate => {
                    try {
                        const url =
                            `https://router.project-osrm.org/route/v1/driving/` +
                            `${origin.lon},${origin.lat};${candidate.lon},${candidate.lat}` +
                            `?overview=full&geometries=geojson&steps=false`;

                        const routeResponse = await fetch(url);
                        if (!routeResponse.ok) return null;

                        const routeData = await routeResponse.json();

                        if (routeData.code !== "Ok" || !routeData.routes?.length) {
                            return null;
                        }

                        const result = routeData.routes[0];

                        return {
                            ...candidate,
                            geometry: result.geometry,
                            distanceKm: result.distance / 1000,
                            durationMinutes: result.duration / 60
                        };
                    } catch {
                        return null;
                    }
                })
            );

            const ranked = routed
                .filter(Boolean)
                .sort((a, b) => a.distanceKm - b.distanceKm);

            if (!ranked.length) {
                throw new Error("No routable destinations were found.");
            }

            setAutoCandidates(ranked.slice(0, 5));
            selectCandidate(ranked[0]);

        } catch (err) {
            setError(
                `${err.message} Please try again or enter a destination manually.`
            );
        } finally {
            setAutoLoading(false);
        }
    }

    function clearRoute() {
        setRoute(null);
        setError("");
        setAutoCandidates([]);
    }

    return (
        <section className="rescue-panel evacuation-planner">
            <div className="rescue-panel-heading">
                <div>
                    <span className="rescue-kicker">PHASE 6A · EVACUATION PLANNING</span>
                    <h2>Village-to-destination route planner</h2>
                    <p>
                        Select a scenario village and enter a proposed destination
                        to calculate a road route.
                    </p>
                </div>
                <span className="evacuation-unverified">DESTINATIONS UNVERIFIED</span>
            </div>

            <form className="evacuation-form" onSubmit={calculateRoute}>
                <label>
                    Origin village
                    <select
                        value={originIndex}
                        onChange={e => {
                            setOriginIndex(e.target.value);
                            clearRoute();
                        }}
                        disabled={!validVillages.length}
                    >
                        {!validVillages.length && (
                            <option value="0">No village locations available</option>
                        )}
                        {validVillages.map((v, i) => (
                            <option value={String(i)} key={`${v.village_name}-${i}`}>
                                {v.village_name} · {v.taluk}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Proposed shelter / destination name
                    <input
                        value={destinationName}
                        onChange={e => setDestinationName(e.target.value)}
                        placeholder="Enter destination name"
                        maxLength={100}
                    />
                </label>

                <div className="evacuation-coordinate-grid">
                    <label>
                        Destination latitude
                        <input
                            type="number"
                            step="any"
                            value={destinationLat}
                            onChange={e => setDestinationLat(e.target.value)}
                            placeholder="e.g. 16.17"
                        />
                    </label>
                    <label>
                        Destination longitude
                        <input
                            type="number"
                            step="any"
                            value={destinationLon}
                            onChange={e => setDestinationLon(e.target.value)}
                            placeholder="e.g. 74.83"
                        />
                    </label>
                    <label>
                        Stated capacity (optional)
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={capacity}
                            onChange={e => setCapacity(e.target.value)}
                            placeholder="People"
                        />
                    </label>
                </div>

                <div className="evacuation-actions">
                    <button
                        type="button"
                        onClick={findNearestDestinations}
                        disabled={autoLoading || loading || !origin}
                    >
                        {autoLoading
                            ? "Finding nearby destinations..."
                            : "Find nearest destinations automatically"}
                    </button>

                    <button type="submit" disabled={loading || autoLoading || !validVillages.length}>
                        {loading ? "Calculating route..." : "Calculate road route"}
                    </button>
                    <button type="button" className="evacuation-clear" onClick={clearRoute}>
                        Clear route
                    </button>
                </div>
            </form>

            {!validVillages.length && (
                <p className="evacuation-message">
                    Run a Model Lab scenario that returns village coordinates before
                    planning a route.
                </p>
            )}

            {error && <p className="evacuation-error">{error}</p>}

            {autoCandidates.length > 0 && (
                <div className="evacuation-candidates">
                    <strong>Nearby routable destinations</strong>
                    <p>Ranked by calculated road distance, shortest first.</p>

                    {autoCandidates.map((candidate, index) => (
                        <div
                            className="evacuation-candidate"
                            key={`${candidate.id}-${candidate.lat}-${candidate.lon}`}
                        >
                            <div>
                                <strong>{index + 1}. {candidate.name}</strong>
                                <span>
                                    {candidate.type} · {candidate.distanceKm.toFixed(2)} km ·
                                    {Math.round(candidate.durationMinutes)} min
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => selectCandidate(candidate)}
                            >
                                Use this route
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {route && (
                <div className="evacuation-result">
                    <div className="evacuation-result-grid">
                        <div>
                            <span>Road distance</span>
                            <strong>{route.distanceKm.toFixed(2)} km</strong>
                        </div>
                        <div>
                            <span>Estimated driving time</span>
                            <strong>{Math.round(route.durationMinutes)} min</strong>
                        </div>
                        <div>
                            <span>Destination</span>
                            <strong>{route.destinationName}</strong>
                        </div>
                    </div>

                    <p>
                        Route calculated using the public OSRM demonstration routing
                        service. Travel time is an estimate and does not account for
                        current traffic, road closures or flood conditions.
                    </p>
                    {route.destinationSource && (
                        <p>
                            Destination source: {route.destinationSource}.
                            Facility type: {route.destinationType}.
                            Shelter approval and capacity are not verified.
                        </p>
                    )}
                </div>
            )}

            {origin && (
                <div className="evacuation-map">
                    <MapContainer
                        center={[origin.lat, origin.lon]}
                        zoom={11}
                        scrollWheelZoom
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        <CircleMarker
                            center={[origin.lat, origin.lon]}
                            radius={8}
                            pathOptions={{
                                color: "#1d4ed8",
                                fillColor: "#3b82f6",
                                fillOpacity: 1
                            }}
                        >
                            <Popup>
                                <strong>Origin village</strong>
                                <br />
                                {selectedVillage?.village_name}, {selectedVillage?.taluk}
                            </Popup>
                        </CircleMarker>

                        {route && (
                            <>
                                <CircleMarker
                                    center={[destination.lat, destination.lon]}
                                    radius={8}
                                    pathOptions={{
                                        color: "#15803d",
                                        fillColor: "#22c55e",
                                        fillOpacity: 1
                                    }}
                                >
                                    <Popup>
                                        <strong>{route.destinationName}</strong>
                                        <br />
                                        Proposed destination, not verified as a shelter.
                                        {route.capacity && (
                                            <p>Entered capacity: {route.capacity}</p>
                                        )}
                                    </Popup>
                                </CircleMarker>

                                <Polyline
                                    positions={route.geometry.coordinates.map(
                                        ([lon, lat]) => [lat, lon]
                                    )}
                                    pathOptions={{
                                        color: "#2563eb",
                                        weight: 5,
                                        opacity: 0.85
                                    }}
                                />
                            </>
                        )}

                        <FitRoute
                            origin={origin}
                            destination={route ? destination : null}
                            geometry={route?.geometry}
                        />
                    </MapContainer>
                </div>
            )}

            <div className="evacuation-safety-note">
                <strong>Route status: NOT VERIFIED FOR EVACUATION</strong>
                <p>
                    A road route is not proof of a safe evacuation path. Destination
                    coordinates and capacity are user-entered and unverified. This
                    planner has no live flood-depth, road-closure, bridge-condition,
                    shelter-approval or traffic feed. Confirm all conditions with
                    local emergency authorities before real-world use.
                </p>
            </div>
        </section>
    );
}
