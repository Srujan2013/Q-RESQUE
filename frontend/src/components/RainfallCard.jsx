import React, { useEffect, useState } from "react";

function RainfallCard() {
    const [data, setData] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/belagavi_rainfall_2015_2023.csv")
            .then((response) => {
                if (!response.ok) {
                    throw new Error("CSV file could not be loaded");
                }

                return response.text();
            })
            .then((text) => {
                const rows = text.trim().split("\n");

                const headers = rows[0].split(",").map((h) => h.trim());

                const parsedData = rows.slice(1).map((row) => {
                    const values = row.split(",");

                    const record = {};

                    headers.forEach((header, index) => {
                        record[header] = values[index]?.trim();
                    });

                    return record;
                });

                setData(parsedData);
            })
            .catch((err) => {
                console.error(err);
                setError("Unable to load rainfall data");
            });
    }, []);

    return (
        <div className="card rainfall-card">
            <h3>🌧️ Rainfall Data</h3>

            {error ? (
                <p>{error}</p>
            ) : data.length === 0 ? (
                <p>Loading rainfall data...</p>
            ) : (
                <>
                    <p>
                        Dataset loaded successfully.
                    </p>

                    <div className="rainfall-stats">
                        <div>
                            <strong>{data.length}</strong>
                            <span>Records</span>
                        </div>

                        <div>
                            <strong>2015–2023</strong>
                            <span>Period</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default RainfallCard;