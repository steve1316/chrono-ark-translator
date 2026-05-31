import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TranslationModCard from "../../../../games/total_war_warhammer_3/components/TranslationModCard"
import type { WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"

const MOD: WH3TranslationModSummary = {
    workshop_id: "3315737452",
    display_name: "Zerooz Cathy Alternative English Translation",
    parent_workshop_ids: ["2901237965"],
    local_source_dir: "C:\\does\\not\\matter",
    source_language: "Chinese",
    target_language: "English",
}

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ mod_id: "x", counts: { translated: 0, untranslated: 0, stale: 0, orphan: 0 }, scanned_at: "" }), { status: 200 }))
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("TranslationModCard", () => {
    it("renders the display name and workshop id badge", () => {
        render(wrap(<TranslationModCard mod={MOD} progress={null} />))
        expect(screen.getByRole("heading", { name: MOD.display_name, level: 3 })).toBeInTheDocument()
        expect(screen.getByText(MOD.workshop_id)).toBeInTheDocument()
    })

    it("renders the source -> target language pill", () => {
        render(wrap(<TranslationModCard mod={MOD} progress={null} />))
        expect(screen.getByText(/Chinese\s*->\s*English/)).toBeInTheDocument()
    })

    it("renders a single parent link when one parent", () => {
        render(wrap(<TranslationModCard mod={MOD} progress={null} />))
        const link = screen.getByRole("link", { name: /parent/i })
        expect(link).toHaveAttribute("href", "https://steamcommunity.com/sharedfiles/filedetails/?id=2901237965")
        expect(link).toHaveAttribute("target", "_blank")
    })

    it("collapses parent links when there are multiple", () => {
        const collection: WH3TranslationModSummary = { ...MOD, parent_workshop_ids: ["a", "b", "c", "d", "e"] }
        render(wrap(<TranslationModCard mod={collection} progress={null} />))
        expect(screen.getByText(/Translates 5 mods/i)).toBeInTheDocument()
    })

    it("shows 'Not yet scanned' when progress is null", () => {
        render(wrap(<TranslationModCard mod={MOD} progress={null} />))
        expect(screen.getByText(/Not yet scanned/i)).toBeInTheDocument()
    })

    it("renders translated / total when progress is provided", () => {
        const progress: WH3RescanSummary = {
            mod_id: MOD.workshop_id,
            counts: { translated: 12, untranslated: 5, stale: 3, orphan: 1 },
            scanned_at: "2026-05-24T00:00:00Z",
        }
        render(wrap(<TranslationModCard mod={MOD} progress={progress} />))
        // total = translated + untranslated + stale = 20 (orphan excluded).
        expect(screen.getByText(/15\s*\/\s*20\s*strings/)).toBeInTheDocument()
        // Stale count surfaces as a Chrono-Ark-style stat box in the new layout.
        expect(screen.getByText("Stale")).toBeInTheDocument()
        const staleStat = screen.getByText("Stale").previousElementSibling
        expect(staleStat).toHaveTextContent("3")
        // Untranslated count surfaces as the primary stat box.
        expect(screen.getByText("Untranslated")).toBeInTheDocument()
        const untranslatedStat = screen.getByText("Untranslated").previousElementSibling
        expect(untranslatedStat).toHaveTextContent("5")
    })

    it("renders a Translate link to the detail page", () => {
        render(wrap(<TranslationModCard mod={MOD} progress={null} />))
        const link = screen.getByRole("link", { name: /Translate/i })
        expect(link).toHaveAttribute("href", `/translation-mods/${MOD.workshop_id}`)
    })
})
