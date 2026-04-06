import React, { useState, useEffect } from "react"
import { FaEye, FaEyeSlash, FaCheck, FaExclamationTriangle } from "react-icons/fa"
import { API_BASE } from "../../config"

/** Tracks user-entered API key values (empty string = no pending change). */
interface KeyState {
    anthropic: string
    openai: string
    deepl: string
}

/**
 * Available translation providers. Each entry maps a backend provider ID to
 * its display label, description, and the corresponding API key field name
 * (`null` for providers that don't require credentials).
 */
const PROVIDERS = [
    { id: "claude", label: "Claude", description: "claude-sonnet-4-20250514", keyField: "anthropic" as const },
    { id: "openai", label: "OpenAI", description: "gpt-4o", keyField: "openai" as const },
    { id: "deepl", label: "DeepL", description: "Neural Machine Translation", keyField: "deepl" as const },
    { id: "manual", label: "Manual", description: "Export JSON for manual editing", keyField: null },
]

/**
 * Settings page for configuring the active translation provider, API keys,
 * and batch size. Changes are persisted to the backend `.env` file and take
 * effect immediately without a server restart.
 */
const SettingsPage: React.FC = () => {
    const [provider, setProvider] = useState("claude")
    const [originalProvider, setOriginalProvider] = useState("claude")
    const [batchSize, setBatchSize] = useState(100)
    const [originalBatchSize, setOriginalBatchSize] = useState(100)
    const [apiKeys, setApiKeys] = useState<KeyState>({ anthropic: "", openai: "", deepl: "" })
    const [keyStatus, setKeyStatus] = useState<KeyState>({ anthropic: "", openai: "", deepl: "" })
    const [keyVisible, setKeyVisible] = useState<{ anthropic: boolean; openai: boolean; deepl: boolean }>({
        anthropic: false,
        openai: false,
        deepl: false,
    })
    const [saving, setSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [loading, setLoading] = useState(true)

    const isChanged = provider !== originalProvider || batchSize !== originalBatchSize || apiKeys.anthropic !== "" || apiKeys.openai !== "" || apiKeys.deepl !== ""

    // Fetch current settings from the backend on mount.
    useEffect(() => {
        fetch(`${API_BASE}/settings`)
            .then((res) => res.json())
            .then((data) => {
                setProvider(data.provider)
                setOriginalProvider(data.provider)
                setBatchSize(data.batch_size)
                setOriginalBatchSize(data.batch_size)
                setKeyStatus({
                    anthropic: data.anthropic_api_key_set,
                    openai: data.openai_api_key_set,
                    deepl: data.deepl_api_key_set,
                })
                setLoading(false)
            })
            .catch((err) => {
                console.error("Failed to fetch settings:", err)
                setLoading(false)
            })
    }, [])

    /**
     * Persist changed settings to the backend. Only fields that differ from
     * their original values are included in the payload so unchanged keys
     * are not overwritten.
     */
    const handleSave = async () => {
        setSaving(true)
        setSaveSuccess(false)

        const payload: Record<string, unknown> = {}
        if (provider !== originalProvider) payload.provider = provider
        if (batchSize !== originalBatchSize) payload.batch_size = batchSize
        if (apiKeys.anthropic) payload.anthropic_api_key = apiKeys.anthropic
        if (apiKeys.openai) payload.openai_api_key = apiKeys.openai
        if (apiKeys.deepl) payload.deepl_api_key = apiKeys.deepl

        try {
            const res = await fetch(`${API_BASE}/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || "Save failed")

            setProvider(data.provider)
            setOriginalProvider(data.provider)
            setBatchSize(data.batch_size)
            setOriginalBatchSize(data.batch_size)
            setKeyStatus({
                anthropic: data.anthropic_api_key_set,
                openai: data.openai_api_key_set,
                deepl: data.deepl_api_key_set,
            })
            setApiKeys({ anthropic: "", openai: "", deepl: "" })
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 3000)
        } catch (err) {
            console.error("Failed to save settings:", err)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="settings-view">
                <div className="dashboard-header">
                    <div className="title-group">
                        <h1>Settings</h1>
                        <p>Loading...</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="settings-view">
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Settings</h1>
                    <p>API Keys and Provider Configuration</p>
                </div>
            </div>

            {/* Provider Selection */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <h3 style={{ margin: "0 0 1rem 0", color: "var(--text-main)" }}>Translation Provider</h3>
                <div className="provider-cards">
                    {PROVIDERS.map((p) => (
                        <div key={p.id} className={`provider-card ${provider === p.id ? "active" : ""}`} onClick={() => setProvider(p.id)}>
                            <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: "0.25rem" }}>{p.label}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{p.description}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Manual Provider Info */}
            {provider === "manual" && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h3 style={{ margin: "0 0 0.75rem 0", color: "var(--text-main)" }}>Manual Translation Mode</h3>
                    <div style={{ color: "var(--text-dim)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                        <p style={{ marginBottom: "0.75rem" }}>
                            Manual mode exports untranslated strings to a JSON file (<code style={{ color: "var(--accent-primary)" }}>manual_edit.json</code>) in your storage directory. You translate
                            each entry by hand, then the tool reads your translations back in.
                        </p>
                        <p style={{ marginBottom: "0.75rem" }}>
                            Each entry in the file contains the original source text, source language, and an empty <code style={{ color: "var(--accent-primary)" }}>translation</code> field for you to
                            fill in. Leave the field blank to skip an entry.
                        </p>
                        <p style={{ marginBottom: "0" }}>
                            This mode has no API cost and requires no API keys. It is useful when you want full control over every translation or when working with languages/terminology that automated
                            providers handle poorly.
                        </p>
                    </div>
                </div>
            )}

            {/* API Keys */}
            {provider !== "manual" && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h3 style={{ margin: "0 0 1rem 0", color: "var(--text-main)" }}>API Keys</h3>
                    {PROVIDERS.filter((p) => p.keyField !== null).map((p) => {
                        const field = p.keyField!
                        const isSelected = provider === p.id
                        const status = keyStatus[field]
                        const isConfigured = status !== ""

                        return (
                            <div
                                key={field}
                                style={{
                                    marginBottom: "1.25rem",
                                    padding: "1rem",
                                    borderRadius: "8px",
                                    background: isSelected ? "rgba(56, 189, 248, 0.05)" : "transparent",
                                    border: isSelected ? "1px solid rgba(56, 189, 248, 0.2)" : "1px solid transparent",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.9rem" }}>{p.label} API Key</label>
                                    <span className={`key-status ${isConfigured ? "configured" : "missing"}`}>
                                        {isConfigured ? (
                                            <>
                                                <FaCheck /> {status}
                                            </>
                                        ) : (
                                            <>
                                                <FaExclamationTriangle /> Not configured
                                            </>
                                        )}
                                    </span>
                                </div>
                                <div className="key-input-wrapper">
                                    <input
                                        type={keyVisible[field] ? "text" : "password"}
                                        value={apiKeys[field]}
                                        onChange={(e) => setApiKeys((prev) => ({ ...prev, [field]: e.target.value }))}
                                        placeholder={isConfigured ? "Enter new key to update..." : "Enter API key..."}
                                    />
                                    <button
                                        className="key-toggle-btn"
                                        onClick={() => setKeyVisible((prev) => ({ ...prev, [field]: !prev[field] }))}
                                        title={keyVisible[field] ? "Hide" : "Show"}
                                        type="button"
                                    >
                                        {keyVisible[field] ? <FaEyeSlash /> : <FaEye />}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Batch Size */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-main)" }}>Batch Size</h3>
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                    Number of strings sent per API request. Larger batches are more cost-efficient but may hit token limits.
                </p>
                <input
                    type="number"
                    min={1}
                    max={500}
                    value={batchSize}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        if (!isNaN(val)) setBatchSize(val)
                    }}
                    style={{
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--glass-border)",
                        background: "rgba(0, 0, 0, 0.2)",
                        color: "var(--text-main)",
                        fontSize: "0.9rem",
                        width: "120px",
                    }}
                />
            </div>

            {/* Save */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <button className="btn btn-primary" disabled={!isChanged || saving} onClick={handleSave}>
                    {saving ? "Saving..." : "Save Settings"}
                </button>
                {saveSuccess && <span style={{ color: "var(--success)", fontSize: "0.9rem" }}>Settings saved successfully</span>}
            </div>
        </div>
    )
}

export default SettingsPage
