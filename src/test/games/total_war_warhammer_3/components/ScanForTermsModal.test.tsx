import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ScanForTermsModal from "../../../../games/total_war_warhammer_3/components/ScanForTermsModal"
import type { TermSuggestion } from "../../../../shared_types"

const SUGGESTIONS: TermSuggestion[] = [
    { english: "Phoenix", source: "凤", source_lang: "Chinese", category: "factions", reason: "recurring" },
    { english: "Cathay", source: "震旦", source_lang: "Chinese", category: "factions", reason: "country name" },
    { english: "Sky", source: "天", source_lang: "Chinese", category: "lore_terms", reason: "common" },
]

function mockJson(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockJson(SUGGESTIONS))
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("ScanForTermsModal", () => {
    it("shows a spinner before suggestions arrive", () => {
        render(<ScanForTermsModal workshopId="123" onClose={vi.fn()} />)
        expect(screen.getByText(/Scanning/i)).toBeInTheDocument()
    })

    it("lists suggestions grouped by category once loaded", async () => {
        render(<ScanForTermsModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText(/Phoenix/))
        expect(screen.getByText("factions")).toBeInTheDocument()
        expect(screen.getByText("lore_terms")).toBeInTheDocument()
        expect(screen.getByText("Cathay")).toBeInTheDocument()
        expect(screen.getByText("Sky")).toBeInTheDocument()
    })

    it("removes a suggestion when Reject is clicked", async () => {
        render(<ScanForTermsModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText(/Phoenix/))
        const rejectButtons = screen.getAllByRole("button", { name: /^Reject$/ })
        fireEvent.click(rejectButtons[0])
        await waitFor(() => expect(screen.queryByText("Phoenix")).not.toBeInTheDocument())
    })

    it("POSTs to /glossary when Accept is clicked", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(SUGGESTIONS)) // scan-terms
        fetchSpy.mockResolvedValueOnce(mockJson({ status: "ok" })) // POST glossary

        render(<ScanForTermsModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText(/Phoenix/))
        const acceptButtons = screen.getAllByRole("button", { name: /^Accept$/ })
        await act(async () => {
            fireEvent.click(acceptButtons[0])
        })
        await waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledTimes(2)
        })
        const [url, init] = fetchSpy.mock.calls[1]
        expect(url).toEqual(expect.stringContaining("/translation/mods/123/glossary"))
        expect((init as RequestInit).method).toBe("POST")
        expect(JSON.parse((init as RequestInit).body as string).english).toBe("Phoenix")
    })

    it("Accept All POSTs every remaining suggestion", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(SUGGESTIONS)) // scan-terms
        SUGGESTIONS.forEach(() => fetchSpy.mockResolvedValueOnce(mockJson({ status: "ok" })))

        render(<ScanForTermsModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText(/Phoenix/))

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Accept all/i }))
        })
        await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1 + SUGGESTIONS.length))
    })

    it("renders empty state when scan returns no suggestions", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(mockJson([]))
        render(<ScanForTermsModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText(/No new terms suggested/i))
    })
})
