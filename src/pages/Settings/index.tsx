import React, { useEffect, useId, useState } from "react"
import { FaEye, FaEyeSlash, FaCheck, FaExclamationTriangle, FaChevronDown, FaChevronRight, FaDownload, FaPlay, FaStop, FaTimes } from "react-icons/fa"
import { API_BASE } from "../../config"
import { gameApi } from "../../api/games"
import ErrorState from "../../ui/ErrorState"
import Field from "../../ui/Field"
import LoadingState from "../../ui/LoadingState"
import PageHeader from "../../ui/PageHeader"
import Panel from "../../ui/Panel"

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
    { id: "claude", label: "Claude", description: "Anthropic", keyField: "anthropic" as const },
    { id: "openai", label: "OpenAI", description: "OpenAI", keyField: "openai" as const },
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
    // Prefix for every field id on the page, so each label can point at its control.
    const fieldId = useId()
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
    const [claudeModel, setClaudeModel] = useState("claude-sonnet-5")
    const [originalClaudeModel, setOriginalClaudeModel] = useState("claude-sonnet-5")
    const [openaiModel, setOpenaiModel] = useState("gpt-4.1")
    const [originalOpenaiModel, setOriginalOpenaiModel] = useState("gpt-4.1")
    const [claudeModels, setClaudeModels] = useState<{ id: string; label: string; input_per_mtok: number; output_per_mtok: number }[]>([])
    const [openaiModels, setOpenaiModels] = useState<{ id: string; label: string; input_per_mtok: number; output_per_mtok: number }[]>([])

    const [saving, setSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [loading, setLoading] = useState(true)
    // Why the settings could not be loaded. While set, the page shows an error with Retry instead of a form of defaults.
    const [loadError, setLoadError] = useState<string | null>(null)
    // Bumped by Retry to run the load effect again.
    const [loadAttempt, setLoadAttempt] = useState(0)

    // Ignored mods state
    const [ignoredMods, setIgnoredMods] = useState<string[]>([])
    const [originalIgnoredMods, setOriginalIgnoredMods] = useState<string[]>([])
    const [newIgnoredMod, setNewIgnoredMod] = useState("")

    // TW3 path state
    const [tw3HelperPath, setTw3HelperPath] = useState("")
    const [originalTw3HelperPath, setOriginalTw3HelperPath] = useState("")
    const [tw3RpfmCliPath, setTw3RpfmCliPath] = useState("")
    const [originalTw3RpfmCliPath, setOriginalTw3RpfmCliPath] = useState("")
    const [tw3SteamLibraryDrive, setTw3SteamLibraryDrive] = useState("")
    const [originalTw3SteamLibraryDrive, setOriginalTw3SteamLibraryDrive] = useState("")
    const [steamcmdPath, setSteamcmdPath] = useState("")
    const [originalSteamcmdPath, setOriginalSteamcmdPath] = useState("")
    const [steamUsername, setSteamUsername] = useState("")
    const [originalSteamUsername, setOriginalSteamUsername] = useState("")
    const [steamcmdInstalling, setSteamcmdInstalling] = useState(false)
    const [steamcmdInstallError, setSteamcmdInstallError] = useState<string | null>(null)

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

    // System prompt preview state
    const [systemPrompt, setSystemPrompt] = useState("")
    const [promptSourceLang, setPromptSourceLang] = useState("Chinese")
    const [promptLoading, setPromptLoading] = useState(false)

    const isChanged =
        provider !== originalProvider ||
        batchSize !== originalBatchSize ||
        claudeModel !== originalClaudeModel ||
        openaiModel !== originalOpenaiModel ||
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
        llamacppVramTier !== originalLlamacppVramTier ||
        JSON.stringify(ignoredMods) !== JSON.stringify(originalIgnoredMods) ||
        tw3HelperPath !== originalTw3HelperPath ||
        tw3RpfmCliPath !== originalTw3RpfmCliPath ||
        tw3SteamLibraryDrive !== originalTw3SteamLibraryDrive ||
        steamcmdPath !== originalSteamcmdPath ||
        steamUsername !== originalSteamUsername

    // Fetch current settings from the backend on open and on Retry.
    // Uses AbortController so React StrictMode's double-mount doesn't
    // let a stale response overwrite user interactions.
    useEffect(() => {
        const controller = new AbortController()
        fetch(`${API_BASE}/settings`, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
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
                setIgnoredMods(data.ignored_mods ?? [])
                setOriginalIgnoredMods(data.ignored_mods ?? [])
                setTw3HelperPath(data.tw3_helper_path || "")
                setOriginalTw3HelperPath(data.tw3_helper_path || "")
                setTw3RpfmCliPath(data.tw3_rpfm_cli_path || "")
                setOriginalTw3RpfmCliPath(data.tw3_rpfm_cli_path || "")
                setTw3SteamLibraryDrive(data.tw3_steam_library_drive || "")
                setOriginalTw3SteamLibraryDrive(data.tw3_steam_library_drive || "")
                setSteamcmdPath(data.steamcmd_path || "")
                setOriginalSteamcmdPath(data.steamcmd_path || "")
                setSteamUsername(data.steam_username || "")
                setOriginalSteamUsername(data.steam_username || "")
                setClaudeModel(data.claude_model || "claude-sonnet-5")
                setOriginalClaudeModel(data.claude_model || "claude-sonnet-5")
                setOpenaiModel(data.openai_model || "gpt-4.1")
                setOriginalOpenaiModel(data.openai_model || "gpt-4.1")
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
                    setLoadError(err.message)
                    setLoading(false)
                }
            })
        return () => controller.abort()
    }, [loadAttempt])

    /** Clears the load error, shows the loading state again and reloads the settings. */
    const retryLoad = () => {
        setLoadError(null)
        setLoading(true)
        setLoadAttempt((n) => n + 1)
    }

    // Fetch model catalogs for Claude and OpenAI on mount.
    useEffect(() => {
        fetch(`${API_BASE}/models/claude`)
            .then((r) => r.json())
            .then((d) => setClaudeModels(d.models))
            .catch(() => {})
        fetch(`${API_BASE}/models/openai`)
            .then((r) => r.json())
            .then((d) => setOpenaiModels(d.models))
            .catch(() => {})
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
        if (claudeModel !== originalClaudeModel) payload.claude_model = claudeModel
        if (openaiModel !== originalOpenaiModel) payload.openai_model = openaiModel
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
        if (JSON.stringify(ignoredMods) !== JSON.stringify(originalIgnoredMods)) payload.ignored_mods = ignoredMods
        if (tw3HelperPath !== originalTw3HelperPath) payload.tw3_helper_path = tw3HelperPath
        if (tw3RpfmCliPath !== originalTw3RpfmCliPath) payload.tw3_rpfm_cli_path = tw3RpfmCliPath
        if (tw3SteamLibraryDrive !== originalTw3SteamLibraryDrive) payload.tw3_steam_library_drive = tw3SteamLibraryDrive
        if (steamcmdPath !== originalSteamcmdPath) payload.steamcmd_path = steamcmdPath
        if (steamUsername !== originalSteamUsername) payload.steam_username = steamUsername

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
            setIgnoredMods(data.ignored_mods ?? [])
            setOriginalIgnoredMods(data.ignored_mods ?? [])
            setTw3HelperPath(data.tw3_helper_path || "")
            setOriginalTw3HelperPath(data.tw3_helper_path || "")
            setTw3RpfmCliPath(data.tw3_rpfm_cli_path || "")
            setOriginalTw3RpfmCliPath(data.tw3_rpfm_cli_path || "")
            setTw3SteamLibraryDrive(data.tw3_steam_library_drive || "")
            setOriginalTw3SteamLibraryDrive(data.tw3_steam_library_drive || "")
            setSteamcmdPath(data.steamcmd_path || "")
            setOriginalSteamcmdPath(data.steamcmd_path || "")
            setSteamUsername(data.steam_username || "")
            setOriginalSteamUsername(data.steam_username || "")
            setClaudeModel(data.claude_model || "claude-sonnet-5")
            setOriginalClaudeModel(data.claude_model || "claude-sonnet-5")
            setOpenaiModel(data.openai_model || "gpt-4.1")
            setOriginalOpenaiModel(data.openai_model || "gpt-4.1")
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

    if (loading) return <LoadingState message="Loading settings..." />
    if (loadError) {
        return (
            <ErrorState
                title="Could not load settings"
                message={`${loadError}. Nothing has been changed. Check that the backend is running, then retry.`}
                action={{ label: "Retry", onClick: retryLoad }}
            />
        )
    }

    return (
        <div className="settings-view">
            <PageHeader title="Settings" meta={<p>API Keys and Provider Configuration</p>} />

            {/* System Prompt Preview */}
            <Panel className="settings-panel" title="System Prompt Preview" help="View the system prompt sent to the translation provider. Uses the base glossary and current provider settings.">
                <div className="settings-inline-row">
                    <label className="field-label" htmlFor={`${fieldId}-prompt-lang`}>
                        Source Language
                    </label>
                    <select id={`${fieldId}-prompt-lang`} value={promptSourceLang} onChange={(e) => setPromptSourceLang(e.target.value)} className="select select-auto">
                        <option value="Chinese">Chinese</option>
                        <option value="Korean">Korean</option>
                        <option value="Japanese">Japanese</option>
                    </select>
                    <button
                        className="btn btn-outline"
                        onClick={async () => {
                            setPromptLoading(true)
                            try {
                                const res = await gameApi("chrono_ark").get(`/translate/system-prompt?source_lang=${encodeURIComponent(promptSourceLang)}`)
                                const data = await res.json()
                                setSystemPrompt(data.system_prompt || "")
                            } catch (err) {
                                console.error("Failed to fetch system prompt:", err)
                                setSystemPrompt("Error fetching system prompt.")
                            } finally {
                                setPromptLoading(false)
                            }
                        }}
                        disabled={promptLoading}
                    >
                        {promptLoading ? "Loading..." : "Load Prompt"}
                    </button>
                </div>
                {systemPrompt && (
                    <pre
                        style={{
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid var(--glass-border)",
                            borderRadius: "8px",
                            padding: "1rem",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: "0.85rem",
                            color: "var(--text-main)",
                            maxHeight: "500px",
                            overflow: "auto",
                        }}
                    >
                        {systemPrompt}
                    </pre>
                )}
            </Panel>

            {/* Provider Selection */}
            <Panel className="settings-panel" title="Translation Provider">
                <div className="provider-cards">
                    {PROVIDERS.map((p) => (
                        <div key={p.id} className={`provider-card ${provider === p.id ? "active" : ""}`} onClick={() => setProvider(p.id)}>
                            <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: "0.25rem" }}>{p.label}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{p.description}</div>
                        </div>
                    ))}
                </div>
            </Panel>

            {/* Model Selection for Claude / OpenAI */}
            {(provider === "claude" || provider === "openai") && (
                <Panel className="settings-panel" title="Model">
                    <select
                        value={provider === "claude" ? claudeModel : openaiModel}
                        onChange={(e) => (provider === "claude" ? setClaudeModel(e.target.value) : setOpenaiModel(e.target.value))}
                        aria-label="Model"
                        className="select"
                    >
                        {(provider === "claude" ? claudeModels : openaiModels).map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.label} — ${m.input_per_mtok} / ${m.output_per_mtok} per MTok (in/out)
                            </option>
                        ))}
                    </select>
                </Panel>
            )}

            {/* Manual Provider Info */}
            {provider === "manual" && (
                <Panel className="settings-panel" title="Manual Translation Mode">
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
                </Panel>
            )}

            {/* Ollama Configuration */}
            {provider === "ollama" && (
                <Panel className="settings-panel" title="Ollama Configuration">
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
                            <div className="settings-advanced">
                                <Field label="Ollama URL" htmlFor={`${fieldId}-ollama-url`}>
                                    <input
                                        id={`${fieldId}-ollama-url`}
                                        type="text"
                                        className="input input-medium"
                                        value={ollamaBaseUrl}
                                        onChange={(e) => setOllamaBaseUrl(e.target.value)}
                                        placeholder="http://localhost:11434"
                                    />
                                </Field>
                                <Field label="Model (override)" htmlFor={`${fieldId}-ollama-override`}>
                                    <p className="field-help">Use an installed model instead of the recommended one above.</p>
                                    {(() => {
                                        const overrideModels = ollamaModels.filter((m) => !VRAM_TIERS.some((t) => t.model === m))
                                        return overrideModels.length > 0 ? (
                                            <select
                                                id={`${fieldId}-ollama-override`}
                                                value={isModelOverride ? ollamaModel : ""}
                                                className="select input-medium"
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
                                            >
                                                <option value="">None (use recommended)</option>
                                                {overrideModels.map((m) => (
                                                    <option key={m} value={m}>
                                                        {m}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="note">{ollamaStatus === "running" ? "No other models installed" : "Ollama not running"}</span>
                                        )
                                    })()}
                                </Field>
                            </div>
                        )}
                    </div>
                </Panel>
            )}

            {/* llama.cpp Configuration */}
            {provider === "llamacpp" && (
                <Panel className="settings-panel" title="llama.cpp Configuration">
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
                            <div className="settings-advanced">
                                <Field label="Model Path (override)" htmlFor={`${fieldId}-llamacpp-model-path`}>
                                    <p className="field-help">Auto-filled when you download a model. Override to use a different GGUF file.</p>
                                    <input
                                        id={`${fieldId}-llamacpp-model-path`}
                                        type="text"
                                        className="input input-wide"
                                        value={llamacppModelPath}
                                        onChange={(e) => setLlamacppModelPath(e.target.value)}
                                        placeholder="Auto-filled on download"
                                    />
                                </Field>
                                <div className="settings-field-row">
                                    <Field label="GPU Layers" htmlFor={`${fieldId}-llamacpp-gpu-layers`}>
                                        <p className="field-help">-1 = offload all layers to GPU</p>
                                        <input
                                            id={`${fieldId}-llamacpp-gpu-layers`}
                                            type="number"
                                            className="input input-number"
                                            value={llamacppGpuLayers}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10)
                                                if (!isNaN(val)) setLlamacppGpuLayers(val)
                                            }}
                                        />
                                    </Field>
                                    <Field label="Context Size" htmlFor={`${fieldId}-llamacpp-ctx-size`}>
                                        <p className="field-help">Tokens for prompt + response</p>
                                        <input
                                            id={`${fieldId}-llamacpp-ctx-size`}
                                            type="number"
                                            min={512}
                                            step={1024}
                                            className="input input-number"
                                            value={llamacppCtxSize}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10)
                                                if (!isNaN(val)) setLlamacppCtxSize(val)
                                            }}
                                        />
                                    </Field>
                                </div>
                                <Field label="Server URL" htmlFor={`${fieldId}-llamacpp-url`}>
                                    <input
                                        id={`${fieldId}-llamacpp-url`}
                                        type="text"
                                        className="input input-medium"
                                        value={llamacppBaseUrl}
                                        onChange={(e) => setLlamacppBaseUrl(e.target.value)}
                                        placeholder="http://localhost:8080"
                                    />
                                </Field>
                                <Field label="Binary Path" htmlFor={`${fieldId}-llamacpp-binary`}>
                                    <p className="field-help">Path to the llama-server binary. Default assumes it is on PATH.</p>
                                    <input
                                        id={`${fieldId}-llamacpp-binary`}
                                        type="text"
                                        className="input input-wide"
                                        value={llamacppBinaryPath}
                                        onChange={(e) => setLlamacppBinaryPath(e.target.value)}
                                        placeholder="llama-server"
                                    />
                                </Field>
                                <Field label="Display Name" htmlFor={`${fieldId}-llamacpp-display-name`}>
                                    <p className="field-help">Label shown in the UI during translation. Auto-filled from tier selection.</p>
                                    <input
                                        id={`${fieldId}-llamacpp-display-name`}
                                        type="text"
                                        className="input input-medium"
                                        value={llamacppModel}
                                        onChange={(e) => setLlamacppModel(e.target.value)}
                                        placeholder="e.g. Qwen2.5-14B-Instruct"
                                    />
                                </Field>
                            </div>
                        )}
                    </div>
                </Panel>
            )}

            {/* API Keys */}
            {provider !== "manual" && provider !== "ollama" && provider !== "llamacpp" && (
                <Panel className="settings-panel" title="API Keys">
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
                                    <label className="field-label" htmlFor={`${fieldId}-key-${field}`}>
                                        {p.label} API Key
                                    </label>
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
                                        id={`${fieldId}-key-${field}`}
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
                </Panel>
            )}

            {/* Batch Size */}
            <Panel className="settings-panel" title="Batch Size" help="Number of strings sent per API request. Larger batches are more cost-efficient but may hit token limits.">
                <input
                    type="number"
                    min={1}
                    max={500}
                    aria-label="Batch size"
                    className="input input-number"
                    value={batchSize}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        if (!isNaN(val)) setBatchSize(val)
                    }}
                />
            </Panel>

            {/* Ignored Mods */}
            <Panel
                className="settings-panel"
                title="Ignored Mods"
                help="Workshop mod IDs listed here will be hidden from the dashboard. Useful for system mods, English-only mods, or mods you don't need to translate."
            >
                <div className="settings-inline-row">
                    <input
                        type="text"
                        aria-label="Workshop mod ID"
                        className="input"
                        placeholder="Workshop mod ID"
                        value={newIgnoredMod}
                        onChange={(e) => setNewIgnoredMod(e.target.value.trim())}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && newIgnoredMod && !ignoredMods.includes(newIgnoredMod)) {
                                setIgnoredMods([...ignoredMods, newIgnoredMod])
                                setNewIgnoredMod("")
                            }
                        }}
                    />
                    <button
                        className="btn btn-primary"
                        disabled={!newIgnoredMod || ignoredMods.includes(newIgnoredMod)}
                        onClick={() => {
                            if (newIgnoredMod && !ignoredMods.includes(newIgnoredMod)) {
                                setIgnoredMods([...ignoredMods, newIgnoredMod])
                                setNewIgnoredMod("")
                            }
                        }}
                    >
                        Add
                    </button>
                </div>
                {ignoredMods.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {ignoredMods.map((id) => (
                            <span
                                key={id}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    padding: "0.35rem 0.6rem",
                                    borderRadius: "6px",
                                    background: "rgba(255, 255, 255, 0.08)",
                                    border: "1px solid var(--glass-border)",
                                    color: "var(--text-main)",
                                    fontSize: "0.85rem",
                                }}
                            >
                                {id}
                                <button
                                    onClick={() => setIgnoredMods(ignoredMods.filter((m) => m !== id))}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: "var(--text-dim)",
                                        cursor: "pointer",
                                        padding: "0",
                                        display: "flex",
                                        alignItems: "center",
                                        fontSize: "0.75rem",
                                    }}
                                    title="Remove"
                                >
                                    <FaTimes />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </Panel>

            {/* Total War: Warhammer III */}
            <Panel className="settings-panel" title="Total War: Warhammer III" help="Paths used by the helper_scripts script runner. Required before triggering rebuilds from the Runner page.">
                <div className="form-stack">
                    <Field label="helper_scripts directory" htmlFor={`${fieldId}-tw3-helper`}>
                        <input
                            id={`${fieldId}-tw3-helper`}
                            type="text"
                            className="input"
                            placeholder="C:\path\to\totalwar-modding\helper_scripts"
                            value={tw3HelperPath}
                            onChange={(e) => setTw3HelperPath(e.target.value)}
                        />
                    </Field>
                    <Field label="rpfm_cli.exe path (optional, defaults to helper_scripts/rpfm_cli.exe)" htmlFor={`${fieldId}-tw3-rpfm`}>
                        <input
                            id={`${fieldId}-tw3-rpfm`}
                            type="text"
                            className="input"
                            placeholder="leave blank to use default"
                            value={tw3RpfmCliPath}
                            onChange={(e) => setTw3RpfmCliPath(e.target.value)}
                        />
                    </Field>
                    <Field label="Steam library drive (e.g., F:)" htmlFor={`${fieldId}-tw3-drive`}>
                        <input id={`${fieldId}-tw3-drive`} type="text" className="input" placeholder="F:" value={tw3SteamLibraryDrive} onChange={(e) => setTw3SteamLibraryDrive(e.target.value)} />
                    </Field>
                </div>
            </Panel>

            {/* Steam Account (Publish to Workshop) */}
            <Panel
                className="settings-panel"
                title="Steam Account"
                help={
                    <>
                        Used by the Publish to Workshop button on the TW3 Dashboard. After saving, run <code>steamcmd +login &lt;username&gt;</code> once in a terminal to complete Steam Guard
                        authentication. SteamCMD will cache the session for ~2 weeks.
                    </>
                }
            >
                <div className="field-label-row">
                    <label className="field-label" htmlFor={`${fieldId}-steamcmd`}>
                        SteamCMD path (steamcmd.exe)
                    </label>
                    <button
                        className="btn btn-outline"
                        onClick={async () => {
                            setSteamcmdInstalling(true)
                            setSteamcmdInstallError(null)
                            try {
                                const res = await fetch(`${API_BASE}/steamcmd/install`, { method: "POST" })
                                const data = await res.json()
                                if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
                                setSteamcmdPath(data.path)
                                setOriginalSteamcmdPath(data.path)
                            } catch (err) {
                                setSteamcmdInstallError(err instanceof Error ? err.message : String(err))
                            } finally {
                                setSteamcmdInstalling(false)
                            }
                        }}
                        disabled={steamcmdInstalling}
                        style={{ fontSize: "0.85rem", padding: "0.25rem 0.75rem" }}
                        title="Download and extract steamcmd.zip into backend storage, then auto-fill the path below."
                    >
                        {steamcmdInstalling ? "Installing..." : "Install SteamCMD"}
                    </button>
                </div>
                {steamcmdInstallError && (
                    <div
                        style={{
                            padding: "0.5rem 0.75rem",
                            marginBottom: "0.5rem",
                            background: "rgba(239,68,68,0.15)",
                            color: "#ff8a8a",
                            border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: 6,
                            fontSize: "0.85rem",
                        }}
                    >
                        Install failed: {steamcmdInstallError}
                    </div>
                )}
                <input
                    id={`${fieldId}-steamcmd`}
                    type="text"
                    className="input settings-field-gap"
                    placeholder="C:\\steamcmd\\steamcmd.exe"
                    value={steamcmdPath}
                    onChange={(e) => setSteamcmdPath(e.target.value)}
                />

                <Field label="Steam username" htmlFor={`${fieldId}-steam-username`}>
                    <input
                        id={`${fieldId}-steam-username`}
                        type="text"
                        className="input"
                        placeholder="your_steam_username"
                        value={steamUsername}
                        onChange={(e) => setSteamUsername(e.target.value)}
                        autoComplete="off"
                    />
                </Field>
            </Panel>

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
