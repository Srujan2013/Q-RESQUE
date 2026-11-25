import React, { useEffect, useMemo, useState } from "react";

const GEOJSON_URL = "/data/village/belagavi_verified_village_points.geojson";

export default function TalukDetails() {
    const [villages, setVillages] = useState([]);
    const [search, setSearch] = useState("");
    const [selectedTaluk, setSelectedTaluk] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(GEOJSON_URL)
            .then(response => {
                if (!response.ok) throw new Error("Village data could not be loaded");
                return response.json();
            })
            .then(data => {
                const records = (data.features || []).map(feature => {
                    const p = feature.properties || {};
                    return {
                        village: p.village_name || "Unknown",
                        taluk: p.taluk || "Unknown",
                        population: Number(p.population_2011) || 0,
                        households: Number(p.households_2011) || 0
                    };
                });

                setVillages(records);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    const summaries = useMemo(() => {
        const grouped = {};

        villages.forEach(v => {
            if (!grouped[v.taluk]) {
                grouped[v.taluk] = {
                    taluk: v.taluk,
                    villages: [],
                    population: 0
                };
            }

            grouped[v.taluk].villages.push(v);
            grouped[v.taluk].population += v.population;
        });

        return Object.values(grouped)
            .map(t => ({
                ...t,
                count: t.villages.length,
                villages: [...t.villages].sort((a, b) =>
                    a.village.localeCompare(b.village)
                )
            }))
            .sort((a, b) => a.taluk.localeCompare(b.taluk));
    }, [villages]);

    const filteredTaluks = summaries.filter(t =>
        t.taluk.toLowerCase().includes(search.toLowerCase())
    );

    const selected = summaries.find(t => t.taluk === selectedTaluk);

    const formatNumber = value =>
        Number(value).toLocaleString("en-IN");

    if (loading) {
        return <div className="taluk-page"><h2>Loading taluk data...</h2></div>;
    }

    if (error) {
        return <div className="taluk-page"><p>Error: {error}</p></div>;
    }

    return (
        <div className="taluk-page">
            <section className="taluk-header">
                <h1>Belagavi District Taluk Details</h1>
                <p>Explore all taluks, villages and village-wise population.</p>
                <small>Population figures: Census 2011</small>
            </section>

            <section className="taluk-summary">
                <div className="taluk-stat">
                    <h2>{summaries.length}</h2>
                    <p>Total Taluks</p>
                </div>

                <div className="taluk-stat">
                    <h2>{formatNumber(villages.length)}</h2>
                    <p>Total Villages</p>
                </div>

                <div className="taluk-stat">
                    <h2>
                        {formatNumber(
                            villages.reduce((sum, v) => sum + v.population, 0)
                        )}
                    </h2>
                    <p>Combined Village Population</p>
                </div>
            </section>

            <div className="taluk-search">
                <input
                    type="text"
                    placeholder="Search taluk..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <section className="taluk-grid">
                {filteredTaluks.map(t => (
                    <button
                        key={t.taluk}
                        className={`taluk-card ${selectedTaluk === t.taluk ? "selected" : ""}`}
                        onClick={() =>
                            setSelectedTaluk(
                                selectedTaluk === t.taluk ? null : t.taluk
                            )
                        }
                    >
                        <h2>{t.taluk}</h2>

                        <div className="taluk-card-stats">
                            <span>
                                <strong>{t.count}</strong>
                                Villages
                            </span>
                            <span>
                                <strong>{formatNumber(t.population)}</strong>
                                Population
                            </span>
                        </div>

                        <span className="taluk-card-action">
                            {selectedTaluk === t.taluk
                                ? "Hide village details ▲"
                                : "View village details ▼"}
                        </span>
                    </button>
                ))}
            </section>

            {selected && (
                <section className="village-details">
                    <h2>{selected.taluk} Taluk</h2>

                    <div className="village-summary">
                        <div>
                            <strong>{selected.count}</strong>
                            <span>Total Villages</span>
                        </div>
                        <div>
                            <strong>{formatNumber(selected.population)}</strong>
                            <span>Total Village Population</span>
                        </div>
                    </div>

                    <h3>Village-wise Population</h3>

                    <div className="village-table-wrapper">
                        <table className="village-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Village Name</th>
                                    <th>Population (2011)</th>
                                    <th>Households (2011)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selected.villages.map((v, index) => (
                                    <tr key={`${v.village}-${index}`}>
                                        <td>{index + 1}</td>
                                        <td>{v.village}</td>
                                        <td>{formatNumber(v.population)}</td>
                                        <td>{formatNumber(v.households)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <p className="taluk-disclaimer">
                Source: Verified Belagavi village dataset.
                Population and household figures represent Census 2011.
                These are demographic figures, not flood-affected population estimates.
            </p>
        </div>
    );
}
