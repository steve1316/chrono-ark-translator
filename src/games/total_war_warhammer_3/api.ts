import { gameApi } from "../../api/games"

const api = gameApi("total_war_warhammer_3")

export interface SupportedMod {
    /** Display name of the mod. */
    name: string
    /** Package name used to identify the mod file. */
    package_name: string
    /** Filesystem path to the mod. */
    path: string
    /** Optional list of attributes this mod modifies. */
    modified_attributes?: string[]
    /** Steam Workshop item id derived from `path`. Null when the path does not follow the TW3 workshop convention. */
    workshop_id?: string | null
    /** Maps glob patterns to faction codes, overriding the default faction detection. */
    pattern_overrides?: Record<string, string>
    /** Maps lord/hero `key` values to allowed lord and hero lists, overriding the default character set. */
    character_overrides?: Record<string, { allowed_lords?: unknown[]; allowed_heroes?: unknown[] }>
    /** When true, the mod is excluded from the auto-generation pass entirely. */
    ignore_generation?: boolean
    [key: string]: unknown
}

/** Represents a run that is currently active. */
export interface RunStateRunning {
    /** Discriminant. */
    status: "running"
    /** Unique ID for this run. */
    run_id: string
    /** Script that was invoked. */
    script_id: string
    /** ISO timestamp of when the run started. */
    started_at: string
    /** Number of log lines emitted so far. */
    lines_emitted: number
}

/** Represents the state when no run is active. */
export interface RunStateIdle {
    /** Discriminant. */
    status: "idle"
}

export type RunState = RunStateRunning | RunStateIdle

export interface ValidationIssue {
    /** Discriminator for the broken-reference category. */
    kind: "missing_effect_category" | "missing_mod_path"
    /** Severity tier. Currently always `"error"`. */
    severity: "error"
    /** Stable identity of the offending mod. */
    mod_package_name: string
    /** Display name of the offending mod. */
    mod_name: string
    /** The orphaned reference itself (missing category name or missing path string). */
    target: string
    /** Human-readable description suitable for direct display. */
    message: string
}

/**
 * Fetch the validation report from the TW3 backend.
 *
 * @returns Array of issues. Empty when all references resolve.
 * @throws `RegistryError` On 5xx (typically helper_scripts misconfigured).
 */
export async function fetchValidation(): Promise<ValidationIssue[]> {
    const res = await api.get("/validation")
    if (!res.ok) throw await registryError(res)
    const body = await res.json()
    return body.issues as ValidationIssue[]
}

export interface StaleMod {
    /** Stable identity of the mod. */
    package_name: string
    /** Display name of the mod. */
    mod_name: string
    /** Filesystem path of the `.pack` file. */
    path: string
    /** Current mtime of the pack file (Unix epoch seconds). */
    current_mtime: number
    /** Stored baseline mtime from the last sync. */
    baseline_mtime: number
    /** `current_mtime - baseline_mtime`, in seconds. */
    delta_seconds: number
}

export interface UpdateReport {
    /** Mods whose pack mtime is newer than the baseline. Sorted by `delta_seconds` descending. */
    stale: StaleMod[]
    /** False on the very first run before the baseline file was created. */
    baseline_exists: boolean
    /** Absolute path of the baseline file on disk (debug only). */
    baseline_path: string
    /** Count of mods in `SUPPORTED_MODS`. */
    total_known: number
}

/**
 * Fetch the mod update report from the TW3 backend.
 *
 * @returns Report shape with `stale`, `baseline_exists`, `baseline_path`, `total_known`.
 * @throws `RegistryError` On 5xx (typically helper_scripts misconfigured).
 */
