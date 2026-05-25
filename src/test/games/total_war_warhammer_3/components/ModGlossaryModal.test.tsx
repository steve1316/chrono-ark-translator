import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ModGlossaryModal from "../../../../games/total_war_warhammer_3/components/ModGlossaryModal"

const GLOSSARY = {
    Phoenix: { source: "凤", category: "factions" },
    Cathay: { source: "震旦", category: "factions" },
    Sky: { source: "天", category: "lore_terms" },
}

function mockJson(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockJson(GLOSSARY))
    vi.spyOn(window, "confirm").mockReturnValue(true)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("ModGlossaryModal", () => {
    it("loads and lists entries grouped by category", async () => {
        render(<ModGlossaryModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText("Phoenix"))
        expect(screen.getByText("Cathay")).toBeInTheDocument()
        expect(screen.getByText("Sky")).toBeInTheDocument()
        expect(screen.getByText("factions")).toBeInTheDocument()
        expect(screen.getByText("lore_terms")).toBeInTheDocument()
    })

    it("POSTs a new entry when Add is clicked", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(GLOSSARY))
        fetchSpy.mockResolvedValueOnce(mockJson({ status: "ok" })) // POST
        fetchSpy.mockResolvedValueOnce(mockJson({ ...GLOSSARY, Dragon: { source: "龙", category: "factions" } })) // refresh

        render(<ModGlossaryModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText("Phoenix"))

        fireEvent.change(screen.getByPlaceholderText(/English term/i), { target: { value: "Dragon" } })
        fireEvent.change(screen.getByPlaceholderText(/Source/i), { target: { value: "龙" } })
        fireEvent.change(screen.getByPlaceholderText(/Category/i), { target: { value: "factions" } })

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Add term/i }))
        })

        await waitFor(() => expect(screen.getByText("Dragon")).toBeInTheDocument())
    })

    it("DELETEs an entry when Delete is clicked", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(GLOSSARY))
        fetchSpy.mockResolvedValueOnce(mockJson({ status: "ok" })) // DELETE
        const { Phoenix, ...rest } = GLOSSARY
        void Phoenix
        fetchSpy.mockResolvedValueOnce(mockJson(rest)) // refresh

        render(<ModGlossaryModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText("Phoenix"))

        const buttons = screen.getAllByRole("button", { name: /Delete/i })
        await act(async () => {
            fireEvent.click(buttons[0])
        })
        await waitFor(() => expect(screen.queryByText("Phoenix")).not.toBeInTheDocument())
    })

    it("PUTs an updated entry when Save is clicked in edit mode", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(GLOSSARY))
        fetchSpy.mockResolvedValueOnce(mockJson({ status: "ok" })) // PUT
        fetchSpy.mockResolvedValueOnce(mockJson({ ...GLOSSARY, "Phoenix Lord": { source: "凤", category: "factions" } })) // refresh

        render(<ModGlossaryModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText("Phoenix"))

        const editButtons = screen.getAllByRole("button", { name: /Edit/i })
        fireEvent.click(editButtons[0])

        const englishInput = screen.getByDisplayValue("Phoenix")
        fireEvent.change(englishInput, { target: { value: "Phoenix Lord" } })

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Save$/ }))
        })
        await waitFor(() => expect(screen.getByText("Phoenix Lord")).toBeInTheDocument())

        const [, init] = fetchSpy.mock.calls[1]
        expect((init as RequestInit).method).toBe("PUT")
        expect(JSON.parse((init as RequestInit).body as string).english).toBe("Phoenix Lord")
    })

    it("Suggest Edits surfaces returned suggestions inline", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(GLOSSARY))
        fetchSpy.mockResolvedValueOnce(mockJson([{ english: "Dragon Sky", source: "天龙", source_lang: "Chinese", category: "factions", reason: "compound" }]))

        render(<ModGlossaryModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText("Phoenix"))

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Suggest edits/i }))
        })
        await waitFor(() => screen.getByText("Dragon Sky"))
    })

    it("Apply All POSTs old + new english", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(mockJson(GLOSSARY))
        fetchSpy.mockResolvedValueOnce(mockJson({ replaced: 5 }))

        render(<ModGlossaryModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => screen.getByText("Phoenix"))

        fireEvent.click(screen.getByRole("button", { name: /Apply all/i }))
        fireEvent.change(screen.getByPlaceholderText(/Old English/i), { target: { value: "Phoenix" } })
        fireEvent.change(screen.getByPlaceholderText(/New English/i), { target: { value: "Phoenix Lord" } })

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Apply$/ }))
        })
        await waitFor(() => screen.getByText(/Replaced 5/))
    })
})
