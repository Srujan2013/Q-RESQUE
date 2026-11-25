
import React from "react";

function Navbar({ currentPage, onNavigate }) {
    const items = [
        ["dashboard", "Dashboard"],
        ["map", "District Intelligence"],
        ["geographic-map", "Map"],
        ["reservoir", "Reservoir Monitoring"],
        ["model", "Model Lab"],
        ["operations", "Rescue Operations"]
    ];

    return (
        <nav className="navbar">
            <div className="logo">🌊 Q-RESCUE</div>
            <div className="nav-links">
                {items.map(([page, label]) => (
                    <button
                        key={page}
                        type="button"
                        className={currentPage === page ? "active" : ""}
                        onClick={() => onNavigate(page)}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </nav>
    );
}

export default Navbar;