export async function fetchUpdates(): Promise<UpdateReport> {
    const res = await api.get("/updates")
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Capture current mtimes as the new baseline.
 *
 * @returns `{synced_at, count, baseline_path}` on success.
 * @throws `RegistryError` On 5xx.
 */
export async function syncUpdates(): Promise<{ synced_at: string; count: number; baseline_path: string }> {
    const res = await api.post("/updates/sync")
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Fetch the read-only `SUPPORTED_MODS` registry from the TW3 backend.
 *
 * @returns Array of mod entries (whatever shape the source `supported_mods.py` declares).
 * @throws `RegistryError` When the backend returns 5xx (typically because `helper_scripts_path`
 *     is unset or the source file is missing).
 */
export async function fetchSupportedMods(): Promise<SupportedMod[]> {
    const res = await api.get("/supported-mods")
    if (!res.ok) throw await registryError(res)
    const body = await res.json()
    return body.mods as SupportedMod[]
}

/**
 * Start a script run on the backend.
 *
 * @param scriptId Key into the backend `SCRIPT_REGISTRY`.
 * @returns Run handle metadata: `run_id`, `script_id`, `started_at`.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function startRun(scriptId: string): Promise<{ run_id: string; script_id: string; started_at: string }> {
    const res = await api.post(`/run/${scriptId}`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Poll the backend for the current run state.
 *
 * @returns `{status: "idle"}` or full running-state payload.
 * @throws `Error` When the request fails for an unexpected reason.
 */
export async function getCurrentRun(): Promise<RunState> {
    const res = await api.get("/run")
    if (!res.ok) throw new Error(`getCurrentRun failed: ${res.status}`)
    return res.json()
}

/**
 * Cancel the active run, if any. Idempotent at the API surface (404 swallowed).
 */
export async function cancelRun(): Promise<void> {
    const res = await fetch(api.url("/run"), { method: "DELETE" })
    if (!res.ok && res.status !== 404) {
        throw new Error(`cancelRun failed: ${res.status}`)
    }
}

/**
 * Build the SSE stream URL for the runner log.
 *
 * @returns Absolute URL the frontend can pass to `new EventSource(...)`.
 */
export function runStreamUrl(): string {
    return api.url("/run/stream")
}

/** Handle returned by `publishPack` describing the spawned SteamCMD subprocess. */
export interface PublishHandle {
    /** Unique identifier for this publish run, generated server-side. */
    publish_id: string
    /** Steam Workshop item id being updated. */
    workshop_id: string
    /** ISO timestamp of when SteamCMD was spawned. */
    started_at: string
}

/**
 * Spawn SteamCMD on the backend to push the local workshop folder as an update to an existing Workshop item.
 *
 * @param workshopId Numeric Steam Workshop item id of the existing entry to update.
 * @param changenote Update note shown in the Workshop changelog. Empty string omits the field from the VDF.
 * @returns Handle describing the started publish run.
 * @throws `RegistryError` On any non-2xx response. `missing` is populated when preflight fails (HTTP 400 with `{missing: [...]}`).
 */
export async function publishPack(workshopId: string, changenote: string): Promise<PublishHandle> {
    const res = await api.post(`/packs/${encodeURIComponent(workshopId)}/publish`, { changenote })
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Build the SSE stream URL for an in-flight publish.
 *
 * @param workshopId Numeric Steam Workshop item id whose publish to follow.
 * @returns Absolute URL the frontend can pass to `new EventSource(...)`.
 */
export function publishStreamUrl(workshopId: string): string {
    return api.url(`/packs/${encodeURIComponent(workshopId)}/publish/stream`)
}

/** Surfaces backend registry/runner errors with status, detail, and optional missing-list. */
export class RegistryError extends Error {
    /** HTTP status code returned by the backend. */
    status: number
    /** Human-readable error detail from the response body. */
    detail: string
    /** List of missing items reported by the backend, if any. */
    missing: string[] | null

    constructor(status: number, detail: string, missing: string[] | null) {
        super(detail)
        this.status = status
        this.detail = detail
        this.missing = missing
    }
}

/**
 * Create a new SUPPORTED_MODS entry.
 *
 * @param entry Full entry payload including `name`, `package_name`, optional `workshop_id` / `path`, `modified_attributes`, optional `pattern_overrides`, `character_overrides`, `ignore_generation`.
 * @returns The freshly reloaded `SupportedMod[]` list.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function createSupportedMod(entry: Record<string, unknown>): Promise<SupportedMod[]> {
    const res = await api.post("/supported-mods", { entry })
    if (!res.ok) throw await registryError(res)
    const body = await res.json()
    return body.mods as SupportedMod[]
}

/**
 * Replace an existing SUPPORTED_MODS entry by its `package_name`.
 *
 * @param packageName Stable identifier of the entry to replace.
 * @param entry Replacement entry payload (same shape as create).
 * @returns The freshly reloaded list.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function updateSupportedMod(packageName: string, entry: Record<string, unknown>): Promise<SupportedMod[]> {
    const res = await api.put(`/supported-mods/${encodeURIComponent(packageName)}`, { entry })
    if (!res.ok) throw await registryError(res)
    const body = await res.json()
    return body.mods as SupportedMod[]
}

/**
 * Remove a SUPPORTED_MODS entry by its `package_name`.
 *
 * @param packageName Stable identifier of the entry to remove.
 * @returns The freshly reloaded list.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function deleteSupportedMod(packageName: string): Promise<SupportedMod[]> {
    const res = await api.delete(`/supported-mods/${encodeURIComponent(packageName)}`)
    if (!res.ok) throw await registryError(res)
    const body = await res.json()
    return body.mods as SupportedMod[]
}

/**
 * Fetch the top-level SUPPORTED_EFFECTS category names for the Modified Attributes autocomplete.
 *
 * @returns Sorted list of category names.
 */
export async function fetchSupportedEffectsCategories(): Promise<string[]> {
    const res = await api.get("/supported-effects")
    if (!res.ok) return []
    const body = await res.json()
    return (body.categories ?? []) as string[]
}

async function registryError(res: Response): Promise<RegistryError> {
    let detail = res.statusText
    let missing: string[] | null = null
    try {
        const body = await res.json()
        if (typeof body.detail === "string") detail = body.detail
        else if (body.detail && Array.isArray(body.detail.missing)) missing = body.detail.missing
    } catch {
        /* ignore */
    }
    return new RegistryError(res.status, detail, missing)
}
