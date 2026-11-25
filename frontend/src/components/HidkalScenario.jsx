
import React, { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../api";
import "./HidkalScenario.css";

const initialValues = {
    scenario_name: "Hidkal 12-hour scenario",
    forecast_start: new Date().toISOString().slice(0, 16),
    rainfall_mm_12h: "",
    reservoir_level_m: "",
    gate_opening_percent: "",
    inflow_m3s: "",
    outflow_m3s: "",
    soil_moisture_percent: "",
    dem_layer_name: "",
    river_distance_layer_name: "",
    notes: ""
};

const numericFields = [
    {
        key: "rainfall_mm_12h",
        label: "Rainfall forecast",
        unit: "mm over 12 hours",
        min: 0,
        max: 2000,
        step: 0.1,
        help: "Catchment-average rainfall forecast for the next 12 hours."
    },
    {
        key: "reservoir_level_m",
        label: "Reservoir water level",
        unit: "metres",
        min: 0,
        max: 1000,
        step: 0.001,
        help: "Observed level at the forecast start time."
    },
    {
        key: "gate_opening_percent",
        label: "Gate opening",
        unit: "percent",
        min: 0,
        max: 100,
        step: 0.1,
        help: "Representative gate opening."
    },
    {
        key: "inflow_m3s",
        label: "Reservoir inflow",
        unit: "m³/s",
        min: 0,
        max: 1000000,
        step: 0.1,
        help: "Measured or forecast inflow at the reservoir."
    },
    {
        key: "outflow_m3s",
        label: "Reservoir outflow",
        unit: "m³/s",
        min: 0,
        max: 1000000,
        step: 0.1,
        help: "Measured or planned release."
    },
    {
        key: "soil_moisture_percent",
        label: "Soil moisture",
        unit: "percent",
        min: 0,
        max: 100,
        step: 0.1,
        help: "Catchment representative soil moisture."
    }
];

export default function HidkalScenario() {
    const [values, setValues] = useState(initialValues);
    const [dataStatus, setDataStatus] = useState("HISTORICAL_BASED_SCENARIO");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [savedScenario, setSavedScenario] = useState(null);

    const [scenarios, setScenarios] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState("");

    function update(key, value) {
        setValues((current) => ({ ...current, [key]: value }));
    }

    const loadScenarios = useCallback(async () => {
        setLoadingHistory(true);
        setHistoryError("");

        try {
            const response = await fetch(apiUrl("/api/hidkal/scenarios"));

            if (!response.ok) {
                throw new Error(`Request failed (${response.status})`);
            }

            const result = await response.json();
            setScenarios(Array.isArray(result.scenarios) ? result.scenarios : []);
        } catch (error) {
            setHistoryError(error.message || "Could not load saved scenarios.");
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        loadScenarios();
    }, [loadScenarios]);

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage("");
        setSavedScenario(null);

        const required = [
            "scenario_name",
            "forecast_start",
            "rainfall_mm_12h",
            "reservoir_level_m",
            "gate_opening_percent",
            "inflow_m3s",
            "outflow_m3s",
            "soil_moisture_percent",
            "dem_layer_name",
            "river_distance_layer_name"
        ];

        const missing = required.filter(
            (key) => String(values[key]).trim() === ""
        );

        if (missing.length) {
            setMessage("Please complete all eight inputs and scenario details.");
            return;
        }

        const payload = {
            scenario_name: values.scenario_name.trim(),
            forecast_start: new Date(values.forecast_start).toISOString(),
            forecast_horizon_hours: 12,
            rainfall_mm_12h: Number(values.rainfall_mm_12h),
            reservoir_level_m: Number(values.reservoir_level_m),
            gate_opening_percent: Number(values.gate_opening_percent),
            inflow_m3s: Number(values.inflow_m3s),
            outflow_m3s: Number(values.outflow_m3s),
            soil_moisture_percent: Number(values.soil_moisture_percent),
            dem_layer_name: values.dem_layer_name.trim(),
            river_distance_layer_name: values.river_distance_layer_name.trim(),
            data_status: dataStatus,
            notes: values.notes.trim() || null
        };

        setSaving(true);

        try {
            const response = await fetch(apiUrl("/api/hidkal/scenarios"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                const detail = Array.isArray(result.detail)
                    ? result.detail.map((item) => item.msg).join(", ")
                    : result.detail;

                throw new Error(detail || `Request failed (${response.status})`);
            }

            setSavedScenario(result);
            setMessage("Scenario saved. No flood forecast has been run yet.");

            await loadScenarios();

        } catch (error) {
            setMessage(
                `${error.message}. Check that the FastAPI backend is running.`
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="hidkal-page">
            <section className="hidkal-heading">
                <div>
                    <p className="hidkal-eyebrow">Q-RESCUE / FLOOD SCENARIO LAB</p>
                    <h1>Hidkal 12-hour scenario</h1>
                    <p>
                        Enter the reservoir and catchment conditions used by the
                        VQC and hydraulic modelling workflow.
                    </p>
                </div>
                <span className="hidkal-horizon">12 HOUR HORIZON</span>
            </section>

            <form className="hidkal-form" onSubmit={handleSubmit}>
                <section className="hidkal-panel">
                    <div className="hidkal-section-title">
                        <div>
                            <h2>Scenario details</h2>
                            <p>Name this run and set the forecast start time.</p>
                        </div>
                        <span className="hidkal-step">01</span>
                    </div>

                    <div className="hidkal-grid two">
                        <label className="hidkal-field">
                            <span>Scenario name</span>
                            <input
                                value={values.scenario_name}
                                onChange={(e) => update("scenario_name", e.target.value)}
                                maxLength={120}
                                required
                            />
                        </label>

                        <label className="hidkal-field">
                            <span>Forecast start time</span>
                            <input
                                type="datetime-local"
                                value={values.forecast_start}
                                onChange={(e) => update("forecast_start", e.target.value)}
                                required
                            />
                        </label>
                    </div>

                    <div className="hidkal-fixed-row">
                        <span>Forecast horizon</span>
                        <strong>12 hours · hourly reporting target</strong>
                    </div>
                </section>

                <section className="hidkal-panel">
                    <div className="hidkal-section-title">
                        <div>
                            <h2>Reservoir and catchment conditions</h2>
                            <p>Six numeric values describing the scenario.</p>
                        </div>
                        <span className="hidkal-step">02</span>
                    </div>

                    <div className="hidkal-grid two">
                        {numericFields.map((field, index) => (
                            <label className="hidkal-field" key={field.key}>
                                <span className="hidkal-field-top">
                                    <span>{index + 1}. {field.label}</span>
                                    <small>{field.unit}</small>
                                </span>

                                <input
                                    type="number"
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                    value={values[field.key]}
                                    onChange={(e) => update(field.key, e.target.value)}
                                    placeholder={`Enter ${field.label.toLowerCase()}`}
                                    required
                                />

                                <small className="hidkal-help">{field.help}</small>
                            </label>
                        ))}
                    </div>
                </section>

                <section className="hidkal-panel">
                    <div className="hidkal-section-title">
                        <div>
                            <h2>Geographical input layers</h2>
                            <p>
                                Enter spatial dataset filenames or registered layer
                                identifiers.
                            </p>
                        </div>
                        <span className="hidkal-step">03</span>
                    </div>

                    <div className="hidkal-grid two">
                        <label className="hidkal-field">
                            <span>7. Terrain elevation (DEM)</span>
                            <input
                                value={values.dem_layer_name}
                                onChange={(e) => update("dem_layer_name", e.target.value)}
                                placeholder="e.g. hidkal_dem_30m.tif"
                                required
                            />
                            <small className="hidkal-help">
                                Georeferenced elevation raster. Units must be metres.
                            </small>
                        </label>

                        <label className="hidkal-field">
                            <span>8. Distance-from-river layer</span>
                            <input
                                value={values.river_distance_layer_name}
                                onChange={(e) => update("river_distance_layer_name", e.target.value)}
                                placeholder="e.g. ghataprabha_distance.tif"
                                required
                            />
                            <small className="hidkal-help">
                                Distance raster in metres, aligned to the DEM.
                            </small>
                        </label>
                    </div>
                </section>

                <section className="hidkal-panel">
                    <div className="hidkal-section-title">
                        <div>
                            <h2>Data provenance</h2>
                            <p>Tell the system how the scenario values were obtained.</p>
                        </div>
                        <span className="hidkal-step">04</span>
                    </div>

                    <label className="hidkal-field">
                        <span>Scenario data status</span>
                        <select
                            value={dataStatus}
                            onChange={(e) => setDataStatus(e.target.value)}
                        >
                            <option value="HISTORICAL_BASED_SCENARIO">
                                Scenario based on historical records
                            </option>
                            <option value="MANUAL_ASSUMPTION">
                                Manually entered hypothetical scenario
                            </option>
                            <option value="OBSERVED">
                                Observed / measured conditions
                            </option>
                            <option value="FORECAST">
                                Forecast values
                            </option>
                        </select>
                    </label>

                    <label className="hidkal-field hidkal-notes">
                        <span>Notes (optional)</span>
                        <textarea
                            rows={3}
                            value={values.notes}
                            onChange={(e) => update("notes", e.target.value)}
                            placeholder="Record source names, gate-wise openings, units or assumptions."
                        />
                    </label>
                </section>

                <div className="hidkal-submit-row">
                    <div className="hidkal-disclaimer">
                        Saving a scenario does not run a VQC, HEC-HMS or HEC-RAS
                        simulation. Outputs remain unavailable until those models
                        are configured and validated.
                    </div>

                    <button type="submit" disabled={saving}>
                        {saving ? "Saving scenario..." : "Save scenario"}
                    </button>
                </div>

                {message && (
                    <div className={`hidkal-message ${savedScenario ? "success" : "error"}`}>
                        {message}
                        {savedScenario?.scenario_id && (
                            <strong> Scenario ID: {savedScenario.scenario_id}</strong>
                        )}
                        {savedScenario?.status && (
                            <span> Status: {savedScenario.status}</span>
                        )}
                    </div>
                )}
            </form>

            {/* SAVED SCENARIO HISTORY */}
            <section className="hidkal-panel hidkal-history">
                <div className="hidkal-section-title">
                    <div>
                        <h2>Saved Hidkal Scenarios</h2>
                        <p>Previously saved scenarios retrieved from the Q-RESCUE database.</p>
                    </div>

                    <button
                        type="button"
                        onClick={loadScenarios}
                        disabled={loadingHistory}
                    >
                        {loadingHistory ? "Refreshing..." : "Refresh Scenarios"}
                    </button>
                </div>

                {historyError && (
                    <div className="hidkal-message error">
                        Could not load scenarios: {historyError}
                    </div>
                )}

                {loadingHistory && scenarios.length === 0 && (
                    <p>Loading saved scenarios...</p>
                )}

                {!loadingHistory && !historyError && scenarios.length === 0 && (
                    <p>No scenarios saved yet. Save your first scenario above.</p>
                )}

                {scenarios.length > 0 && (
                    <div className="hidkal-history-list">
                        {scenarios.map((scenario) => (
                            <article className="hidkal-history-card" key={scenario.id}>
                                <div className="hidkal-history-heading">
                                    <div>
                                        <h3>{scenario.scenario_name}</h3>
                                        <small>Scenario ID: {scenario.id}</small>
                                    </div>

                                    <span className="hidkal-history-status">
                                        {scenario.status}
                                    </span>
                                </div>

                                <div className="hidkal-history-grid">
                                    <div>
                                        <small>Rainfall</small>
                                        <strong>{scenario.rainfall_mm_12h} mm</strong>
                                    </div>
                                    <div>
                                        <small>Reservoir level</small>
                                        <strong>{scenario.reservoir_level_m} m</strong>
                                    </div>
                                    <div>
                                        <small>Gate opening</small>
                                        <strong>{scenario.gate_opening_percent}%</strong>
                                    </div>
                                    <div>
                                        <small>Inflow</small>
                                        <strong>{scenario.inflow_m3s} m³/s</strong>
                                    </div>
                                    <div>
                                        <small>Outflow</small>
                                        <strong>{scenario.outflow_m3s} m³/s</strong>
                                    </div>
                                    <div>
                                        <small>Soil moisture</small>
                                        <strong>{scenario.soil_moisture_percent}%</strong>
                                    </div>
                                </div>

                                <div className="hidkal-history-footer">
                                    <span>Data: {scenario.data_status}</span>
                                    <span>
                                        Forecast: {scenario.forecast_horizon_hours} hours
                                    </span>
                                </div>

                                <small className="hidkal-history-date">
                                    Forecast start: {scenario.forecast_start}
                                </small>
                            </article>
                        ))}
                    </div>
                )}

                <p className="hidkal-disclaimer">
                    These are saved input scenarios, not flood predictions.
                    Hydraulic and VQC model outputs have not yet been generated.
                </p>
            </section>
        </main>
    );
}
