import { useCallback, useEffect, useState } from "react"
import { captureCrash, deleteCrash, fetchCrashes, RegistryError, updateCrashNotes, type CrashSnapshot } from "../../api"
import RegistryErrorBanner from "../../components/RegistryErrorBanner"
import CrashCard from "../../components/CrashCard"

const POLL_INTERVAL_MS = 5000

/**
 * TW3 Crashes page: lists past snapshots (newest first) with a Capture button
 * for manual snapshots. Polls `GET /crashes` every 5 seconds while mounted.
 *
 * @returns A page rendering `CrashCard` components, or a `RegistryErrorBanner`
 *     when the backend reports the watcher is disabled.
 */
export default function CrashesPage() {
    const [snapshots, setSnapshots] = useState<CrashSnapshot[] | null>(null)
    const [error, setError] = useState<RegistryError | null>(null)
    const [capturing, setCapturing] = useState(false)

    const refresh = useCallback(async () => {
        try {
            const next = await fetchCrashes()
            setSnapshots(next)
            setError(null)
        } catch (err: unknown) {
            if (err instanceof RegistryError) setError(err)
        }
    }, [])

    useEffect(() => {
        refresh()
        const id = window.setInterval(refresh, POLL_INTERVAL_MS)
        return () => window.clearInterval(id)
    }, [refresh])

    const handleCapture = async () => {
        setCapturing(true)
        try {
            await captureCrash()
            await refresh()
        } catch (err) {
            console.error("manual capture failed", err)
        } finally {
            setCapturing(false)
        }
    }

    const handleNotesUpdate = async (id: string, notes: string) => {
        await updateCrashNotes(id, notes)
        await refresh()
    }

    const handleDelete = async (id: string) => {
        await deleteCrash(id)
        await refresh()
    }

    if (error) {
        return (
            <>
                <div className="dashboard-header">
                    <div className="title-group">
                        <h1>Crashes</h1>
                    </div>
                </div>
                <RegistryErrorBanner detail={error.detail} missing={error.missing} />
            </>
        )
    }

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Crashes</h1>
                    <p>Snapshots of `crash_report/` and `logs/` taken automatically when TWW3 crashes.</p>
                </div>
                <button className="btn btn-outline" onClick={handleCapture} disabled={capturing}>
                    {capturing ? "Capturing..." : "Capture last crash"}
                </button>
            </div>
            {snapshots !== null && snapshots.length === 0 && (
                <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-dim)" }}>
                    No crashes recorded yet. The watcher is active when `helper_scripts_path` is configured in Settings.
                </div>
            )}
            {snapshots?.map((snap) => (
                <CrashCard key={snap.id} snap={snap} onUpdate={handleNotesUpdate} onDelete={handleDelete} />
            ))}
        </>
    )
}
