import React from "react";

function QRescueFlow() {
    const steps = [
        {
            icon: "🌦️",
            title: "Current Weather",
            subtitle: "Live weather conditions",
            detail: "Temperature • Rainfall • Humidity • Wind",
            className: "weather"
        },
        {
            icon: "🌧️",
            title: "Rainfall + Humidity",
            subtitle: "Environmental inputs",
            detail: "Weather data supplied to risk analysis",
            className: "input"
        },
        {
            icon: "🧠",
            title: "Q-RESCUE Risk Engine",
            subtitle: "Risk analysis",
            detail: "Processes environmental conditions",
            className: "engine"
        },
        {
            icon: "⚠️",
            title: "Flood Risk Score",
            subtitle: "Risk classification",
            detail: "Low • Medium • High • Critical",
            className: "risk"
        },
        {
            icon: "🚑",
            title: "Resource Priority",
            subtitle: "Emergency prioritization",
            detail: "Ranks zones for response",
            className: "priority"
        },
        {
            icon: "🚤",
            title: "Emergency Resources",
            subtitle: "Response recommendation",
            detail: "Boats • Rescue Teams • Ambulances",
            className: "resources"
        }
    ];

    return (
        <section className="qrescue-flow-section">

            <div className="qrescue-flow-header">

                <div>
                    <h2>🧠 How Q-RESCUE Works</h2>

                    <p>
                        From current weather conditions to emergency
                        resource allocation
                    </p>
                </div>

                <div className="flow-status">
                    <span></span>
                    Decision Pipeline
                </div>

            </div>


            <div className="qrescue-flow">

                {steps.map((step, index) => (

                    <React.Fragment key={step.title}>

                        <div
                            className={`flow-card ${step.className}`}
                        >

                            <div className="flow-icon">
                                {step.icon}
                            </div>

                            <div className="flow-content">

                                <h3>
                                    {step.title}
                                </h3>

                                <span className="flow-subtitle">
                                    {step.subtitle}
                                </span>

                                <p>
                                    {step.detail}
                                </p>

                            </div>

                        </div>


                        {index < steps.length - 1 && (

                            <div className="flow-arrow">
                                →
                            </div>

                        )}

                    </React.Fragment>

                ))}

            </div>


            <div className="flow-explanation">

                <span>💡</span>

                <p>
                    Q-RESCUE converts environmental conditions into
                    flood-risk information and uses the resulting
                    priority to support emergency resource planning.
                </p>

            </div>

        </section>
    );
}

export default QRescueFlow;