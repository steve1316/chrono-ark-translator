import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"

import EditableCell from "../../../../components/EditableCell"
import type { WH3DriftRow, WH3DriftStatus, WH3ModContext, WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"
import { fetchModContext, fetchStrings, listTranslationMods, rescanMod, saveModContext, saveString, translateBatch } from "../../translationApi"

const STATUS_FILTERS: Array<WH3DriftStatus | "all"> = ["all", "untranslated", "stale", "translated", "orphan"]
const BATCH_LIMIT = 50

/**
 * Per-mod translation review page. Shows the drift table, status filter,
 * rescan / translate-batch toolbar, and a mod-context editor.
 *
 * @returns The rendered page.
 */
const TranslationDetailsPage: React.FC = () => {
    const { workshopId = "" } = useParams<{ workshopId: string }>()

    const [mod, setMod] = useState<WH3TranslationModSummary | null>(null)
    const [progress, setProgress] = useState<WH3RescanSummary | null>(null)
    const [strings, setStrings] = useState<WH3DriftRow[]>([])
    const [filter, setFilter] = useState<WH3DriftStatus | "all">("all")
    const [ctx, setCtx] = useState<WH3ModContext>({ source_game: "", character_name: "", background: "" })
    const [loading, setLoading] = useState(true)
    const [statusText, setStatusText] = useState<string>("")
    const [translating, setTranslating] = useState(false)

    const skipInitialFilterEffect = useRef(true)

    const loadStrings = useCallback(
        async (status: WH3DriftStatus | "all") => {
            if (!workshopId) return
            const rows = await fetchStrings(workshopId, status === "all" ? undefined : status)
            setStrings(rows)
        },
        [workshopId]
    )

    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const [allMods, summary, modCtx] = await Promise.all([listTranslationMods(), rescanMod(workshopId), fetchModContext(workshopId)])
                if (cancelled) return
                setMod(allMods.find((m) => m.workshop_id === workshopId) ?? null)
                setProgress(summary)
                setCtx(modCtx)
                await loadStrings("all")
            } catch (e) {
                setStatusText(`Failed to load: ${(e as Error).message}`)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [workshopId, loadStrings])

    useEffect(() => {
        if (skipInitialFilterEffect.current) {
            skipInitialFilterEffect.current = false
            return
        }
        loadStrings(filter)
    }, [filter, loadStrings])

    const onRowSave = useCallback(
        async (key: string, text: string) => {
            try {
                await saveString(workshopId, key, text)
                setStrings((prev) => prev.map((r) => (r.key === key ? { ...r, translation_text: text } : r)))
                setStatusText(`Saved ${key}`)
            } catch (e) {
                setStatusText(`Save failed: ${(e as Error).message}`)
            }
        },
        [workshopId]
    )

    const onRescan = useCallback(async () => {
        setStatusText("Rescanning...")
        try {
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings(filter)
            setStatusText("Rescan complete")
        } catch (e) {
            setStatusText(`Rescan failed: ${(e as Error).message}`)
        }
    }, [workshopId, filter, loadStrings])

    const runTranslateBatch = useCallback(
        async (targetStatus: "untranslated" | "stale") => {
            setTranslating(true)
            setStatusText("Loading candidates...")
            try {
                const targetRows = await fetchStrings(workshopId, targetStatus)
                const candidates = targetRows.map((r) => r.key)
                if (candidates.length === 0) {
                    setStatusText("No rows match the target status")
                    return
                }
                if (candidates.length > BATCH_LIMIT) {
                    const ok = window.confirm(`${candidates.length} rows match. Translating in batches of ${BATCH_LIMIT} may take a while and cost API credits. Continue?`)
                    if (!ok) {
                        setStatusText("")
                        return
                    }
                }
                setStatusText(`Translating ${candidates.length} rows...`)
                for (let i = 0; i < candidates.length; i += BATCH_LIMIT) {
                    const batch = candidates.slice(i, i + BATCH_LIMIT)
                    await translateBatch(workshopId, batch)
                }
                const summary = await rescanMod(workshopId)
                setProgress(summary)
                await loadStrings(filter)
                setStatusText(`Translated ${candidates.length} rows`)
            } catch (e) {
                setStatusText(`Translate failed: ${(e as Error).message}`)
            } finally {
                setTranslating(false)
            }
        },
        [workshopId, filter, loadStrings]
    )

    const onSaveContext = useCallback(async () => {
        setStatusText("Saving context...")
        try {
            await saveModContext(workshopId, ctx)
            setStatusText("Context saved")
        } catch (e) {
            setStatusText(`Context save failed: ${(e as Error).message}`)
        }
    }, [workshopId, ctx])

    const untranslatedCount = progress?.counts.untranslated ?? 0
    const staleCount = progress?.counts.stale ?? 0
    const total = useMemo(() => (progress ? progress.counts.translated + progress.counts.untranslated + progress.counts.stale : 0), [progress])
    const done = useMemo(() => (progress ? progress.counts.translated + progress.counts.stale : 0), [progress])
    const percent = total > 0 ? Math.round((done / total) * 100) : 0

    if (loading) return <p>Loading...</p>

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <Link to="/dashboard" className="translation-parent-link">
                        &lt;- Back to Dashboard
                    </Link>
                    <h1>{mod?.display_name ?? workshopId}</h1>
                    <p>
                        <span className="translation-lang-pill">
                            {mod?.source_language ?? "?"} -&gt; {mod?.target_language ?? "?"}
                        </span>{" "}
                        {mod?.parent_workshop_ids.map((p) => (
                            <a
                                key={p}
                                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${p}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="translation-parent-link"
                                aria-label={`parent mod ${p}`}
                                style={{ marginRight: "0.5rem" }}
                            >
                                Parent {p}
                            </a>
                        ))}
                    </p>
                </div>
            </div>

            <div className="glass-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <div className="translation-progress">
                    <div className="translation-progress-bar" aria-label={`${done} of ${total} strings translated`}>
                        <div className="translation-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="translation-progress-label">
                        {done} / {total} strings ({percent}%)
                        {staleCount > 0 && <span className="translation-stale-count"> - {staleCount} stale</span>}
                    </div>
                </div>
            </div>

            <div className="translation-toolbar">
                <div className="translation-filter-pills">
                    {STATUS_FILTERS.map((s) => (
                        <button key={s} type="button" className={`translation-filter-pill${filter === s ? " active" : ""}`} onClick={() => setFilter(s)}>
                            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="btn btn-outline" onClick={onRescan}>
                        Rescan
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => runTranslateBatch("untranslated")} disabled={translating || untranslatedCount === 0}>
                        Translate untranslated
                    </button>
                    <button type="button" className="btn btn-warning" onClick={() => runTranslateBatch("stale")} disabled={translating || staleCount === 0}>
                        Translate stale
                    </button>
                </div>
            </div>

            {statusText && <p style={{ color: "var(--text-dim)", margin: "0.5rem 0" }}>{statusText}</p>}

            <div className="glass-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="translation-table">
                    <thead>
                        <tr>
                            <th>File</th>
                            <th>Key</th>
                            <th>Source</th>
                            <th>Translation</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {strings.map((row) => (
                            <tr key={`${row.source_filename}::${row.key}`}>
                                <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{row.source_filename}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{row.key}</td>
                                <td>{row.parent_text ?? <em style={{ color: "var(--text-dim)" }}>orphan</em>}</td>
                                <td>
                                    <EditableCell value={row.translation_text ?? ""} onSave={(text) => onRowSave(row.key, text)} placeholder="(untranslated)" />
                                </td>
                                <td>
                                    <span className={`translation-status-pill ${row.status}`}>{row.status}</span>
                                </td>
                            </tr>
                        ))}
                        {strings.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-dim)", padding: "2rem" }}>
                                    No rows match the current filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="glass-card mod-context-panel">
                <h3 style={{ marginTop: 0 }}>Mod context (injected into LLM prompts)</h3>
                <label htmlFor="ctx-source-game">Source game</label>
                <textarea id="ctx-source-game" rows={1} value={ctx.source_game} onChange={(e) => setCtx({ ...ctx, source_game: e.target.value })} />
                <label htmlFor="ctx-character-name">Character name</label>
                <textarea id="ctx-character-name" rows={1} value={ctx.character_name} onChange={(e) => setCtx({ ...ctx, character_name: e.target.value })} />
                <label htmlFor="ctx-background">Background / lore</label>
                <textarea id="ctx-background" rows={6} value={ctx.background} onChange={(e) => setCtx({ ...ctx, background: e.target.value })} />
                <button type="button" className="btn btn-primary" onClick={onSaveContext}>
                    Save context
                </button>
            </div>
        </>
    )
}

export default TranslationDetailsPage
