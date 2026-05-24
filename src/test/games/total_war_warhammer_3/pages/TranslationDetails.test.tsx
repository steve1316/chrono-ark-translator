import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TranslationDetailsPage from "../../../../games/total_war_warhammer_3/pages/TranslationDetails"

const MOD = {
    workshop_id: "3315737452",
    display_name: "Zerooz",
    parent_workshop_ids: ["2901237965"],
    local_source_dir: "x",
    source_language: "Chinese",
    target_language: "English",
}

const RESCAN = {
    mod_id: "3315737452",
    counts: { translated: 1, untranslated: 1, stale: 0, orphan: 0 },
    scanned_at: "2026-05-24T00:00:00Z",
}

const STRINGS = [
    { source_filename: "units.loc.tsv", key: "k1", parent_text: "yuan1", translation_text: "Trans 1", status: "translated" as const },
    { source_filename: "units.loc.tsv", key: "k2", parent_text: "yuan2", translation_text: null, status: "untranslated" as const },
]

const MOD_CONTEXT = { source_game: "WH3", character_name: "Zerooz", background: "Cathay units." }

function renderPage(ui = <TranslationDetailsPage />) {
    return render(
        <MemoryRouter initialEntries={["/translation-mods/3315737452"]}>
            <Routes>
                <Route path="/translation-mods/:workshopId" element={ui} />
            </Routes>
        </MemoryRouter>
    )
}

function setupFetchMock(overrides: Record<string, unknown> = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input == null ? "" : typeof input === "string" ? input : input.toString()
        const method = init?.method ?? "GET"
        if (method === "GET" && url.endsWith("/translation/mods")) {
            return new Response(JSON.stringify(overrides.mods ?? [MOD]), { status: 200 })
        }
        if (method === "POST" && url.includes("/rescan")) {
            return new Response(JSON.stringify(overrides.rescan ?? RESCAN), { status: 200 })
        }
        if (method === "GET" && url.includes("/mod-context")) {
            return new Response(JSON.stringify(overrides.modContext ?? MOD_CONTEXT), { status: 200 })
        }
        if (method === "PUT" && url.includes("/mod-context")) {
            return new Response(JSON.stringify({ status: "ok" }), { status: 200 })
        }
        if (method === "GET" && url.includes("/strings")) {
            return new Response(JSON.stringify(overrides.strings ?? STRINGS), { status: 200 })
        }
        if (method === "PUT" && url.includes("/strings/")) {
            return new Response(JSON.stringify({ status: "ok" }), { status: 200 })
        }
        if (method === "POST" && url.includes("/translate")) {
            return new Response(JSON.stringify({ translated: 1, suggested_terms: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 200 })
    })
}

beforeEach(() => setupFetchMock())
afterEach(() => vi.restoreAllMocks())

describe("TranslationDetailsPage", () => {
    it("renders the mod display name in the header after load", async () => {
        renderPage()
        await waitFor(() => expect(screen.getByRole("heading", { name: /Zerooz/, level: 1 })).toBeInTheDocument())
    })

    it("renders the parent mod link", async () => {
        renderPage()
        await waitFor(() => expect(screen.getByRole("link", { name: /parent/i })).toHaveAttribute("href", expect.stringContaining("2901237965")))
    })

    it("renders one row per drift string after the initial fetch", async () => {
        renderPage()
        await waitFor(() => expect(screen.getByText("k1")).toBeInTheDocument())
        expect(screen.getByText("k2")).toBeInTheDocument()
        expect(screen.getByText("Trans 1")).toBeInTheDocument()
    })

    it("re-fetches with status filter when a filter pill is clicked", async () => {
        const spy = setupFetchMock()
        renderPage()
        await waitFor(() => expect(screen.getByText("k1")).toBeInTheDocument())
        await userEvent.click(screen.getByRole("button", { name: /^Untranslated$/i }))
        await waitFor(() => {
            const stringsCalls = spy.mock.calls.filter(([url]) => String(url).includes("/strings"))
            expect(stringsCalls.some(([url]) => String(url).includes("status=untranslated"))).toBe(true)
        })
    })

    it("calls translate when the user clicks Translate untranslated", async () => {
        const spy = setupFetchMock()
        renderPage()
        await waitFor(() => expect(screen.getByText("k2")).toBeInTheDocument())
        await userEvent.click(screen.getByRole("button", { name: /Translate untranslated/i }))
        await waitFor(() => {
            const translateCalls = spy.mock.calls.filter(([url, init]) => String(url).includes("/translate") && (init as RequestInit | undefined)?.method === "POST")
            expect(translateCalls.length).toBeGreaterThan(0)
            const body = JSON.parse((translateCalls[0][1] as RequestInit).body as string)
            expect(body.keys).toContain("k2")
        })
    })

    it("disables Translate untranslated when the count is 0", async () => {
        setupFetchMock({ rescan: { ...RESCAN, counts: { translated: 5, untranslated: 0, stale: 0, orphan: 0 } } })
        renderPage()
        await waitFor(() => expect(screen.getByRole("button", { name: /Translate untranslated/i })).toBeDisabled())
    })

    it("persists mod context on save", async () => {
        const spy = setupFetchMock()
        renderPage()
        await waitFor(() => expect(screen.getByDisplayValue("Zerooz")).toBeInTheDocument())
        const nameInput = screen.getByLabelText(/character name/i) as HTMLTextAreaElement
        fireEvent.change(nameInput, { target: { value: "Zerooz the Brave" } })
        await userEvent.click(screen.getByRole("button", { name: /^Save context$/i }))
        await waitFor(() => {
            const putCalls = spy.mock.calls.filter(([url, init]) => String(url).includes("/mod-context") && (init as RequestInit | undefined)?.method === "PUT")
            expect(putCalls.length).toBeGreaterThan(0)
            const body = JSON.parse((putCalls.at(-1)![1] as RequestInit).body as string)
            expect(body.character_name).toBe("Zerooz the Brave")
        })
    })
})
