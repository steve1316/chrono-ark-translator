import React, { useState, useEffect } from "react"
import { FaEye, FaEyeSlash, FaCheck, FaExclamationTriangle, FaChevronDown, FaChevronRight, FaDownload, FaPlay, FaStop } from "react-icons/fa"
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
    { id: "llamacpp", label: "llama.cpp (Local)", description: "Direct llama-server connection", keyField: null },
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

/** VRAM tier to recommended GGUF model mapping for llama.cpp. Single-file quantizations from bartowski. */
const GGUF_TIERS = [
    {
        tier: "4-6gb",
        label: "4-6 GB",
        model: "Qwen2.5-3B-Instruct",
        description: "Alibaba, fast CJK",
        size: "1.8 GB",
        filename: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    },
    {
        tier: "8gb",
        label: "8 GB",
        model: "Qwen2.5-7B-Instruct",
        description: "Alibaba, excellent CJK",
        size: "4.4 GB",
        filename: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    },
    {
        tier: "12gb",
        label: "12 GB",
        model: "Qwen2.5-14B-Instruct",
        description: "Larger Qwen, better quality",
        size: "8.4 GB",
        filename: "Qwen2.5-14B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    },
    {
        tier: "16gb",
        label: "16 GB",
        model: "Qwen2.5-14B-Instruct",
        description: "Higher quality quantization",
        size: "14.6 GB",
        filename: "Qwen2.5-14B-Instruct-Q8_0.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q8_0.gguf",
    },
    {
        tier: "24gb+",
        label: "24 GB+",
        model: "Qwen2.5-32B-Instruct",
        description: "Near-API quality",
        size: "18.5 GB",
        filename: "Qwen2.5-32B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF/resolve/main/Qwen2.5-32B-Instruct-Q4_K_M.gguf",
    },
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

    // Ollama process management
    const [ollamaManaged, setOllamaManaged] = useState(false)
    const [ollamaStarting, setOllamaStarting] = useState(false)
    const [ollamaStopping, setOllamaStopping] = useState(false)

    // llama.cpp-specific state
    const [llamacppStatus, setLlamacppStatus] = useState<string>("unknown")
    const [llamacppBaseUrl, setLlamacppBaseUrl] = useState("http://localhost:8080")
    const [originalLlamacppBaseUrl, setOriginalLlamacppBaseUrl] = useState("http://localhost:8080")
    const [llamacppModel, setLlamacppModel] = useState("")
    const [originalLlamacppModel, setOriginalLlamacppModel] = useState("")
    const [llamacppBinaryPath, setLlamacppBinaryPath] = useState("llama-server")
    const [originalLlamacppBinaryPath, setOriginalLlamacppBinaryPath] = useState("llama-server")
    const [llamacppModelPath, setLlamacppModelPath] = useState("")
    const [originalLlamacppModelPath, setOriginalLlamacppModelPath] = useState("")
    const [llamacppGpuLayers, setLlamacppGpuLayers] = useState(-1)
    const [originalLlamacppGpuLayers, setOriginalLlamacppGpuLayers] = useState(-1)
    const [llamacppCtxSize, setLlamacppCtxSize] = useState(8192)
    const [originalLlamacppCtxSize, setOriginalLlamacppCtxSize] = useState(8192)
    const [showLlamacppAdvanced, setShowLlamacppAdvanced] = useState(false)
    const [llamacppVramTier, setLlamacppVramTier] = useState("")
    const [originalLlamacppVramTier, setOriginalLlamacppVramTier] = useState("")
    const [llamacppLocalModels, setLlamacppLocalModels] = useState<{ name: string; path: string; size: number }[]>([])
    const [llamacppDownloading, setLlamacppDownloading] = useState(false)
    const [llamacppDownloadProgress, setLlamacppDownloadProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
    const [llamacppInstalled, setLlamacppInstalled] = useState(false)
    const [llamacppInstalling, setLlamacppInstalling] = useState(false)
    const [llamacppInstallProgress, setLlamacppInstallProgress] = useState<{ status: string; file?: string; completed?: number; total?: number } | null>(null)

    const isChanged =
        provider !== originalProvider ||
        batchSize !== originalBatchSize ||
        apiKeys.anthropic !== "" ||
        apiKeys.openai !== "" ||
        apiKeys.deepl !== "" ||
        ollamaBaseUrl !== originalOllamaBaseUrl ||
        ollamaModel !== originalOllamaModel ||
        ollamaVramTier !== originalOllamaVramTier ||
        llamacppBaseUrl !== originalLlamacppBaseUrl ||
        llamacppModel !== originalLlamacppModel ||
        llamacppBinaryPath !== originalLlamacppBinaryPath ||
        llamacppModelPath !== originalLlamacppModelPath ||
        llamacppGpuLayers !== originalLlamacppGpuLayers ||
        llamacppCtxSize !== originalLlamacppCtxSize ||
        llamacppVramTier !== originalLlamacppVramTier

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
                setLlamacppBaseUrl(data.llamacpp_base_url || "http://localhost:8080")
                setOriginalLlamacppBaseUrl(data.llamacpp_base_url || "http://localhost:8080")
                setLlamacppModel(data.llamacpp_model || "")
                setOriginalLlamacppModel(data.llamacpp_model || "")
                setLlamacppBinaryPath(data.llamacpp_binary_path || "llama-server")
                setOriginalLlamacppBinaryPath(data.llamacpp_binary_path || "llama-server")
                setLlamacppModelPath(data.llamacpp_model_path || "")
                setOriginalLlamacppModelPath(data.llamacpp_model_path || "")
                setLlamacppGpuLayers(data.llamacpp_gpu_layers ?? -1)
                setOriginalLlamacppGpuLayers(data.llamacpp_gpu_layers ?? -1)
                setLlamacppCtxSize(data.llamacpp_ctx_size ?? 8192)
                setOriginalLlamacppCtxSize(data.llamacpp_ctx_size ?? 8192)
                setOllamaManaged(data.ollama_managed ?? false)
                setLlamacppVramTier(data.llamacpp_vram_tier || "")
                setOriginalLlamacppVramTier(data.llamacpp_vram_tier || "")
                setLoading(false)

                // Fetch Ollama status separately so it doesn't block page load
                fetch(`${API_BASE}/ollama/status`, { signal: controller.signal })
                    .then((r) => r.json())
                    .then((statusData) => {
                        setOllamaStatus(statusData.status)
                        setOllamaModels(statusData.models.map((m: { name: string }) => m.name))
                        setOllamaManaged(statusData.managed ?? false)
                    })
                    .catch(() => {})

                // Fetch local GGUF models
                fetch(`${API_BASE}/llamacpp/models`, { signal: controller.signal })
                    .then((r) => r.json())
                    .then((modelsData) => setLlamacppLocalModels(modelsData.models || []))
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
                    setOllamaManaged(data.managed ?? false)
                })
                .catch(() => setOllamaStatus("not_installed"))
        }
        checkStatus()
        const interval = setInterval(checkStatus, 10000)
        return () => clearInterval(interval)
    }, [provider])

    // Poll llama.cpp status when the llamacpp provider is selected.
    // Skip polling during install or download to avoid resetting state.
    useEffect(() => {
        if (provider !== "llamacpp") return
        if (llamacppInstalling || llamacppDownloading) return
        const checkStatus = () => {
            fetch(`${API_BASE}/llamacpp/status`)
                .then((res) => res.json())
                .then((data) => {
                    setLlamacppStatus(data.status)
                    setLlamacppInstalled(data.installed ?? false)
                })
                .catch(() => setLlamacppStatus("not_running"))
        }
        checkStatus()
        const interval = setInterval(checkStatus, 10000)
        return () => clearInterval(interval)
    }, [provider, llamacppBaseUrl, llamacppInstalling, llamacppDownloading])

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
        if (llamacppBaseUrl !== originalLlamacppBaseUrl) payload.llamacpp_base_url = llamacppBaseUrl
        if (llamacppModel !== originalLlamacppModel) payload.llamacpp_model = llamacppModel
        if (llamacppBinaryPath !== originalLlamacppBinaryPath) payload.llamacpp_binary_path = llamacppBinaryPath
        if (llamacppModelPath !== originalLlamacppModelPath) payload.llamacpp_model_path = llamacppModelPath
        if (llamacppGpuLayers !== originalLlamacppGpuLayers) payload.llamacpp_gpu_layers = llamacppGpuLayers
        if (llamacppCtxSize !== originalLlamacppCtxSize) payload.llamacpp_ctx_size = llamacppCtxSize
        if (llamacppVramTier !== originalLlamacppVramTier) payload.llamacpp_vram_tier = llamacppVramTier

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
            setLlamacppBaseUrl(data.llamacpp_base_url || "http://localhost:8080")
            setOriginalLlamacppBaseUrl(data.llamacpp_base_url || "http://localhost:8080")
            setLlamacppModel(data.llamacpp_model || "")
            setOriginalLlamacppModel(data.llamacpp_model || "")
            setLlamacppBinaryPath(data.llamacpp_binary_path || "llama-server")
            setOriginalLlamacppBinaryPath(data.llamacpp_binary_path || "llama-server")
            setLlamacppModelPath(data.llamacpp_model_path || "")
            setOriginalLlamacppModelPath(data.llamacpp_model_path || "")
            setLlamacppGpuLayers(data.llamacpp_gpu_layers ?? -1)
            setOriginalLlamacppGpuLayers(data.llamacpp_gpu_layers ?? -1)
            setLlamacppCtxSize(data.llamacpp_ctx_size ?? 8192)
            setOriginalLlamacppCtxSize(data.llamacpp_ctx_size ?? 8192)
            setOllamaManaged(data.ollama_managed ?? false)
            setLlamacppVramTier(data.llamacpp_vram_tier || "")
            setOriginalLlamacppVramTier(data.llamacpp_vram_tier || "")
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

    const handleOllamaStart = async () => {
        setOllamaStarting(true)
        try {
            const res = await fetch(`${API_BASE}/ollama/start`, { method: "POST" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail)
            setOllamaManaged(data.managed)
            // Refresh status
            const statusRes = await fetch(`${API_BASE}/ollama/status`)
            const statusData = await statusRes.json()
            setOllamaStatus(statusData.status)
            setOllamaManaged(statusData.managed ?? false)
            setOllamaModels(statusData.models.map((m: { name: string }) => m.name))
        } catch (err) {
            console.error("Failed to start Ollama:", err)
        } finally {
            setOllamaStarting(false)
        }
    }

    const handleOllamaStop = async () => {
        setOllamaStopping(true)
        try {
            const res = await fetch(`${API_BASE}/ollama/stop`, { method: "POST" })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail)
            }
            setOllamaManaged(false)
            setOllamaStatus("stopped")
        } catch (err) {
            console.error("Failed to stop Ollama:", err)
        } finally {
            setOllamaStopping(false)
        }
    }

    const refreshLlamacppModels = () => {
        fetch(`${API_BASE}/llamacpp/models`)
            .then((r) => r.json())
            .then((data) => setLlamacppLocalModels(data.models || []))
            .catch(() => {})
    }

    const handleGgufTierSelect = (tier: (typeof GGUF_TIERS)[0]) => {
        if (llamacppVramTier === tier.tier) {
            setLlamacppVramTier("")
            setLlamacppModel("")
        } else {
            setLlamacppVramTier(tier.tier)
            setLlamacppModel(tier.model)
            // Auto-set model path if this GGUF is already downloaded and persist to backend
            const local = llamacppLocalModels.find((m) => m.name === tier.filename)
            if (local) {
                setLlamacppModelPath(local.path)
                setOriginalLlamacppModelPath(local.path)
                setOriginalLlamacppModel(tier.model)
                setOriginalLlamacppVramTier(tier.tier)
                fetch(`${API_BASE}/settings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        llamacpp_model_path: local.path,
                        llamacpp_model: tier.model,
                        llamacpp_vram_tier: tier.tier,
                    }),
                }).catch(() => {})
            }
        }
    }

    const handleGgufDownload = async (tier: (typeof GGUF_TIERS)[0]) => {
        setLlamacppDownloading(true)
        setLlamacppDownloadProgress(null)
        try {
            const res = await fetch(`${API_BASE}/llamacpp/download`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: tier.url, filename: tier.filename }),
            })

            const reader = res.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) {
                console.error("GGUF download: no reader available")
                return
            }

            let buffer = ""
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                // Process complete lines
                const lines = buffer.split("\n")
                buffer = lines.pop() || "" // keep incomplete last line in buffer
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const progress = JSON.parse(line.slice(6))
                            setLlamacppDownloadProgress(progress)
                            if (progress.status === "done" && progress.path) {
                                setLlamacppModelPath(progress.path)
                                setOriginalLlamacppModelPath(progress.path)
                                // Auto-save model path + display name to backend
                                fetch(`${API_BASE}/settings`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        llamacpp_model_path: progress.path,
                                        llamacpp_model: tier.model,
                                        llamacpp_vram_tier: tier.tier,
                                    }),
                                }).catch(() => {})
                                setOriginalLlamacppModel(tier.model)
                                setOriginalLlamacppVramTier(tier.tier)
                            }
                            if (progress.status === "error") {
                                console.error("GGUF download error:", progress.message)
                            }
                        } catch {
                            /* skip malformed lines */
                        }
                    }
                }
            }
            refreshLlamacppModels()
        } catch (err) {
            console.error("Failed to download GGUF:", err)
        } finally {
            setLlamacppDownloading(false)
            setLlamacppDownloadProgress(null)
        }
    }

    const handleGgufDelete = async (filename: string) => {
        try {
            const res = await fetch(`${API_BASE}/llamacpp/models/${encodeURIComponent(filename)}`, { method: "DELETE" })
            if (!res.ok) return
            refreshLlamacppModels()
            // Clear model path if it pointed to the deleted file
            const deleted = llamacppLocalModels.find((m) => m.name === filename)
            if (deleted && llamacppModelPath === deleted.path) {
                setLlamacppModelPath("")
            }
        } catch (err) {
            console.error("Failed to delete model:", err)
        }
    }

    const handleLlamacppInstall = async (backend: string) => {
        setLlamacppInstalling(true)
        setLlamacppInstallProgress(null)
        try {
            const res = await fetch(`${API_BASE}/llamacpp/install`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ backend }),
            })
            const reader = res.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) return

            let buffer = ""
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const progress = JSON.parse(line.slice(6))
                            setLlamacppInstallProgress(progress)
                            if (progress.status === "done") {
                                setLlamacppInstalled(true)
                                if (progress.binary_path) {
                                    setLlamacppBinaryPath(progress.binary_path)
                                    setOriginalLlamacppBinaryPath(progress.binary_path)
                                }
                            }
                        } catch {
                            /* skip */
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Failed to install llama-server:", err)
        } finally {
            setLlamacppInstalling(false)
            setLlamacppInstallProgress(null)
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

                    {/* Status Indicator + Start/Stop */}
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
                        {ollamaStatus === "stopped" && (
                            <button className="btn btn-primary" disabled={ollamaStarting} onClick={handleOllamaStart} style={{ marginLeft: "0.75rem", padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>
                                <FaPlay style={{ marginRight: "0.4rem", fontSize: "0.65rem" }} />
                                {ollamaStarting ? "Starting..." : "Start"}
                            </button>
                        )}
                        {ollamaStatus === "running" && ollamaManaged && (
                            <button
                                className="btn"
                                disabled={ollamaStopping}
                                onClick={handleOllamaStop}
                                style={{
                                    marginLeft: "0.75rem",
                                    padding: "0.25rem 0.75rem",
                                    fontSize: "0.8rem",
                                    background: "var(--danger)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                }}
                            >
                                <FaStop style={{ marginRight: "0.4rem", fontSize: "0.65rem" }} />
                                {ollamaStopping ? "Stopping..." : "Stop"}
                            </button>
                        )}
                        {ollamaStatus === "running" && !ollamaManaged && (
                            <span style={{ marginLeft: "0.75rem", color: "var(--text-dim)", fontSize: "0.75rem", fontStyle: "italic" }}>Started externally</span>
                        )}
                    </div>

                    {/* Install Button */}
                    {ollamaStatus === "not_installed" && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>Ollama is not installed. Click below to download and install it automatically.</p>
                            <button className="btn btn-primary" disabled={ollamaInstalling} onClick={handleOllamaInstall}>
                                <FaDownload style={{ marginRight: "0.5rem" }} />
                                {ollamaInstalling ? "Downloading installer..." : "Install Ollama"}
                            </button>
                        </div>
                    )}

                    {/* VRAM Tier Selector */}
                    <div style={{ marginBottom: "1.25rem" }}>
                        <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>GPU VRAM Tier</label>
                        <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>Select your GPU's VRAM to get the best model recommendation for translation quality.</p>
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
                                            <div className="ollama-progress-fill" style={{ width: `${Math.round(((ollamaPullProgress.completed || 0) / ollamaPullProgress.total) * 100)}%` }} />
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
                                    <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Use an installed model instead of the recommended one above.</p>
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
                                            <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{ollamaStatus === "running" ? "No other models installed" : "Ollama not running"}</span>
                                        )
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* llama.cpp Configuration */}
            {provider === "llamacpp" && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h3 style={{ margin: "0 0 1rem 0", color: "var(--text-main)" }}>llama.cpp Configuration</h3>

                    {/* Status Indicator + Start/Stop */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
                        <div
                            style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background:
                                    llamacppStatus === "running"
                                        ? "var(--success)"
                                        : llamacppInstalled && llamacppModelPath
                                          ? "var(--success)"
                                          : llamacppStatus === "unknown"
                                            ? "var(--text-dim)"
                                            : "var(--danger)",
                                boxShadow: `0 0 6px ${llamacppStatus === "running" ? "var(--success)" : llamacppInstalled && llamacppModelPath ? "var(--success)" : llamacppStatus === "unknown" ? "var(--text-dim)" : "var(--danger)"}`,
                            }}
                        />
                        <span style={{ color: "var(--text-main)", fontSize: "0.9rem", fontWeight: 500 }}>
                            {llamacppStatus === "running" ? "Running" : llamacppInstalled && llamacppModelPath ? "Ready" : llamacppStatus === "unknown" ? "Checking..." : "Not Configured"}
                        </span>
                        {llamacppInstalled && llamacppModelPath && llamacppStatus !== "running" && (
                            <span style={{ marginLeft: "0.75rem", color: "var(--text-dim)", fontSize: "0.75rem", fontStyle: "italic" }}>Server starts automatically when translating</span>
                        )}
                    </div>

                    {/* Install llama-server */}
                    {!llamacppInstalled && !llamacppInstalling && llamacppStatus !== "running" && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>Install llama-server</label>
                            <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>Select your GPU type to download the correct llama-server build.</p>
                            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                                <button className="btn btn-primary" onClick={() => handleLlamacppInstall("cuda-13")}>
                                    <FaDownload style={{ marginRight: "0.5rem" }} />
                                    NVIDIA RTX 40/50 series
                                </button>
                                <button className="btn btn-primary" onClick={() => handleLlamacppInstall("cuda-12")} style={{ background: "var(--accent-secondary, #8b5cf6)" }}>
                                    <FaDownload style={{ marginRight: "0.5rem" }} />
                                    NVIDIA RTX 20/30 series
                                </button>
                                <button className="btn btn-primary" onClick={() => handleLlamacppInstall("vulkan")} style={{ background: "var(--accent-secondary, #6366f1)" }}>
                                    <FaDownload style={{ marginRight: "0.5rem" }} />
                                    Any GPU (Vulkan)
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => handleLlamacppInstall("cpu")}
                                    style={{ background: "var(--glass-border)", color: "var(--text-main)", border: "none", borderRadius: "8px", padding: "0.5rem 1rem", cursor: "pointer" }}
                                >
                                    <FaDownload style={{ marginRight: "0.5rem" }} />
                                    CPU Only
                                </button>
                            </div>
                        </div>
                    )}
                    {llamacppInstalling && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                                {llamacppInstallProgress?.status === "fetching_release" && "Finding latest release..."}
                                {llamacppInstallProgress?.status === "downloading" && `Downloading ${llamacppInstallProgress.file || ""}...`}
                                {llamacppInstallProgress?.status === "extracting" && "Extracting..."}
                                {!llamacppInstallProgress && "Starting install..."}
                            </div>
                            {llamacppInstallProgress?.total && llamacppInstallProgress.total > 0 && (
                                <>
                                    <div className="ollama-progress-bar">
                                        <div className="ollama-progress-fill" style={{ width: `${Math.round(((llamacppInstallProgress.completed || 0) / llamacppInstallProgress.total) * 100)}%` }} />
                                    </div>
                                    <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                                        {Math.round(((llamacppInstallProgress.completed || 0) / llamacppInstallProgress.total) * 100)}% (
                                        {Math.round((llamacppInstallProgress.completed || 0) / 1024 / 1024)} / {Math.round(llamacppInstallProgress.total / 1024 / 1024)} MB)
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* VRAM Tier Selector */}
                    <div style={{ marginBottom: "1.25rem" }}>
                        <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>GPU VRAM Tier</label>
                        <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                            Select your GPU's VRAM to get the best model recommendation. The model will be downloaded automatically.
                        </p>
                        <div className="vram-tier-cards">
                            {GGUF_TIERS.map((t) => (
                                <div key={t.tier} className={`vram-tier-card ${llamacppVramTier === t.tier ? "active" : ""}`} onClick={() => handleGgufTierSelect(t)}>
                                    <div style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>{t.label}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--accent-primary)", marginTop: "0.15rem" }}>{t.model}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{t.description}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{t.size} download</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Model Status & Download */}
                    {llamacppVramTier &&
                        (() => {
                            const selectedTier = GGUF_TIERS.find((t) => t.tier === llamacppVramTier)!
                            const isDownloaded = llamacppLocalModels.some((m) => m.name === selectedTier.filename)
                            return (
                                <div style={{ marginBottom: "1.25rem" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                                        <span style={{ color: "var(--text-main)", fontSize: "0.9rem" }}>
                                            Selected model: <strong style={{ color: "var(--accent-primary)" }}>{selectedTier.filename}</strong>
                                        </span>
                                        <span className={`key-status ${isDownloaded ? "configured" : "missing"}`}>
                                            {isDownloaded ? (
                                                <>
                                                    <FaCheck /> Downloaded
                                                </>
                                            ) : (
                                                <>
                                                    <FaExclamationTriangle /> Not downloaded
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {!isDownloaded && !llamacppDownloading && (
                                        <button className="btn btn-primary" onClick={() => handleGgufDownload(selectedTier)}>
                                            <FaDownload style={{ marginRight: "0.5rem" }} />
                                            Download Model ({selectedTier.size})
                                        </button>
                                    )}

                                    {llamacppDownloading && llamacppDownloadProgress && (
                                        <div style={{ marginTop: "0.5rem" }}>
                                            <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                                                {llamacppDownloadProgress.status === "connecting" ? "Connecting to HuggingFace..." : "Downloading..."}
                                            </div>
                                            {llamacppDownloadProgress.total && llamacppDownloadProgress.total > 0 && (
                                                <div className="ollama-progress-bar">
                                                    <div
                                                        className="ollama-progress-fill"
                                                        style={{ width: `${Math.round(((llamacppDownloadProgress.completed || 0) / llamacppDownloadProgress.total) * 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                            {llamacppDownloadProgress.total && llamacppDownloadProgress.total > 0 && (
                                                <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                                                    {Math.round(((llamacppDownloadProgress.completed || 0) / llamacppDownloadProgress.total) * 100)}% (
                                                    {Math.round((llamacppDownloadProgress.completed || 0) / 1024 / 1024)} / {Math.round(llamacppDownloadProgress.total / 1024 / 1024)} MB)
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {llamacppDownloading && !llamacppDownloadProgress && <div style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>Connecting...</div>}

                                    {isDownloaded && (
                                        <button
                                            onClick={() => handleGgufDelete(selectedTier.filename)}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                color: "var(--text-dim)",
                                                fontSize: "0.75rem",
                                                cursor: "pointer",
                                                textDecoration: "underline",
                                                padding: 0,
                                                marginTop: "0.5rem",
                                            }}
                                        >
                                            Delete downloaded model
                                        </button>
                                    )}
                                </div>
                            )
                        })()}

                    {/* Info Note */}
                    <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", fontStyle: "italic", marginBottom: "1rem" }}>
                        Smaller models may produce lower quality translations. Consider reducing batch size for models under 14B parameters.
                    </p>

                    {/* Advanced Section */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowLlamacppAdvanced(!showLlamacppAdvanced)}
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
                            {showLlamacppAdvanced ? <FaChevronDown /> : <FaChevronRight />}
                            Advanced Settings
                        </button>
                        {showLlamacppAdvanced && (
                            <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                <div>
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Model Path (override)</label>
                                    <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                                        Auto-filled when you download a model. Override to use a different GGUF file.
                                    </p>
                                    <input
                                        type="text"
                                        value={llamacppModelPath}
                                        onChange={(e) => setLlamacppModelPath(e.target.value)}
                                        placeholder="Auto-filled on download"
                                        style={{
                                            padding: "0.6rem 0.75rem",
                                            borderRadius: "8px",
                                            border: "1px solid var(--glass-border)",
                                            background: "rgba(0, 0, 0, 0.2)",
                                            color: "var(--text-main)",
                                            fontSize: "0.85rem",
                                            width: "100%",
                                            maxWidth: "500px",
                                        }}
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                                    <div>
                                        <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>GPU Layers</label>
                                        <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>-1 = offload all layers to GPU</p>
                                        <input
                                            type="number"
                                            value={llamacppGpuLayers}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10)
                                                if (!isNaN(val)) setLlamacppGpuLayers(val)
                                            }}
                                            style={{
                                                padding: "0.6rem 0.75rem",
                                                borderRadius: "8px",
                                                border: "1px solid var(--glass-border)",
                                                background: "rgba(0, 0, 0, 0.2)",
                                                color: "var(--text-main)",
                                                fontSize: "0.85rem",
                                                width: "120px",
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Context Size</label>
                                        <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Tokens for prompt + response</p>
                                        <input
                                            type="number"
                                            min={512}
                                            step={1024}
                                            value={llamacppCtxSize}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10)
                                                if (!isNaN(val)) setLlamacppCtxSize(val)
                                            }}
                                            style={{
                                                padding: "0.6rem 0.75rem",
                                                borderRadius: "8px",
                                                border: "1px solid var(--glass-border)",
                                                background: "rgba(0, 0, 0, 0.2)",
                                                color: "var(--text-main)",
                                                fontSize: "0.85rem",
                                                width: "120px",
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Server URL</label>
                                    <input
                                        type="text"
                                        value={llamacppBaseUrl}
                                        onChange={(e) => setLlamacppBaseUrl(e.target.value)}
                                        placeholder="http://localhost:8080"
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
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Binary Path</label>
                                    <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Path to the llama-server binary. Default assumes it is on PATH.</p>
                                    <input
                                        type="text"
                                        value={llamacppBinaryPath}
                                        onChange={(e) => setLlamacppBinaryPath(e.target.value)}
                                        placeholder="llama-server"
                                        style={{
                                            padding: "0.6rem 0.75rem",
                                            borderRadius: "8px",
                                            border: "1px solid var(--glass-border)",
                                            background: "rgba(0, 0, 0, 0.2)",
                                            color: "var(--text-main)",
                                            fontSize: "0.85rem",
                                            width: "100%",
                                            maxWidth: "500px",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontWeight: 500, color: "var(--text-main)", fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Display Name</label>
                                    <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Label shown in the UI during translation. Auto-filled from tier selection.</p>
                                    <input
                                        type="text"
                                        value={llamacppModel}
                                        onChange={(e) => setLlamacppModel(e.target.value)}
                                        placeholder="e.g. Qwen2.5-14B-Instruct"
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
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* API Keys */}
            {provider !== "manual" && provider !== "ollama" && provider !== "llamacpp" && (
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
