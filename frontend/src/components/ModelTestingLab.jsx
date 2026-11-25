import React, { useEffect, useState } from "react";
import { apiUrl } from "../api";
import "./ModelTestingLab.css";
import ScenarioImpactMap from "./ScenarioImpactMap";

const defaults = {
    rainfall_mm: 15,
    temperature_c: 28,
    humidity_percent: 65,
    wind_speed_kmh: 8,
    reservoir_level_m: 645,
    gate_opening_percent: 0,
    inflow_m3s: 200,
    outflow_m3s: 180,
    soil_moisture_percent: 35
};

const fields = [
    ["rainfall_mm", "Rainfall", "mm", 0, 2000, 1, "🌧️"],
    ["temperature_c", "Temperature", "°C", -10, 60, 0.5, "🌡️"],
    ["humidity_percent", "Humidity", "%", 0, 100, 1, "💧"],
    ["wind_speed_kmh", "Wind speed", "km/h", 0, 300, 1, "💨"],
    ["reservoir_level_m", "Reservoir level", "m", 0, 2000, 0.1, "🏞️"],
    ["gate_opening_percent", "Gate opening", "%", 0, 100, 1, "🚪"],
    ["inflow_m3s", "Reservoir inflow", "m³/s", 0, 2000000, 1, "⬇️"],
    ["outflow_m3s", "Reservoir outflow", "m³/s", 0, 2000000, 1, "⬆️"],
    ["soil_moisture_percent", "Soil moisture", "%", 0, 100, 1, "🌱"]
];

const number = value => Number(value || 0).toLocaleString("en-IN");

// Min/max values recorded by the saved VQC training scaler.
const trainingRanges = {
    rainfall_mm: [0, 127.86],
    temperature_c: [17.3, 31.5],
    humidity_percent: [18.58, 96.25],
    wind_speed_kmh: [0.7, 6.88]
};

function getRuleReference(inputs) {
    const rainfall = Number(inputs.rainfall_mm);
    const humidity = Number(inputs.humidity_percent);

    if (rainfall > 100) return "Critical";
    if (rainfall > 50 && humidity > 80) return "Critical";
    if (rainfall > 50) return "High";
    if (rainfall > 20 && humidity > 75) return "High";
    if (rainfall > 20) return "Medium";
    return "Low";
}

