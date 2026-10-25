function RiskCard({ title, value, icon, type }) {
    return (
        <div className={`risk-card ${type}`}>
            <div className="risk-icon">{icon}</div>

            <div>
                <p>{title}</p>
                <h2>{value}</h2>
            </div>
        </div>
    );
}

export default RiskCard;