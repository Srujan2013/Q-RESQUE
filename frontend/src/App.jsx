
import React, { useState } from "react";
import "./App.css";

import Navbar from "./components/Navbar";
import DashboardData from "./components/DashboardData";
import QRescueFlow from "./components/QRescueFlow";
import ReservoirMonitoring from "./components/ReservoirMonitoring";
import MapPage from "./components/MapPage";
import ModelTestingLab from "./components/ModelTestingLab";
import GeographicMap from "./components/GeographicMap";
import RescueOperations from "./components/RescueOperations";

function App() {
    const [currentPage, setCurrentPage] = useState("dashboard");

    return (
        <div className="app">
            <Navbar
                currentPage={currentPage}
                onNavigate={setCurrentPage}
            />

            <main className="main-content">
                {currentPage === "dashboard" && (
                    <>
                        <section className="hero">
                            <h1>
                                Flood Risk Prediction & Emergency Resource Allocation
                            </h1>
                            <p>
                                Historical-data risk assessment, scenario testing,
                                geographic intelligence and resource-allocation research.
                            </p>
                        </section>
                        <DashboardData />
                        <QRescueFlow />
                    </>
                )}

                {currentPage === "map" && <MapPage />}
                {currentPage === "geographic-map" && <GeographicMap />}
                {currentPage === "reservoir" && <ReservoirMonitoring />}
                {currentPage === "model" && <ModelTestingLab />}
                {currentPage === "operations" && <RescueOperations />}
            </main>
        </div>
    );
}

export default App;
