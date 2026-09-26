import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import DashboardPage from "../../../../games/total_war_warhammer_3/pages/Dashboard"

afterEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
})

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const MOD_A = {
    workshop_id: "3392058226",
    display_name: "Whc's Cathay translation",
    parent_workshop_ids: ["3380000000"],
    local_source_dir: "",
    source_language: "Chinese",
    target_language: "English",
    preview_image_url: null,
}
const MOD_B = { ...MOD_A, workshop_id: "3315737452", display_name: "Zerooz Cathy translation" }

/**
 * Answers the translation list with `list()`, returns an idle body for everything else, and leaves rescans unanswered.
 *
 * @param list Produces the translation list response for each call.
 */
function mockListOnly(list: () => Promise<Response>) {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = String(input)
        if (url.endsWith("/translation/mods")) return list()
        if (url.endsWith("/rescan")) return new Promise<Response>(() => {})
        return Promise.resolve(json({ status: "idle" }))
    })
}

describe("Dashboard page", () => {
    it("renders 6 pack cards", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        render(wrap(<DashboardPage />))
        await waitFor(() => expect(screen.getAllByRole("button", { name: /rebuild/i }).length).toBeGreaterThanOrEqual(6))
    })

    it("keeps a space between the bolded Rebuild and the word button in the about text", () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        render(wrap(<DashboardPage />))
        const about = screen.getByRole("heading", { name: /about the compat packs/i }).nextElementSibling
        expect(about?.textContent).toContain("The Rebuild button regenerates")
    })

    it("shows skeleton cards while the translation mods are loading", () => {
        vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            if (String(input).includes("/translation/mods")) return new Promise<Response>(() => {})
            return Promise.resolve(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        })
        render(wrap(<DashboardPage />))
        expect(screen.getByRole("status", { name: /loading translation mods/i })).toBeInTheDocument()
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

    it("filters pack and translation cards by name as the user types, and Clear brings them back", async () => {
        mockListOnly(() => Promise.resolve(json([MOD_A, MOD_B])))
        const user = userEvent.setup()
        render(wrap(<DashboardPage />))
        await screen.findByRole("heading", { name: "Whc's Cathay translation" })
        await user.type(screen.getByPlaceholderText("Search by name or workshop ID..."), "velocity")
        expect(screen.getByRole("heading", { name: "Double Projectile Velocity Compat" })).toBeInTheDocument()
        expect(screen.queryByRole("heading", { name: "2x Unit Size Compat" })).not.toBeInTheDocument()
        expect(screen.getByText('No translation mods match "velocity".')).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Clear search" }))
        expect(screen.getByRole("heading", { name: "2x Unit Size Compat" })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Zerooz Cathy translation" })).toBeInTheDocument()
    })

    it("finds a translation mod by workshop id and says no packs match", async () => {
        mockListOnly(() => Promise.resolve(json([MOD_A, MOD_B])))
        const user = userEvent.setup()
        render(wrap(<DashboardPage />))
        await screen.findByRole("heading", { name: "Whc's Cathay translation" })
        await user.type(screen.getByPlaceholderText("Search by name or workshop ID..."), "3392058226")
        expect(screen.getByText('No packs match "3392058226".')).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Whc's Cathay translation" })).toBeInTheDocument()
        expect(screen.queryByRole("heading", { name: "Zerooz Cathy translation" })).not.toBeInTheDocument()
    })

    it("says no translation mods were found when the list is empty", async () => {
        mockListOnly(() => Promise.resolve(json([])))
        render(wrap(<DashboardPage />))
        expect(await screen.findByText("No translation mods found.")).toBeInTheDocument()
    })

    it("shows the intro as a static panel with the standard-size header buttons", () => {
        mockListOnly(() => new Promise<Response>(() => {}))
        render(wrap(<DashboardPage />))
        const intro = screen.getByRole("heading", { name: /about the compat packs/i }).closest(".panel")
        expect(intro).toHaveClass("glass-card", "static")
        expect(screen.getByRole("button", { name: /^publish all$/i })).not.toHaveAttribute("style")
    })
})
