import React from "react";
import "./App.css";

import Navbar from "./components/Navbar";
import FloodMap from "./components/FloodMap";
import DashboardData from "./components/DashboardData";
import GeographyPanel from "./components/GeographyPanel";
import Resources from "./components/Resources";

function App() {

    return (
        <div className="app">

            <Navbar />

            <main className="main-content" id="dashboard">

                <section className="hero">

                    <h1>
                        Flood Risk Prediction & Emergency Resource Allocation
                    </h1>

                    <p>
                        AI-powered flood detection, risk prediction and
                        emergency resource allocation system.
                    </p>

                </section>

                <DashboardData />

                <FloodMap />

                <Resources />

                <GeographyPanel />

            </main>

        </div>
    );
}

export default App;