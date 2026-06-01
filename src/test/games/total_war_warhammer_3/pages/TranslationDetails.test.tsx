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
    preview_image_url: "/games/total_war_warhammer_3/translation/mods/3315737452/preview",
}

const SUMMARY: WH3RescanSummary = {
    mod_id: MOD.workshop_id,
    counts: { translated: 5, untranslated: 3, stale: 1, orphan: 0 },
    scanned_at: "2026-05-25T00:00:00Z",
    has_unsynced_changes: false,
    has_mod_context: false,
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
        if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
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

    it("renders the action row buttons including Translate provider label", async () => {
        render(wrap())
        await waitFor(() => screen.getByRole("button", { name: /Reset/i }))
        expect(screen.getByRole("button", { name: /Clear English/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /^Translate \(Claude\)/i })).toBeInTheDocument()
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

    it("renders the back-to-dashboard button styled as btn-outline", async () => {
        render(wrap())
        const back = await screen.findByRole("button", { name: /Back to Dashboard/i })
        expect(back).toHaveClass("btn", "btn-outline")
    })

    it("renders the 80x80 preview image when preview_image_url is set", async () => {
        render(wrap())
        const img = await screen.findByAltText(MOD.display_name)
        expect(img).toHaveAttribute("src", expect.stringContaining(MOD.preview_image_url!))
    })

    it("renders a Steam icon link pointing at the translation mod's workshop page", async () => {
        render(wrap())
        const link = await screen.findByTitle("Open on Steam Workshop")
        expect(link).toHaveAttribute("href", `https://steamcommunity.com/sharedfiles/filedetails/?id=${MOD.workshop_id}`)
        expect(link).toHaveAttribute("target", "_blank")
    })

    it("renders an Open Folder button that POSTs to /open-folder when clicked", async () => {
        const fetchSpy = mockRouteFlow()
        render(wrap())
        const folder = await screen.findByTitle("Open local folder")
        await act(async () => {
            fireEvent.click(folder)
        })
        await waitFor(() => {
            const calls = fetchSpy.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : (c[0] as URL).toString()))
            expect(calls.some((u) => u.includes("/open-folder"))).toBe(true)
        })
    })

    it("renders the Changes pending sync badge when has_unsynced_changes is true", async () => {
        const spy = vi.spyOn(globalThis, "fetch")
        spy.mockImplementation(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString()
            if (url.endsWith("/translation/mods")) return mockJson([MOD])
            if (url.endsWith("/rescan")) return mockJson({ ...SUMMARY, has_unsynced_changes: true })
            if (url.endsWith("/strings")) return mockJson(STRINGS)
            if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
            return mockJson({ status: "ok" })
        })
        render(wrap())
        await waitFor(() => expect(screen.getByText(/Changes pending sync/i)).toBeInTheDocument())
    })

    it("renders the Source Language dropdown with the registry default selected", async () => {
        render(wrap())
        const select = (await screen.findByLabelText(/Source Language/i)) as HTMLSelectElement
        expect(select.value).toBe("Chinese")
    })

    it("PUTs to /mod-context when the Source Language dropdown changes", async () => {
        const fetchSpy = mockRouteFlow()
        render(wrap())
        const select = await screen.findByLabelText(/Source Language/i)
        await act(async () => {
            fireEvent.change(select, { target: { value: "Japanese" } })
        })
        await waitFor(() => {
            const putCalls = fetchSpy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PUT")
            const modContextPut = putCalls.find((c) => (typeof c[0] === "string" ? c[0] : (c[0] as URL).toString()).includes("/mod-context"))
            expect(modContextPut).toBeDefined()
            const body = JSON.parse((modContextPut![1] as RequestInit).body as string)
            expect(body.source_language_override).toBe("Japanese")
        })
    })

    it("renders the inline 'X / Y total strings translated' counter", async () => {
        render(wrap())
        // SUMMARY has translated=5, stale=1, untranslated=3; done=6, total=9.
        await waitFor(() => expect(screen.getByText(/6\s*\/\s*9\s*total strings translated/i)).toBeInTheDocument())
    })

    it("no longer renders the standalone progress-bar glass-card", async () => {
        const { container } = render(wrap())
        await screen.findByText(/Back to Dashboard/i)
        expect(container.querySelector(".translation-progress-bar")).toBeNull()
    })

    it("renders the action row split into three .mod-actions-group blocks", async () => {
        const { container } = render(wrap())
        await screen.findByRole("button", { name: /Back to Dashboard/i })
        const groups = container.querySelectorAll(".mod-actions .mod-actions-group")
        expect(groups.length).toBe(3)
    })

    it("shows the glossary count on the Mod Glossary button", async () => {
        const spy = vi.spyOn(globalThis, "fetch")
        spy.mockImplementation(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString()
            if (url.endsWith("/translation/mods")) return mockJson([MOD])
            if (url.endsWith("/rescan")) return mockJson(SUMMARY)
            if (url.endsWith("/strings")) return mockJson(STRINGS)
            if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
            if (url.endsWith("/glossary")) return mockJson({ Phoenix: { source: "x", category: "factions" }, Sky: { source: "y", category: "lore" } })
            return mockJson({ status: "ok" })
        })
        render(wrap())
        await waitFor(() => expect(screen.getByRole("button", { name: /Mod Glossary \(2\)/i })).toBeInTheDocument())
    })

    it("shows a green-dot indicator on Mod Context when has_mod_context is true", async () => {
        const spy = vi.spyOn(globalThis, "fetch")
        spy.mockImplementation(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString()
            if (url.endsWith("/translation/mods")) return mockJson([MOD])
            if (url.endsWith("/rescan")) return mockJson({ ...SUMMARY, has_mod_context: true })
            if (url.endsWith("/strings")) return mockJson(STRINGS)
            if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "Zerooz", background: "", source_language_override: null, target_language_override: null })
            return mockJson({ status: "ok" })
        })
        const { container } = render(wrap())
        await waitFor(() => expect(container.querySelector(".wh3-mod-context-dot")).not.toBeNull())
    })

    it("renders the Translate button as a split-dropdown with provider label", async () => {
        render(wrap())
        const main = await screen.findByRole("button", { name: /^Translate \(Claude\)/i })
        expect(main).toBeInTheDocument()
        // Chevron sibling exists.
        const chevron = screen.getByRole("button", { name: /Translate provider menu/i })
        expect(chevron).toBeInTheDocument()
    })

    it("opens the provider dropdown when the chevron is clicked", async () => {
        render(wrap())
        await screen.findByRole("button", { name: /^Translate \(Claude\)/i })
        const chevron = screen.getByRole("button", { name: /Translate provider menu/i })
        fireEvent.click(chevron)
        await waitFor(() => expect(screen.getByRole("menuitem", { name: /Claude/i })).toBeInTheDocument())
    })

    it("renders 'Re-sync Changes' label when has_unsynced_changes is true", async () => {
        const spy = vi.spyOn(globalThis, "fetch")
        spy.mockImplementation(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString()
            if (url.endsWith("/translation/mods")) return mockJson([MOD])
            if (url.endsWith("/rescan")) return mockJson({ ...SUMMARY, has_unsynced_changes: true })
            if (url.endsWith("/strings")) return mockJson(STRINGS)
            if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
            return mockJson({ status: "ok" })
        })
        render(wrap())
        await waitFor(() => expect(screen.getByRole("button", { name: /Re-sync Changes/i })).toBeInTheDocument())
    })

    it("wraps the search input and filter pills in a single glass-card", async () => {
        const { container } = render(wrap())
        await screen.findByRole("button", { name: /Back to Dashboard/i })
        const searchInput = screen.getByPlaceholderText(/search keys or text/i)
        const allFilterPill = screen.getByRole("button", { name: /^All$/i })
        // Walk up from each element to find the nearest .glass-card ancestor; they must be the same node.
        const searchCard = searchInput.closest(".glass-card")
        const filterCard = allFilterPill.closest(".glass-card")
        expect(searchCard).not.toBeNull()
        expect(filterCard).not.toBeNull()
        expect(searchCard).toBe(filterCard)
    })

    it("renders a x clear button inside the search input when text is present", async () => {
        render(wrap())
        const input = await screen.findByPlaceholderText(/search keys or text/i)
        fireEvent.change(input, { target: { value: "abc" } })
        expect(screen.getByTitle("Clear search")).toBeInTheDocument()
    })

    it("clears the search input when the x is clicked", async () => {
        render(wrap())
        const input = (await screen.findByPlaceholderText(/search keys or text/i)) as HTMLInputElement
        fireEvent.change(input, { target: { value: "abc" } })
        fireEvent.click(screen.getByTitle("Clear search"))
        expect(input.value).toBe("")
    })

    it("active filter pill renders as btn-primary; inactive as btn-outline", async () => {
        render(wrap())
        const allPill = await screen.findByRole("button", { name: /^All$/i })
        const untranslated = screen.getByRole("button", { name: /Untranslated/i })
        expect(allPill).toHaveClass("btn-primary")
        expect(untranslated).toHaveClass("btn-outline")
        fireEvent.click(untranslated)
        await waitFor(() => expect(screen.getByRole("button", { name: /Untranslated/i })).toHaveClass("btn-primary"))
    })

    it("renders the translate-in-progress banner while runTranslateBatch is executing", async () => {
        // Mock /translate to never resolve so we can observe the banner mid-flight.
        let resolveTranslate: (v: Response) => void = () => undefined
        const translatePromise = new Promise<Response>((r) => {
            resolveTranslate = r
        })
        const spy = vi.spyOn(globalThis, "fetch")
        spy.mockImplementation(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString()
            if (url.endsWith("/translate")) {
                return translatePromise
            }
            if (url.endsWith("/translation/mods")) return mockJson([MOD])
            if (url.endsWith("/rescan")) return mockJson(SUMMARY)
            if (url.includes("/strings?status=")) return mockJson(STRINGS.filter((r) => url.includes(r.status)))
            if (url.endsWith("/strings")) return mockJson(STRINGS)
            if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
            return mockJson({ status: "ok" })
        })

        render(wrap())
        const translateBtn = await screen.findByRole("button", { name: /^Translate \(Claude\)/i })
        fireEvent.click(translateBtn)
        await waitFor(() => expect(screen.getByText(/Translating batch/i)).toBeInTheDocument())
        expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument()
        resolveTranslate(mockJson({ translated: 1, suggested_terms: [] }))
    })

    it("wraps the table inside .string-table-container glass-card", async () => {
        const { container } = render(wrap())
        await screen.findByRole("button", { name: /Back to Dashboard/i })
        expect(container.querySelector(".string-table-container")).not.toBeNull()
        expect(container.querySelector(".string-table-container table")).not.toBeNull()
    })

    it("renders Status column with TRANSLATED / UNTRANSLATED / STALE badge text", async () => {
        render(wrap())
        await screen.findByText("Original 1")
        expect(screen.getByText("TRANSLATED")).toBeInTheDocument()
        expect(screen.getByText("UNTRANSLATED")).toBeInTheDocument()
        expect(screen.getByText("STALE")).toBeInTheDocument()
    })

    it("clicking a column header cycles sort direction null -> asc -> desc -> null", async () => {
        render(wrap())
        await screen.findByText("Original 1")
        const keyHeader = screen.getByRole("columnheader", { name: /^Key/i })
        // Initial: no sort indicator on Key.
        expect(keyHeader.querySelector(".sort-icon.active")).toBeNull()
        fireEvent.click(keyHeader)
        expect(keyHeader.querySelector(".sort-icon.active")).not.toBeNull()
        fireEvent.click(keyHeader)
        expect(keyHeader.querySelector(".sort-icon.active")).not.toBeNull()
        fireEvent.click(keyHeader)
        expect(keyHeader.querySelector(".sort-icon.active")).toBeNull()
    })

    it("highlights rows where provider === 'claude' with the wh3-translation-row-claude class", async () => {
        const { container } = render(wrap())
        await screen.findByText("Stale text")
        const claudeRow = container.querySelector(".wh3-translation-row-claude")
        expect(claudeRow).not.toBeNull()
        expect(claudeRow?.textContent).toContain("Stale text")
    })

    it("renders a .resizer handle on each sortable column header", async () => {
        const { container } = render(wrap())
        await screen.findByRole("button", { name: /Back to Dashboard/i })
        const resizers = container.querySelectorAll(".sortable-th .resizer")
        // 6 columns -> 6 resizers.
        expect(resizers.length).toBe(6)
    })

    it("reads initial column widths from localStorage when present", async () => {
        window.localStorage.setItem("wh3-translation-column-widths", JSON.stringify({ status: 200, provider: 110, source_filename: 220, key: 250, parent_text: 300, translation_text: 320 }))
        try {
            const { container } = render(wrap())
            await screen.findByRole("button", { name: /Back to Dashboard/i })
            const statusHeader = container.querySelector('th[data-field="status"]') as HTMLElement
            expect(statusHeader.style.width).toBe("200px")
        } finally {
            window.localStorage.removeItem("wh3-translation-column-widths")
        }
    })

    it("Cancel button stops the batch loop and hides the banner", async () => {
        let resolveTranslate: (v: Response) => void = () => undefined
        const spy = vi.spyOn(globalThis, "fetch")
        spy.mockImplementation(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString()
            if (url.endsWith("/translate")) {
                return new Promise<Response>((r) => {
                    resolveTranslate = r
                })
            }
            if (url.endsWith("/translation/mods")) return mockJson([MOD])
            if (url.endsWith("/rescan")) return mockJson(SUMMARY)
            if (url.includes("/strings?status=")) return mockJson(STRINGS.filter((r) => url.includes(r.status)))
            if (url.endsWith("/strings")) return mockJson(STRINGS)
            if (url.endsWith("/mod-context")) return mockJson({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
            return mockJson({ status: "ok" })
        })

        render(wrap())
        const translateBtn = await screen.findByRole("button", { name: /^Translate \(Claude\)/i })
        fireEvent.click(translateBtn)
        await waitFor(() => expect(screen.getByText(/Translating batch/i)).toBeInTheDocument())
        fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }))
        // Resolve the in-flight call so the loop reaches its cancel check.
        resolveTranslate(mockJson({ translated: 1, suggested_terms: [] }))
        await waitFor(() => expect(screen.queryByText(/Translating batch/i)).not.toBeInTheDocument())
    })
})
