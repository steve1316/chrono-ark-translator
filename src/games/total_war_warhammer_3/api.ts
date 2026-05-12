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

/** Shape of a single crash snapshot manifest returned by the backend. */
export interface CrashSnapshot {
    /** Unique folder name used as the snapshot id. */
    id: string
    /** ISO timestamp of when the snapshot was captured. */
    captured_at: string
    /** How the snapshot was triggered. */
    trigger: "watcher" | "manual"
    /** Source description (e.g. watcher path or "manual"). */
    source: string
    /** Per-artifact file presence and size metadata. */
    files: {
        /** Crash report artifact summary. */
        crash_report: { present: boolean; file_count: number; total_bytes: number }
        /** Log artifact summary. */
        logs: { present: boolean; file_count: number; total_bytes: number }
        /** Script preferences artifact summary. */
        "preferences.script.txt": { present: boolean; total_bytes: number }
    }
    /** User-supplied notes attached to the snapshot. */
    notes: string
}

/**
 * List all crash snapshots, newest first.
 *
 * @returns Array of `CrashSnapshot` manifests.
 * @throws `RegistryError` On 5xx responses.
 */
export async function fetchCrashes(): Promise<CrashSnapshot[]> {
    const res = await api.get("/crashes")
    if (!res.ok) throw await registryError(res)
    const body = await res.json()
    return body.snapshots as CrashSnapshot[]
}

/**
 * Trigger a manual capture.
 *
 * @returns The new snapshot manifest.
 * @throws `RegistryError` On 5xx responses.
 */
export async function captureCrash(): Promise<CrashSnapshot> {
    const res = await api.post("/crashes/capture")
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Update the notes field of a snapshot.
 *
 * @param id Snapshot id (folder name).
 * @param notes New notes text.
 * @returns Updated manifest.
 * @throws `RegistryError` On non-2xx responses.
 */
export async function updateCrashNotes(id: string, notes: string): Promise<CrashSnapshot> {
    const res = await fetch(api.url(`/crashes/${id}/notes`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
    })
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Delete a snapshot.
 *
 * @param id Snapshot id (folder name).
 * @throws `RegistryError` On non-2xx responses other than 404.
 */
export async function deleteCrash(id: string): Promise<void> {
    const res = await fetch(api.url(`/crashes/${id}`), { method: "DELETE" })
    if (!res.ok && res.status !== 404) throw await registryError(res)
}

/**
 * Open the snapshot folder in Windows Explorer.
 *
 * @param id Snapshot id (folder name).
 * @throws `RegistryError` On 4xx/5xx responses.
 */
export async function revealCrashFolder(id: string): Promise<void> {
    const res = await api.post(`/crashes/${id}/reveal`)
    if (!res.ok) throw await registryError(res)
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
