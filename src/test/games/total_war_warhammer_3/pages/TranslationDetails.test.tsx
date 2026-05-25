import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TranslationDetailsPage from "../../../../games/total_war_warhammer_3/pages/TranslationDetails"
import type { WH3DriftRow, WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"

const MOD: WH3TranslationModSummary = {
    workshop_id: "3315737452",
    display_name: "Zerooz Cathy",
    parent_workshop_ids: ["2901237965"],
    local_source_dir: "C:\\nope",
    source_language: "Chinese",
    target_language: "English",
}

const SUMMARY: WH3RescanSummary = {
    mod_id: MOD.workshop_id,
    counts: { translated: 5, untranslated: 3, stale: 1, orphan: 0 },
    scanned_at: "2026-05-25T00:00:00Z",
}

const STRINGS: WH3DriftRow[] = [
    { source_filename: "units.loc.tsv", key: "k1", parent_text: "原一", translation_text: "Original 1", status: "translated", provider: "manual" },
    { source_filename: "units.loc.tsv", key: "k2", parent_text: "原二", translation_text: null, status: "untranslated", provider: null },
    { source_filename: "units.loc.tsv", key: "k3", parent_text: "原三", translation_text: "Stale text", status: "stale", provider: "claude" },
]

function mockJson(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status })
}

function mockRouteFlow() {
    const spy = vi.spyOn(globalThis, "fetch")
    spy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.endsWith("/translation/mods")) return mockJson([MOD])
        if (url.endsWith("/rescan")) return mockJson(SUMMARY)
        if (url.includes("/strings?status=")) return mockJson(STRINGS.filter((r) => url.includes(r.status)))
        if (url.endsWith("/strings")) return mockJson(STRINGS)
        if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "" })
        if (url.endsWith("/api-responses")) return mockJson([])
        if (url.endsWith("/snapshots")) return mockJson([])
        if (url.endsWith("/glossary")) return mockJson({})
        return mockJson({ status: "ok" })
    })
    return spy
}

const wrap = () => (
    <MemoryRouter initialEntries={[`/translation-mods/${MOD.workshop_id}`]}>
        <Routes>
            <Route path="/translation-mods/:workshopId" element={<TranslationDetailsPage />} />
        </Routes>
    </MemoryRouter>
)

beforeEach(() => {
    mockRouteFlow()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("TranslationDetails (Plan 3 layout)", () => {
    it("renders the toolbar buttons", async () => {
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Mod Glossary/i }))
        expect(screen.getByRole("button", { name: /Scan for Terms/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /API Responses/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Mod Context/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /History/i })).toBeInTheDocument()
    })

    it("renders the action row buttons including Translate count", async () => {
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Reset/i }))
        expect(screen.getByRole("button", { name: /Clear English/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Translate \(3\)/ })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Sync Changes/i })).toBeInTheDocument()
    })

    it("renders the search input above the filter pills", async () => {
        render(wrap())
        await waitFor(() => screen.getByPlaceholderText(/search keys or text/i))
    })

    it("filters table client-side when the user types in search", async () => {
        render(wrap())
        await waitFor(() => screen.getByText("Original 1"))
        fireEvent.change(screen.getByPlaceholderText(/search keys or text/i), { target: { value: "Stale" } })
        await waitFor(() => expect(screen.queryByText("Original 1")).not.toBeInTheDocument())
        expect(screen.getByText("Stale text")).toBeInTheDocument()
    })

    it("renders the Mode column with provider value per row", async () => {
        render(wrap())
        await waitFor(() => screen.getByText("Original 1"))
        const headers = screen.getAllByRole("columnheader")
        expect(headers.some((h) => /mode/i.test(h.textContent ?? ""))).toBe(true)
        expect(screen.getByText("manual")).toBeInTheDocument()
        expect(screen.getByText("claude")).toBeInTheDocument()
    })

    it("opens ModGlossaryModal when the toolbar button is clicked", async () => {
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Mod Glossary/i }))
        fireEvent.click(screen.getByRole("button", { name: /Mod Glossary/i }))
        await waitFor(() => expect(screen.getByRole("heading", { name: /Mod Glossary/i })).toBeInTheDocument())
    })

    it("opens HistoryModal in restore mode when Reset is clicked", async () => {
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Reset/i }))
        fireEvent.click(screen.getByRole("button", { name: /Reset/i }))
        await waitFor(() => expect(screen.getByRole("heading", { name: /Reset to snapshot/i })).toBeInTheDocument())
    })

    it("POSTs to /clear-translations after Clear English confirmation", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(true)
        const fetchSpy = mockRouteFlow()
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Clear English/i }))
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Clear English/i }))
        })
        await waitFor(() => {
            const calls = fetchSpy.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : (c[0] as URL).toString()))
            expect(calls.some((u) => u.includes("/clear-translations"))).toBe(true)
        })
    })

    it("POSTs to /sync when Sync Changes is clicked", async () => {
        const fetchSpy = mockRouteFlow()
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Sync Changes/i }))
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Sync Changes/i }))
        })
        await waitFor(() => {
            const calls = fetchSpy.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : (c[0] as URL).toString()))
            expect(calls.some((u) => u.includes("/sync"))).toBe(true)
        })
    })
})
