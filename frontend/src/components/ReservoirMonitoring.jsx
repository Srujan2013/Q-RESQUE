import React, { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../api";
import "./ReservoirMonitoring.css";

const SELECTED_DAMS = [
    "hidkal dam",
    "naviluteertha dam (renukasagar)",
    "rakasakoppa",
    "dhupdal dam"
];

function ReservoirMonitoring() {
    const [reservoirs, setReservoirs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    const fetchReservoirs = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                apiUrl("/api/dam-monitoring/summary")
            );

            if (!response.ok) {
                throw new Error("Failed to fetch dam inventory");
            }

            const data = await response.json();
            const records = Array.isArray(data)
                ? data
                : data.dams || [];

            const selected = records.filter((item) =>
                SELECTED_DAMS.includes(
                    String(item.dam_name || "").trim().toLowerCase()
                )
            );

            setReservoirs(selected);
        } catch (err) {
            console.error(err);
            setError("Unable to connect to the dam inventory service.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReservoirs();
    }, [fetchReservoirs]);

    const format = (value, unit = "") => {
        if (value === null || value === undefined || value === "") {
            return "—";
        }
        return `${value}${unit}`;
    };

    const hasCoordinates = (item) =>
        item.latitude !== null &&
        item.latitude !== undefined &&
        item.longitude !== null &&
        item.longitude !== undefined;

    const hasObservation = (item) =>
        Boolean(item.latest_observation);

    const hasInspection = (item) =>
        Boolean(item.latest_inspection);

    const visibleReservoirs = reservoirs.filter((item) =>
        String(item.dam_name || "")
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    const observationCount = reservoirs.filter(hasObservation).length;
    const inspectionCount = reservoirs.filter(hasInspection).length;
    const coordinateCount = reservoirs.filter(hasCoordinates).length;

    if (loading) {
        return (
            <section className="reservoir-section">
                <div className="reservoir-message">
                    Loading dam inventory...
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="reservoir-section">
                <div className="reservoir-message reservoir-error">
                    <p>{error}</p>
                    <button onClick={fetchReservoirs}>Retry</button>
                </div>
            </section>
        );
    }

    return (
        <section
            className="reservoir-section"
            id="reservoir-monitoring"
        >
            <div className="reservoir-header">
                <div>
                    <span className="reservoir-eyebrow">
                        🌊 Q-RESCUE DAM INTELLIGENCE
                    </span>
                    <h2>Dam Inventory &amp; Monitoring Status</h2>
                    <p>
                        Stored technical records for four selected
                        Belagavi district dams. Live telemetry is not connected.
                    </p>
                </div>

                <button
                    className="reservoir-refresh"
                    onClick={fetchReservoirs}
                >
                    ↻ Refresh Records
                </button>
            </div>

            <div className="reservoir-summary">
                <div className="reservoir-summary-card">
                    <span>Selected Dam Records</span>
                    <strong>{reservoirs.length} / 4</strong>
                </div>

                <div className="reservoir-summary-card">
                    <span>Records with Coordinates</span>
                    <strong>{coordinateCount} / {reservoirs.length}</strong>
                </div>

                <div className="reservoir-summary-card">
                    <span>Latest Observations Available</span>
                    <strong>{observationCount} / {reservoirs.length}</strong>
                </div>
            </div>

            <div className="reservoir-controls">
                <input
                    type="text"
                    placeholder="Search selected dams..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="reservoir-grid">
                {visibleReservoirs.map((item) => (
                    <article className="reservoir-card" key={item.id}>
                        <div className="reservoir-card-top">
                            <span className="reservoir-icon">🏞️</span>
                            <span className="reservoir-scope">
                                {item.monitoring_scope || "LOCAL"} SCOPE
                            </span>
                        </div>

                        <h3>{item.dam_name}</h3>

                        <p className="reservoir-river">
                            {item.river_name || "River not verified"}
                        </p>

                        <div className="reservoir-card-stats">
                            <div>
                                <span>Gross Capacity</span>
                                <strong>{format(item.gross_capacity_tmc, " TMC")}</strong>
                            </div>
                            <div>
                                <span>Stored Capacity Reference</span>
                                <strong>{format(item.live_capacity_tmc, " TMC")}</strong>
                            </div>
                            <div>
                                <span>Dam Height</span>
                                <strong>{format(item.dam_height_m, " m")}</strong>
                            </div>
                            <div>
                                <span>Dam Length</span>
                                <strong>{format(item.dam_length_m, " m")}</strong>
                            </div>
                        </div>

                        <div className="reservoir-details">
                            <h4>Technical Inventory</h4>

                            <p><strong>District:</strong> {format(item.district)}</p>
                            <p><strong>River:</strong> {format(item.river_name)}</p>
                            <p><strong>River Basin:</strong> {format(item.river_basin)}</p>
                            <p><strong>Dam Type:</strong> {format(item.dam_type)}</p>
                            <p><strong>FRL:</strong> {format(item.frl_m, " m")}</p>
                            <p><strong>MDDL:</strong> {format(item.mddl_m, " m")}</p>
                            <p><strong>Construction Year:</strong> {format(item.construction_year)}</p>
                            <p><strong>Spillway Capacity:</strong> {format(item.spillway_capacity_cusecs, " cusecs")}</p>
                            <p><strong>Latitude:</strong> {format(item.latitude)}</p>
                            <p><strong>Longitude:</strong> {format(item.longitude)}</p>
                            <p><strong>Operating Authority:</strong> {format(item.operating_authority)}</p>
                            <p><strong>Monitoring Scope:</strong> {format(item.monitoring_scope)}</p>

                            <h4>Monitoring Data Availability</h4>

                            <p>
                                <strong>Telemetry:</strong>{" "}
                                <span className="reservoir-status-unavailable">
                                    {item.measurement_status === "AVAILABLE"
                                        ? "Measurement record available"
                                        : "Not connected / unavailable"}
                                </span>
                            </p>
                            <p><strong>Latest Observation:</strong> {hasObservation(item) ? "Record available" : "No observation recorded"}</p>
                            <p><strong>Latest Inspection:</strong> {hasInspection(item) ? "Record available" : "No inspection recorded"}</p>
                            <p><strong>Active Alerts:</strong> {format(item.active_alert_count, "")}</p>
                            <p><strong>Coordinates:</strong> {hasCoordinates(item) ? "Available in database" : "Unavailable"}</p>

                            {item.official_source_name && (
                                <p>
                                    <strong>Data Source:</strong>{" "}
                                    {item.official_source_name}
                                </p>
                            )}

                            {item.official_source_url && (
                                <a
                                    href={item.official_source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View Referenced Source ↗
                                </a>
                            )}
                        </div>
                    </article>
                ))}
            </div>

            {visibleReservoirs.length === 0 && (
                <div className="reservoir-message">
                    No matching reservoir records found.
                </div>
            )}

            <div className="reservoir-disclaimer">
                <strong>Data limitation:</strong> This section displays stored
                dam inventory and database monitoring records. Stored capacity
                references are not current water-storage measurements.
                No live water-level, inflow, outflow or gate telemetry is
                connected. Missing observations and inspections do not imply
                that a dam is unsafe or that an inspection has not occurred
                outside this application. Inventory data is not a structural
                safety certification.
            </div>
        </section>
    );
}

export default ReservoirMonitoring;
