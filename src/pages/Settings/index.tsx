import React, { useState, useEffect } from "react"
import { FaEye, FaEyeSlash, FaCheck, FaExclamationTriangle, FaChevronDown, FaChevronRight, FaDownload } from "react-icons/fa"
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
    { id: "ollama", label: "Ollama (Local)", description: "Free local AI — no API key needed", keyField: null },
    { id: "manual", label: "Manual", description: "Export JSON for manual editing", keyField: null },
]

/** VRAM tier to recommended Ollama model mapping. */
const VRAM_TIERS = [
    { tier: "4-6gb", label: "4-6 GB", model: "gemma3:4b", description: "Google multilingual small", size: "3.3 GB" },
    { tier: "8gb", label: "8 GB", model: "qwen2.5:7b", description: "Alibaba, excellent CJK", size: "4.7 GB" },
    { tier: "12gb", label: "12 GB", model: "qwen2.5:14b", description: "Larger Qwen, better quality", size: "9.0 GB" },
    { tier: "16gb", label: "16 GB", model: "mistral-small:22b", description: "Strong reasoning", size: "13 GB" },
    { tier: "24gb+", label: "24 GB+", model: "qwen2.5:32b", description: "Near-API quality", size: "20 GB" },
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

    // Ollama-specific state
    const [ollamaStatus, setOllamaStatus] = useState<string>("unknown")
    const [ollamaModels, setOllamaModels] = useState<string[]>([])
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434")
    const [originalOllamaBaseUrl, setOriginalOllamaBaseUrl] = useState("http://localhost:11434")
    const [ollamaModel, setOllamaModel] = useState("qwen2.5:7b")
    const [originalOllamaModel, setOriginalOllamaModel] = useState("qwen2.5:7b")
    const [ollamaVramTier, setOllamaVramTier] = useState("")
    const [originalOllamaVramTier, setOriginalOllamaVramTier] = useState("")
    const [ollamaInstalling, setOllamaInstalling] = useState(false)
    const [ollamaPulling, setOllamaPulling] = useState(false)
    const [ollamaPullProgress, setOllamaPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
    const [showOllamaAdvanced, setShowOllamaAdvanced] = useState(false)

    const isChanged =
        provider !== originalProvider ||
        batchSize !== originalBatchSize ||
        apiKeys.anthropic !== "" ||
        apiKeys.openai !== "" ||
        apiKeys.deepl !== "" ||
        ollamaBaseUrl !== originalOllamaBaseUrl ||
        ollamaModel !== originalOllamaModel ||
        ollamaVramTier !== originalOllamaVramTier

    // Fetch current settings from the backend on mount.
    // Uses AbortController so React StrictMode's double-mount doesn't
    // let a stale response overwrite user interactions.
    useEffect(() => {
        const controller = new AbortController()
        fetch(`${API_BASE}/settings`, { signal: controller.signal })
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
                setOllamaBaseUrl(data.ollama_base_url || "http://localhost:11434")
                setOriginalOllamaBaseUrl(data.ollama_base_url || "http://localhost:11434")
                setOllamaModel(data.ollama_model || "qwen2.5:7b")
                setOriginalOllamaModel(data.ollama_model || "qwen2.5:7b")
                setOllamaVramTier(data.ollama_vram_tier || "")
                setOriginalOllamaVramTier(data.ollama_vram_tier || "")
                setLoading(false)

                // Fetch Ollama status separately so it doesn't block page load
                fetch(`${API_BASE}/ollama/status`, { signal: controller.signal })
                    .then((r) => r.json())
                    .then((statusData) => {
                        setOllamaStatus(statusData.status)
                        setOllamaModels(statusData.models.map((m: { name: string }) => m.name))
                    })
                    .catch(() => {})
            })
            .catch((err) => {
                if (err.name !== "AbortError") {
                    console.error("Failed to fetch settings:", err)
                    setLoading(false)
                }
            })
        return () => controller.abort()
    }, [])

    // Poll Ollama status when the Ollama provider is selected.
    useEffect(() => {
        if (provider !== "ollama") return
        const checkStatus = () => {
            fetch(`${API_BASE}/ollama/status`)
                .then((res) => res.json())
                .then((data) => {
                    setOllamaStatus(data.status)
                    setOllamaModels(data.models.map((m: { name: string }) => m.name))
                })
                .catch(() => setOllamaStatus("not_installed"))
        }
        checkStatus()
        const interval = setInterval(checkStatus, 10000)
        return () => clearInterval(interval)
    }, [provider])

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
        if (ollamaBaseUrl !== originalOllamaBaseUrl) payload.ollama_base_url = ollamaBaseUrl
        if (ollamaModel !== originalOllamaModel) payload.ollama_model = ollamaModel
        if (ollamaVramTier !== originalOllamaVramTier) payload.ollama_vram_tier = ollamaVramTier

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
            setOllamaBaseUrl(data.ollama_base_url || "http://localhost:11434")
            setOriginalOllamaBaseUrl(data.ollama_base_url || "http://localhost:11434")
            setOllamaModel(data.ollama_model || "qwen2.5:7b")
            setOriginalOllamaModel(data.ollama_model || "qwen2.5:7b")
            setOllamaVramTier(data.ollama_vram_tier || "")
            setOriginalOllamaVramTier(data.ollama_vram_tier || "")
            setOllamaStatus(data.ollama_status || "not_installed")
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 3000)
        } catch (err) {
            console.error("Failed to save settings:", err)
        } finally {
            setSaving(false)
        }
    }

    const handleVramTierSelect = (tier: (typeof VRAM_TIERS)[0]) => {
        if (ollamaVramTier === tier.tier) {
            setOllamaVramTier("")
            setOllamaModel("")
        } else {
            setOllamaVramTier(tier.tier)
            setOllamaModel(tier.model)
        }
    }

    const handleOllamaInstall = async () => {
        setOllamaInstalling(true)
        try {
            const res = await fetch(`${API_BASE}/ollama/install`, { method: "POST" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail)
        } catch (err) {
            console.error("Failed to install Ollama:", err)
        } finally {
            setOllamaInstalling(false)
        }
    }

    const handleOllamaPull = async (modelName: string) => {
        setOllamaPulling(true)
        setOllamaPullProgress(null)
        try {
            const res = await fetch(`${API_BASE}/ollama/pull`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName }),
            })
            const reader = res.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) return

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const text = decoder.decode(value)
                for (const line of text.split("\n")) {
                    if (line.startsWith("data: ")) {
                        try {
                            const progress = JSON.parse(line.slice(6))
                            setOllamaPullProgress(progress)
                            if (progress.status === "done") break
                        } catch {
                            /* skip malformed lines */
                        }
                    }
                }
            }
            // Refresh model list after pull
            fetch(`${API_BASE}/ollama/status`)
                .then((r) => r.json())
                .then((data) => {
                    setOllamaStatus(data.status)
                    setOllamaModels(data.models.map((m: { name: string }) => m.name))
                })
                .catch(() => {})
        } catch (err) {
            console.error("Failed to pull model:", err)
        } finally {
            setOllamaPulling(false)
            setOllamaPullProgress(null)
        }
    }

    /** Whether the selected Ollama model has been downloaded. */
    const isModelDownloaded = ollamaModels.some((m) => m === ollamaModel || m === ollamaModel + ":latest" || m + ":latest" === ollamaModel)

    /** Whether the user has manually overridden the model (differs from the VRAM tier default). */
    const tierDefault = VRAM_TIERS.find((t) => t.tier === ollamaVramTier)?.model || ""
    const isModelOverride = ollamaModel !== "" && ollamaModel !== tierDefault

    /** Status dot color based on Ollama status. */
    const statusColor = ollamaStatus === "running" ? "var(--success)" : ollamaStatus === "stopped" ? "var(--warning)" : ollamaStatus === "unknown" ? "var(--text-dim)" : "var(--danger)"
    const statusLabel = ollamaStatus === "running" ? "Running" : ollamaStatus === "stopped" ? "Stopped (not running)" : ollamaStatus === "unknown" ? "Checking..." : "Not Installed"

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

            {/* Ollama Configuration */}
            {provider === "ollama" && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h3 style={{ margin: "0 0 1rem 0", color: "var(--text-main)" }}>Ollama Configuration</h3>

                    {/* Status Indicator */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
                        <div
                            className="ollama-status-dot"
                            style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: statusColor,
                                boxShadow: `0 0 6px ${statusColor}`,
                            }}
                        />
                        <span style={{ color: "var(--text-main)", fontSize: "0.9rem", fontWeight: 500 }}>{statusLabel}</span>
                    </div>

                    {/* Install Button */}
                    {ollamaStatus === "not_installed" && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                                Ollama is not installed. Click below to download and install it automatically.
                            </p>
                            <button className="btn btn-primary" disabled={ollamaInstalling} onClick={handleOllamaInstall}>
                                <FaDownload style={{ marginRight: "0.5rem" }} />
                                {ollamaInstalling ? "Downloading installer..." : "Install Ollama"}
                            </button>
                        </div>
                    )}

                    {/* VRAM Tier Selector */}
                    <div style={{ marginBottom: "1.25rem" }}>
                        <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>GPU VRAM Tier</label>
                        <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                            Select your GPU's VRAM to get the best model recommendation for translation quality.
                        </p>
                        <div className="vram-tier-cards">
                            {VRAM_TIERS.map((t) => (
                                <div key={t.tier} className={`vram-tier-card ${ollamaVramTier === t.tier ? "active" : ""}`} onClick={() => handleVramTierSelect(t)}>
                                    <div style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>{t.label}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--accent-primary)", marginTop: "0.15rem" }}>{t.model}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{t.description}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{t.size} download</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Model Status & Download */}
                    {ollamaVramTier && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                                <span style={{ color: "var(--text-main)", fontSize: "0.9rem" }}>
                                    Selected model: <strong style={{ color: "var(--accent-primary)" }}>{ollamaModel}</strong>
                                </span>
                                {ollamaStatus === "running" && (
                                    <span className={`key-status ${isModelDownloaded ? "configured" : "missing"}`}>
                                        {isModelDownloaded ? (
                                            <>
                                                <FaCheck /> Downloaded
                                            </>
                                        ) : (
                                            <>
                                                <FaExclamationTriangle /> Not downloaded
                                            </>
                                        )}
                                    </span>
                                )}
                            </div>

                            {ollamaStatus === "running" && !isModelDownloaded && !ollamaPulling && (
                                <button className="btn btn-primary" onClick={() => handleOllamaPull(ollamaModel)}>
                                    <FaDownload style={{ marginRight: "0.5rem" }} />
                                    Download Model
                                </button>
                            )}

                            {ollamaPulling && ollamaPullProgress && (
                                <div style={{ marginTop: "0.5rem" }}>
                                    <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>{ollamaPullProgress.status}...</div>
                                    {ollamaPullProgress.total && ollamaPullProgress.total > 0 && (
                                        <div className="ollama-progress-bar">
                                            <div
                                                className="ollama-progress-fill"
                                                style={{ width: `${Math.round(((ollamaPullProgress.completed || 0) / ollamaPullProgress.total) * 100)}%` }}
                                            />
                                        </div>
                                    )}
                                    {ollamaPullProgress.total && ollamaPullProgress.total > 0 && (
                                        <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                                            {Math.round(((ollamaPullProgress.completed || 0) / ollamaPullProgress.total) * 100)}% ({Math.round((ollamaPullProgress.completed || 0) / 1024 / 1024)} /{" "}
                                            {Math.round(ollamaPullProgress.total / 1024 / 1024)} MB)
                                        </div>
                                    )}
                                </div>
                            )}
                            {ollamaPulling && !ollamaPullProgress && <div style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>Starting download...</div>}
                        </div>
                    )}

                    {/* Info Note */}
                    <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", fontStyle: "italic", marginBottom: "1rem" }}>
                        Smaller models may produce lower quality translations. Consider reducing batch size for models under 14B parameters.
                    </p>

                    {/* Advanced Section */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowOllamaAdvanced(!showOllamaAdvanced)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-dim)",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                padding: 0,
                            }}
                        >
                            {showOllamaAdvanced ? <FaChevronDown /> : <FaChevronRight />}
                            Advanced Settings
                        </button>
                        {showOllamaAdvanced && (
                            <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                <div>
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Ollama URL</label>
                                    <input
                                        type="text"
                                        value={ollamaBaseUrl}
                                        onChange={(e) => setOllamaBaseUrl(e.target.value)}
                                        placeholder="http://localhost:11434"
                                        style={{
                                            padding: "0.6rem 0.75rem",
                                            borderRadius: "8px",
                                            border: "1px solid var(--glass-border)",
                                            background: "rgba(0, 0, 0, 0.2)",
                                            color: "var(--text-main)",
                                            fontSize: "0.85rem",
                                            width: "320px",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Model (override)</label>
                                    <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                                        Use an installed model instead of the recommended one above.
                                    </p>
                                    {(() => {
                                        const overrideModels = ollamaModels.filter((m) => !VRAM_TIERS.some((t) => t.model === m))
                                        return overrideModels.length > 0 ? (
                                            <select
                                                value={isModelOverride ? ollamaModel : ""}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    if (val === "") {
                                                        // Reset to VRAM tier default
                                                        const tierModel = VRAM_TIERS.find((t) => t.tier === ollamaVramTier)?.model || ""
                                                        setOllamaModel(tierModel)
                                                    } else {
                                                        setOllamaModel(val)
                                                    }
                                                }}
                                                style={{
                                                    padding: "0.6rem 0.75rem",
                                                    borderRadius: "8px",
                                                    border: "1px solid var(--glass-border)",
                                                    background: "rgba(0, 0, 0, 0.2)",
                                                    color: "var(--text-main)",
                                                    fontSize: "0.85rem",
                                                    width: "340px",
                                                }}
                                            >
                                                <option value="">None (use recommended)</option>
                                                {overrideModels.map((m) => (
                                                    <option key={m} value={m}>
                                                        {m}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                                                {ollamaStatus === "running" ? "No other models installed" : "Ollama not running"}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* API Keys */}
            {provider !== "manual" && provider !== "ollama" && (
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
