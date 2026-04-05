import React from "react"

/**
 * The settings page displays the API keys and provider configuration.
 * @returns A React component that displays the API keys and provider configuration.
 */
const SettingsPage: React.FC = () => {
    return (
        <div className="settings-view">
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Settings</h1>
                    <p>API Keys and Provider Configuration</p>
                </div>
            </div>
            <div className="glass-card" style={{ padding: "2rem", color: "var(--text-dim)" }}>
                <p style={{ marginBottom: "1.5rem" }}>
                    Active Provider: <strong>Claude (Default)</strong>
                </p>
                <p>Configuration is currently managed via backend environment variables and system settings.</p>
            </div>
        </div>
    )
}

export default SettingsPage
