import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../../../games/total_war_warhammer_3/components/ScriptRunButton", () => ({
    default: ({ label }: { label: string }) => <button>{label}</button>,
}))

import PackCard from "../../../../games/total_war_warhammer_3/components/PackCard"

const BASE_PACK = {
    title: "Nanu's Dynamic RoR Compat",
    workshopId: "3513364573",
    scriptId: "update_dynamic_rors",
}

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

describe("PackCard", () => {
    it("renders the pack title and the workshopId in the badge", () => {
        render(wrap(<PackCard pack={BASE_PACK} />))
        expect(screen.getByRole("heading", { name: BASE_PACK.title, level: 3 })).toBeInTheDocument()
        expect(screen.getByText(BASE_PACK.workshopId)).toBeInTheDocument()
    })

    it("renders the sharedNote when present", () => {
        render(wrap(<PackCard pack={{ ...BASE_PACK, sharedNote: "Rebuilds with the other modified-attribute packs." }} />))
        expect(screen.getByText(/Rebuilds with the other modified-attribute packs/)).toBeInTheDocument()
    })

    it("does not render the sharedNote when absent", () => {
        render(wrap(<PackCard pack={BASE_PACK} />))
        expect(screen.queryByText(/Rebuilds with/)).not.toBeInTheDocument()
    })

    it("renders a Rebuild ScriptRunButton", () => {
        render(wrap(<PackCard pack={BASE_PACK} />))
        expect(screen.getByRole("button", { name: /Rebuild/i })).toBeInTheDocument()
    })

    it("renders a Steam workshop link with the correct URL", () => {
        render(wrap(<PackCard pack={BASE_PACK} />))
        const link = screen.getByRole("link", { name: /steam/i })
        expect(link).toHaveAttribute("href", `https://steamcommunity.com/sharedfiles/filedetails/?id=${BASE_PACK.workshopId}`)
    })

    it("points the preview image at the backend preview route", () => {
        render(wrap(<PackCard pack={BASE_PACK} />))
        const img = screen.getByAltText(BASE_PACK.title) as HTMLImageElement
        expect(img.src).toContain(`/api/games/total_war_warhammer_3/packs/${BASE_PACK.workshopId}/preview`)
    })
})
