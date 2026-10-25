import React from "react";

function ResourceCard({ icon, title, value, available }) {
    return (
        <div className="resource-card">

            <div className="resource-icon">
                {icon}
            </div>

            <div className="resource-info">
                <h3>{title}</h3>
                <p>{available}</p>
            </div>

            <strong>{value}</strong>

        </div>
    );
}

export default ResourceCard;