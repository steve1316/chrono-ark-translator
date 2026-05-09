import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import EffectsPage from "../../../../games/total_war_warhammer_3/pages/Effects"

afterEach(() => vi.restoreAllMocks())

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

describe("Effects page", () => {
    it("renders nested categories", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ effects: { infantry: { empire: ["bundle_a"] }, cavalry: { empire: ["bundle_c"] } } }), { status: 200 }))
        render(wrap(<EffectsPage />))
        await waitFor(() => expect(screen.getByText("infantry")).toBeInTheDocument())
        expect(screen.getByText("cavalry")).toBeInTheDocument()
        expect(screen.getByText(/bundle_a/)).toBeInTheDocument()
    })

    it("shows RegistryErrorBanner on 503", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "helper_scripts_path not configured" }), { status: 503 }))
        render(wrap(<EffectsPage />))
        await waitFor(() => expect(screen.getByText(/Helper scripts not configured/i)).toBeInTheDocument())
    })
})