export default function ModelTestingLab() {
    const [values, setValues] = useState(defaults);
    const [result, setResult] = useState(() => {
        try {
            const cached = localStorage.getItem("qrescue:last-scenario");
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");
    const [savedScenarioId, setSavedScenarioId] = useState("");
    const [testedAt, setTestedAt] = useState(() => {
        try {
            return localStorage.getItem("qrescue:last-tested-at") || "";
        } catch {
            return "";
        }
    });
    const [selectedDam, setSelectedDam] = useState("Hidkal");
    const [talukOptions, setTalukOptions] = useState([]);
    const [selectedTaluks, setSelectedTaluks] = useState([]);
    const [talukLoadError, setTalukLoadError] = useState("");

    useEffect(() => {
        fetch(apiUrl("/api/models/status"))
            .then(r => {
                if (!r.ok) throw new Error("Status unavailable");
                return r.json();
            })
            .then(setStatus)
            .catch(() => setStatus(null));
    }, []);

    useEffect(() => {
        fetch(apiUrl("/api/resources"))
            .then(r => {
                if (!r.ok) throw new Error("Regional screening list unavailable");
                return r.json();
            })
            .then(data => {
                const names = [...new Set((data.resources || [])
                    .map(item => String(item.taluk || "").trim())
                    .filter(Boolean))].sort();
                setTalukOptions(names);
            })
            .catch(err => setTalukLoadError(err.message));
    }, []);

    async function runScenario(e) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setResult(null);
        if (!selectedTaluks.length) {
            setError("Select at least one surrounding taluk to screen for the selected dam.");
            setBusy(false);
            return;
        }

        try {
            const response = await fetch(apiUrl("/api/models/scenario"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...values,
                    dam_name: selectedDam,
                    screening_taluks: selectedTaluks
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || `Request failed (${response.status})`);
            }

            setResult({
                ...data,
                _testedInputs: { ...values, dam_name: selectedDam, screening_taluks: [...selectedTaluks] }
            });
            const timestamp = new Date().toLocaleString("en-IN");
            setTestedAt(timestamp);
            localStorage.setItem("qrescue:last-tested-at", timestamp);

            window.dispatchEvent(new CustomEvent("qrescue:scenario", {
                detail: data.scenario_impact || null
            }));
            localStorage.setItem("qrescue:last-scenario", JSON.stringify({
                ...data,
                _testedInputs: { ...values, dam_name: selectedDam, screening_taluks: [...selectedTaluks] }
            }));
            window.dispatchEvent(new CustomEvent("qrescue:scenario-result", {
                detail: data
            }));

        } catch (err) {
            setError(err.message || "Unable to run scenario");
        } finally {
            setBusy(false);
        }
    }

    async function saveScenario() {
        if (!result) return;

        setSaving(true);
        setSaveMessage("");

        try {
            const response = await fetch(
                apiUrl("/api/models/scenarios/save"),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scenario: {
                            ...result,
                            inputs: result.inputs || result._testedInputs
                        }
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || `Save failed (${response.status})`
                );
            }

            setSavedScenarioId(data.scenario_id);
            setSaveMessage(
                `Scenario saved successfully. ID: ${data.scenario_id}`
            );

        } catch (err) {
            setSaveMessage(`Unable to save scenario: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    function resetScenario() {
        setValues(defaults);
        setResult(null);
        setError("");
        setTestedAt("");
        window.dispatchEvent(new CustomEvent("qrescue:scenario", {
            detail: null
        }));
        localStorage.removeItem("qrescue:last-scenario");
        window.dispatchEvent(new CustomEvent("qrescue:scenario-result", {
            detail: null
        }));
    }

    const risk = result?.vqc?.class || "Not tested";
    const riskClass = risk.toLowerCase();
    const impact = result?.scenario_impact;
    const villages = impact?.villages || [];
    const allocation = result?.allocation;
    const priorities = allocation?.priority_scores || {};
    const priorityTaluks = allocation?.priority_taluks || allocation?.selected_zones || [];
    const testedInputs = result?._testedInputs || values;
    const ruleReference = result ? getRuleReference(testedInputs) : null;

    const outOfTrainingRange = result
        ? Object.entries(trainingRanges)
            .filter(([key, [min, max]]) => {
                const value = Number(testedInputs[key]);
                return value < min || value > max;
            })
            .map(([key, [min, max]]) => ({
                key,
                label: fields.find(field => field[0] === key)?.[1] || key,
                value: testedInputs[key],
                min,
                max
            }))
        : [];

    return (
        <div className="scenario-page">

            <header className="scenario-hero">
                <div className="scenario-hero-content">
                    <span className="scenario-eyebrow">Q-RESCUE / INTELLIGENCE CENTRE</span>
                    <h1>🌊 Flood Scenario Testing Lab</h1>
                    <p>
                        Select one Belagavi dam, screen its chosen surrounding taluks,
                        and evaluate a dam-scoped hypothetical scenario.
                    </p>
                    <span className="scenario-mode">🧪 RESEARCH TEST MODE</span>
                </div>
                <div className="scenario-hero-art">🌧️</div>
            </header>

            <div className="scenario-notice">
                <strong>Research prototype:</strong> Results are scenario estimates,
                not operational flood warnings or dispatch instructions.
            </div>

            <div className="scenario-layout">

                <section className="scenario-panel scenario-input-panel">
                    <div className="scenario-section-title">
                        <div>
                            <span className="scenario-icon">🎛️</span>
                            <div>
                                <h2>Scenario Inputs</h2>
                                <p>Adjust hypothetical environmental conditions</p>
                            </div>
                        </div>
                        <span className="scenario-step">01 / INPUT</span>
                    </div>

                    <form onSubmit={runScenario}>
                        <div className="scenario-input-grid">
                            <label className="scenario-field">
                                <span className="scenario-field-label">
                                    <span>🏗️ Selected dam</span>
                                    <small>Required</small>
                                </span>
                                <select value={selectedDam} onChange={e => setSelectedDam(e.target.value)} required>
                                    <option value="Hidkal">Hidkal Dam</option>
                                    <option value="Naviluteertha">Naviluteertha (Renukasagar) Dam</option>
                                    <option value="Rakasakoppa">Rakasakoppa Dam</option>
                                    <option value="Dhupdal">Dhupdal Dam</option>
                                </select>
                            </label>
                            <label className="scenario-field scenario-region-field">
                                <span className="scenario-field-label">
                                    <span>🗺️ Surrounding taluks to screen</span>
                                    <small>Multi-select</small>
                                </span>
                                <select
                                    multiple
                                    size={Math.min(Math.max(talukOptions.length, 3), 6)}
                                    value={selectedTaluks}
                                    onChange={e => setSelectedTaluks(Array.from(e.target.selectedOptions, option => option.value))}
                                    disabled={!talukOptions.length}
                                >
                                    {talukOptions.map(taluk => <option key={taluk} value={taluk}>{taluk}</option>)}
                                </select>
                                <small className="scenario-field-help">
                                    Select the taluks relevant to this dam. This is geographic screening, not an automatically verified downstream flood zone.
                                </small>
                                {talukLoadError && <small className="scenario-field-help">{talukLoadError}</small>}
                            </label>
                        </div>
                        <div className="scenario-input-grid">
                            {fields.map(([key, label, unit, min, max, step, emoji]) => (
                                <label className="scenario-field" key={key}>
                                    <span className="scenario-field-label">
                                        <span>{emoji} {label}</span>
                                        <small>{unit}</small>
                                    </span>
                                    <input
                                        type="number"
                                        min={min}
                                        max={max}
                                        step={step}
                                        value={values[key]}
                                        required
                                        onChange={e => setValues(v => ({
                                            ...v,
                                            [key]: e.target.value === "" ? "" : Number(e.target.value)
                                        }))}
                                    />
                                </label>
                            ))}
                        </div>

                        <div className="scenario-actions">
                            <button
                                type="button"
                                className="scenario-reset"
                                onClick={resetScenario}
                                disabled={busy}
                            >
                                ↺ Reset
                            </button>
                            <button
                                type="submit"
                                className="scenario-run"
                                disabled={busy}
                            >
                                {busy ? "Running VQC + allocation analysis..." : "⚡ RUN SCENARIO"}
                            </button>
                        </div>
                    </form>

                    {error && <div className="scenario-error">⚠️ {error}</div>}
                </section>

                <section className="scenario-panel scenario-results-panel">
                    <div className="scenario-section-title">
                        <div>
                            <span className="scenario-icon">📊</span>
                            <div>
                                <h2>Scenario Results</h2>
                                <p>Model output and resource prioritisation</p>
                            </div>
                        </div>
                        <span className="scenario-step">02 / RESULTS</span>
                    </div>

                    {result && (
                        <div style={{
                            margin: "16px 0",
                            padding: 16,
                            border: "1px solid #cbd5e1",
                            borderRadius: 12
                        }}>
                            <button
                                type="button"
                                onClick={saveScenario}
                                disabled={saving}
                                style={{
                                    padding: "12px 20px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "#166534",
                                    color: "#ffffff",
                                    fontWeight: 700,
                                    cursor: saving ? "wait" : "pointer",
                                    opacity: saving ? 0.7 : 1
                                }}
                            >
                                {saving
                                    ? "Saving scenario..."
                                    : savedScenarioId
                                        ? "Save Another Copy"
                                        : "💾 Save Scenario Results"}
                            </button>

                            {saveMessage && (
                                <p
                                    role="status"
                                    style={{
                                        marginTop: 10,
                                        overflowWrap: "anywhere",
                                        color: savedScenarioId
                                            ? "#166534"
                                            : "#b45309"
                                    }}
                                >
                                    {saveMessage}
                                </p>
                            )}
                        </div>
                    )}

                    {!result ? (
                        <div className="scenario-empty">
                            <div>🧠</div>
                            <h3>Waiting for scenario</h3>
                            <p>Adjust the input values and run the model to see results here.</p>
                        </div>
                    ) : (
                        <>
                            <div className="scenario-method-note">
                                <strong>Selected dam:</strong> {result.selected_dam || impact?.selected_dam || testedInputs.dam_name}
                                <br />
                                <strong>Screened taluks:</strong> {(result.selected_screening_taluks || impact?.selected_screening_taluks || testedInputs.screening_taluks || []).join(", ")}
                                <br />
                                Regional scope is operator-selected taluk screening; downstream hydraulic impact is not modelled.
                            </div>
                            <div className="scenario-result-grid">
                                <article className={`scenario-result-card risk-${riskClass}`}>
                                    <span>⚡ Original VQC Classification</span>
                                    <strong>{risk}</strong>
                                    <small>Unmodified quantum model output, not probability</small>
                                    <b>{result.vqc.risk_score_display}/100</b>
                                </article>
                                <article className={`scenario-result-card risk-${(result.hybrid?.class || impact?.hybrid_classification || risk).toLowerCase()}`}>
                                    <span>🛡️ Hybrid VQC + Rule-Based Classification</span>
                                    <strong>{result.hybrid?.class || impact?.hybrid_classification || risk}</strong>
                                    <small>Conservative screening result: higher severity of VQC and rule reference</small>
                                    <b>{result.hybrid?.disagreement ? "Disagreement detected" : "Classifications agree"}</b>
                                </article>
                            </div>
                            {result.hybrid?.disagreement && (
                                <div role="alert" className="vqc-disagreement-warning" style={{
                                    marginTop: 12, padding: 14, borderRadius: 10,
                                    border: "1px solid #f2b8b5", background: "#fff1f0", color: "#8f211c"
                                }}>
                                    <strong>⚠️ VQC / RULE DISAGREEMENT</strong>
                                    <p style={{ margin: "7px 0 0", lineHeight: 1.55 }}>
                                        VQC predicts {risk}; the generated rule reference predicts {ruleReference}.
                                        The hybrid screening category uses {result.hybrid.class}, the higher-severity
                                        result. This conservative rule does not establish actual flood conditions.
                                    </p>
                                </div>
                            )}

                            <div className="vqc-comparison">
                                <h3>VQC and rule-based reference</h3>
                                <div className="vqc-comparison-grid">
                                    <div>
                                        <span>Saved VQC model output</span>
                                        <strong>{risk}</strong>
                                    </div>
                                    <div>
                                        <span>Rainfall/humidity rule reference</span>
                                        <strong>{ruleReference}</strong>
                                    </div>
                                </div>
                                <p>
                                    The rule reference reproduces the generated
                                    training-label thresholds. It is a comparison,
                                    not an independent flood observation.
                                </p>
                            </div>

                            {outOfTrainingRange.length > 0 ? (
                                <div className="vqc-range-warning">
                                    <strong>⚠️ OUTSIDE TRAINING RANGE</strong>
                                    <p>
                                        One or more inputs are outside the ranges
                                        recorded by the saved VQC training scaler.
                                        Treat the VQC classification as an
                                        extrapolation result.
                                    </p>
                                    <ul>
                                        {outOfTrainingRange.map(item => (
                                            <li key={item.key}>
                                                {item.label}: {item.value}
                                                (training range: {item.min} to {item.max})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="vqc-range-ok">
                                    ✓ All four VQC weather inputs are within
                                    the recorded training ranges.
                                </div>
                            )}

                            <div className="scenario-result-grid scenario-impact-grid">
                                <article className="scenario-result-card impact-card">
                                    <span>🏘️ Screened villages</span>
                                    <strong>{number(impact?.village_count)}</strong>
                                    <small>Villages in selected taluks</small>
                                </article>
                                <article className="scenario-result-card impact-card">
                                    <span>👥 Census population</span>
                                    <strong>{number(impact?.population_2011)}</strong>
                                    <small>2011 population of screened villages</small>
                                </article>
                                <article className="scenario-result-card impact-card">
                                    <span>🚨 Hybrid estimated affected people</span>
                                    <strong>{number(impact?.estimated_affected_people)}</strong>
                                    <small>
                                        Hybrid {result.hybrid?.class || impact?.hybrid_classification || "screening"} estimate · {impact?.estimated_exposure_rate_percent ?? 0}% exposure assumption
                                    </small>
                                </article>
                                <article className="scenario-result-card impact-card">
                                    <span>⚡ VQC-based estimate</span>
                                    <strong>{number(impact?.vqc_estimated_affected_people)}</strong>
                                    <small>{risk} category · {impact?.vqc_estimated_exposure_rate_percent ?? 0}% assumption</small>
                                </article>
                                <article className="scenario-result-card impact-card">
                                    <span>📋 Rule-reference estimate</span>
                                    <strong>{number(impact?.rule_estimated_affected_people)}</strong>
                                    <small>{impact?.rule_reference_class || ruleReference} category · {impact?.rule_estimated_exposure_rate_percent ?? 0}% assumption</small>
                                </article>
                                <article className="scenario-result-card impact-card">
                                    <span>↕ Difference between estimates</span>
                                    <strong>{number(impact?.affected_people_estimate_difference)}</strong>
                                    <small>Absolute difference, not an observed count</small>
                                </article>
                            </div>

                            {impact?.affected_estimate_note && (
                                <p className="scenario-method-note">
                                    {impact.affected_estimate_note}
                                </p>
                            )}

                            <p className="scenario-timestamp">
                                <span>●</span> Scenario completed: {testedAt}
                            </p>
                        </>
                    )}
                </section>
            </div>

            {result && (
                <>
                    <section className="scenario-panel scenario-priority-panel">
                        <div className="scenario-section-title">
                            <div>
                                <span className="scenario-icon">🏆</span>
                                <div>
                                    <h2>Resource Priority Analysis</h2>
                                    <p>Resource allocation shortlist only. All screened taluks remain visible in the impact analysis.</p>
                                </div>
                            </div>
                        </div>

                        {priorityTaluks.map((taluk, index) => {
                            const score = priorities[taluk] ?? 0;
                            return (
                                <div className="priority-row" key={taluk}>
                                    <div className="priority-label">
                                        <span>{index + 1}. {taluk}</span>
                                        <strong>{Number(score).toFixed(3)}</strong>
                                    </div>
                                    <div className="priority-track">
                                        <div
                                            className="priority-fill"
                                            style={{
                                                width: `${Math.max(0, Math.min(100, Number(score) * 100))}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {!priorityTaluks.length && (
                            <p className="scenario-method-note">No taluks selected for resource allocation.</p>
                        )}

                        <p className="scenario-method-note">
                            Zone selection uses an exact classical budget baseline for this scenario. The saved QAOA results are a separate simulator benchmark, not a fresh circuit execution.
                        </p>
                    </section>

                    <ScenarioImpactMap scenarioImpact={impact} />

                    <section className="scenario-panel taluk-impact-panel">
                        <div className="scenario-section-title">
                            <div>
                                <span className="scenario-icon">🗺️</span>
                                <div>
                                    <h2>Taluk-wise Impact Estimates</h2>
                                    <p>Every screened taluk is listed separately. Resource-priority selection does not remove a taluk from impact screening.</p>
                                </div>
                            </div>
                            <span className="scenario-step">
                                {number(impact?.screened_taluk_count || 0)} SCREENED
                            </span>
                        </div>

                        <div className="taluk-impact-table-wrap">
                            <table className="taluk-impact-table">
                                <thead>
                                    <tr>
                                        <th>Screened taluk</th>
                                        <th>Villages</th>
                                        <th>2011 population</th>
                                        <th>Hybrid risk</th>
                                        <th>Estimated affected</th>
                                        <th>Resource priority</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(impact?.taluk_impacts || []).map(item => (
                                        <tr key={item.taluk}>
                                            <td>{item.taluk}</td>
                                            <td>{number(item.screened_village_count)}</td>
                                            <td>{number(item.population_2011)}</td>
                                            <td>
                                                <span className={`taluk-risk-pill ${String(item.hybrid_risk || "Low").toLowerCase()}`}>
                                                    {item.hybrid_risk}
                                                </span>
                                            </td>
                                            <td>{number(item.estimated_affected_people)}</td>
                                            <td>{item.is_priority_taluk ? "Selected" : "Not selected"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <th>Screened total</th>
                                        <th>{number(impact?.village_count || 0)}</th>
                                        <th>{number(impact?.population_2011 || 0)}</th>
                                        <th>Hybrid screening</th>
                                        <th>{number(impact?.taluk_estimated_affected_total || 0)}</th>
                                        <th>{number(impact?.priority_taluk_count || 0)} priority taluks</th>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <p className="scenario-method-note">
                            Affected counts are prototype exposure estimates applied to each screened taluk's Census 2011 village population. They are not observed or hydraulically modelled flood impacts.
                        </p>
                    </section>

                    <section className="scenario-panel">
                        <div className="scenario-section-title">
                            <div>
                                <span className="scenario-icon">🏘️</span>
                                <div>
                                    <h2>Village Screening Results</h2>
                                    <p>Villages within the selected taluks</p>
                                </div>
                            </div>
                            <span className="scenario-step">
                                {number(villages.length)} RECORDS
                            </span>
                        </div>

                        {!impact?.available ? (
                            <p className="scenario-method-note">
                                Village screening data is unavailable.
                                {impact?.message || ""}
                            </p>
                        ) : (
                            <div className="scenario-table-wrap">
                                <table className="scenario-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Village</th>
                                            <th>Taluk</th>
                                            <th>Population (2011)</th>
                                            <th>Screening category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {villages.map((v, i) => (
                                            <tr key={`${v.taluk}-${v.village_name}-${i}`}>
                                                <td>{i + 1}</td>
                                                <td>{v.village_name}</td>
                                                <td>{v.taluk}</td>
                                                <td>{number(v.population_2011)}</td>
                                                <td>
                                                    <span className={`screening-badge ${String(v.screening_risk).toLowerCase()}`}>
                                                        {v.screening_risk}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {impact?.note && (
                            <p className="scenario-method-note">{impact.note}</p>
                        )}
                    </section>

                    <section className="scenario-panel scenario-benchmark">
                        <div className="scenario-section-title">
                            <div>
                                <span className="scenario-icon">🧬</span>
                                <div>
                                    <h2>Quantum Model Evaluation & Methodology</h2>
                                    <p>VQC scenario classification and saved QAOA benchmark comparison</p>
                                </div>
                            </div>
                        </div>

                        <div className="benchmark-grid">
                            <article>
                                <h3>⚡ VQC Classification</h3>
                                <p>Variational Quantum Classifier using the saved PennyLane model.</p>
                                <small>{status?.vqc_label_source || "Generated rainfall/humidity rule labels"}</small>
                                <p className="benchmark-note">
                                    The classification is not a calibrated flood probability.
                                </p>
                            </article>
                            <article>
                                <h3>📚 Saved QAOA v4 Benchmark</h3>
                                <p>Historical experiment retained for comparison.</p>
                                <pre>{JSON.stringify(result.qaoa_v4_benchmark, null, 2)}</pre>
                            </article>
                        </div>
                    </section>
                </>
            )}

            <section className="scenario-limitations">
                <strong>⚠️ Data and model limitations</strong>
                <ul>
                    <li>VQC labels reproduce generated rainfall/humidity rules, not observed flood events.</li>
                    <li>Village screening inherits the selected taluk's screening category. It is not village-level inundation prediction.</li>
                    <li>Population values are historical Census 2011 figures, not estimates of affected population.</li>
                    <li>Reservoir level, gate opening, inflow, outflow and soil moisture are not hydraulically simulated by this endpoint.</li>
                    <li>The live QAOA run is an optimization demonstration; final assignments are reconciled against recorded demand and the fixed 22-boat reserve.</li>
                </ul>
            </section>
        </div>
    );
}
