import React from "react";

function Navbar() {
    return (
        <nav className="navbar">
            <div className="logo">
                🌊 Q-RESCUE
            </div>

            <div className="nav-links">
                <a href="#dashboard">Dashboard</a>
                <a href="#risk">Flood Risk</a>
                <a href="#map">Flood Map</a>
                <a href="#resources">Resources</a>
            </div>
        </nav>
    );
}

export default Navbar;