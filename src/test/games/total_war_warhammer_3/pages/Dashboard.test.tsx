import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import DashboardPage from "../../../../games/total_war_warhammer_3/pages/Dashboard"

afterEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
})

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

describe("Dashboard page", () => {
    it("renders 6 pack cards", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        render(wrap(<DashboardPage />))
        await waitFor(() => expect(screen.getAllByRole("button", { name: /rebuild/i }).length).toBeGreaterThanOrEqual(6))
    })

    it("opens the PublishAllDialog when the Publish All button is clicked", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        const { default: userEvent } = await import("@testing-library/user-event")
        const user = userEvent.setup()
        render(wrap(<DashboardPage />))
        await user.click(screen.getByRole("button", { name: /^publish all$/i }))
        expect(screen.getByRole("heading", { name: /publish all to workshop/i })).toBeInTheDocument()
    })

    it("disables rebuild buttons when a run is already in progress", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: "running",
                    run_id: "abc",
                    script_id: "update_dynamic_rors",
                    started_at: new Date().toISOString(),
                    lines_emitted: 10,
                }),
                { status: 200 }
            )
        )
        render(wrap(<DashboardPage />))
        await waitFor(() => expect(screen.getAllByRole("button", { name: /run in progress/i }).length).toBeGreaterThanOrEqual(1))
    })
})
