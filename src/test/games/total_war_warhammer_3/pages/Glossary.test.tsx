import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import GlossaryPage from "../../../../games/total_war_warhammer_3/pages/Glossary"

const GLOSSARY = {
    terms: {
        Armour: { english: "Armour", category: "stats", key: "k1", source_mappings: { Chinese: "护甲", Korean: "방어구" } },
        "The Black Pit": { english: "The Black Pit", category: "regions", key: "k2", source_mappings: { Chinese: "黑暗深渊" } },
    },
}

function mockGlossaryFetch() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(GLOSSARY), { status: 200 }))
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("WH3 GlossaryPage", () => {
    it("renders fetched terms with their Chinese mapping", async () => {
        mockGlossaryFetch()
        render(<GlossaryPage />)
        expect(await screen.findByText("Armour")).toBeInTheDocument()
        expect(screen.getByText("护甲")).toBeInTheDocument()
        expect(screen.getByText("The Black Pit")).toBeInTheDocument()
    })

    it("filters terms by search text", async () => {
        mockGlossaryFetch()
        render(<GlossaryPage />)
        await screen.findByText("Armour")
        fireEvent.change(screen.getByPlaceholderText("Search terms..."), { target: { value: "black" } })
        await waitFor(() => expect(screen.queryByText("Armour")).not.toBeInTheDocument())
        expect(screen.getByText("The Black Pit")).toBeInTheDocument()
    })

    it("filters terms by category", async () => {
        mockGlossaryFetch()
        render(<GlossaryPage />)
        await screen.findByText("Armour")
        fireEvent.click(screen.getByRole("button", { name: "regions" }))
        await waitFor(() => expect(screen.queryByText("Armour")).not.toBeInTheDocument())
        expect(screen.getByText("The Black Pit")).toBeInTheDocument()
    })
})
