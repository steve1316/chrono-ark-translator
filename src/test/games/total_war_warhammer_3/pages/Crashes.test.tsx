import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import CrashesPage from "../../../../games/total_war_warhammer_3/pages/Crashes"

afterEach(() => vi.restoreAllMocks())

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

const SAMPLE = {
    id: "2026-05-09-203045",
    captured_at: "2026-05-09T20:30:45+00:00",
    trigger: "watcher",
    source: "x",
    files: {
        crash_report: { present: true, file_count: 12, total_bytes: 4_404_019 },
        logs: { present: true, file_count: 8, total_bytes: 1_153_433 },
        "preferences.script.txt": { present: true, total_bytes: 2048 },
    },
    notes: "",
}

describe("Crashes page", () => {
    it("renders fetched snapshots", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ snapshots: [SAMPLE] }), { status: 200 }))
        render(wrap(<CrashesPage />))
        await waitFor(() => expect(screen.getByText("2026-05-09-203045")).toBeInTheDocument())
    })

    it("renders empty state when no snapshots", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ snapshots: [] }), { status: 200 }))
        render(wrap(<CrashesPage />))
        await waitFor(() => expect(screen.getByText(/No crashes recorded yet/i)).toBeInTheDocument())
    })

    it("shows RegistryErrorBanner on 503", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Crash watcher unavailable" }), { status: 503 }))
        render(wrap(<CrashesPage />))
        await waitFor(() => expect(screen.getByText(/Helper scripts not configured/i)).toBeInTheDocument())
    })
})
