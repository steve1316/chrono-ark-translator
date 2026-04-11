import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ModCard from "../../components/ModCard"
import type { ModStatus } from "../../shared_types"

function makeMod(overrides: Partial<ModStatus> = {}): ModStatus {
    return {
        id: "12345",
        name: "Test Mod",
        author: "TestAuthor",
        has_csv: true,
        has_dll: false,
        total: 100,
        translated: 75,
        untranslated: 25,
        percentage: 75,
        last_updated: "",
        has_changes: false,
        ...overrides,
    }
}

describe("ModCard", () => {
    it("renders mod name, author, and progress percentage", () => {
        render(<ModCard mod={makeMod()} onClick={vi.fn()} onSync={vi.fn()} />)
        expect(screen.getByText("Test Mod")).toBeInTheDocument()
        expect(screen.getByText(/TestAuthor/)).toBeInTheDocument()
        expect(screen.getByText("75% Translated")).toBeInTheDocument()
    })

    it("renders progress bar with correct width", () => {
        const { container } = render(<ModCard mod={makeMod({ percentage: 60 })} onClick={vi.fn()} onSync={vi.fn()} />)
        const fill = container.querySelector(".progress-bar-fill") as HTMLElement
        expect(fill.style.width).toBe("60%")
    })

    it("renders DLL format when has_dll is true", () => {
        render(<ModCard mod={makeMod({ has_dll: true })} onClick={vi.fn()} onSync={vi.fn()} />)
        expect(screen.getByText("DLL")).toBeInTheDocument()
    })

    it("renders CSV format when has_dll is false", () => {
        render(<ModCard mod={makeMod({ has_dll: false })} onClick={vi.fn()} onSync={vi.fn()} />)
        expect(screen.getByText("CSV")).toBeInTheDocument()
    })

    it("shows Needs Sync badge when has_changes is true", () => {
        render(<ModCard mod={makeMod({ has_changes: true })} onClick={vi.fn()} onSync={vi.fn()} />)
        expect(screen.getByText("Needs Sync")).toBeInTheDocument()
    })

    it("does not show Needs Sync badge when has_changes is false", () => {
        render(<ModCard mod={makeMod({ has_changes: false })} onClick={vi.fn()} onSync={vi.fn()} />)
        expect(screen.queryByText("Needs Sync")).not.toBeInTheDocument()
    })

    it("calls onClick with mod id when View Strings is clicked", async () => {
        const user = userEvent.setup()
        const onClick = vi.fn()
        render(<ModCard mod={makeMod()} onClick={onClick} onSync={vi.fn()} />)
        await user.click(screen.getByText("View Strings"))
        expect(onClick).toHaveBeenCalledWith("12345")
    })

    it("renders Steam link when url is provided", () => {
        render(<ModCard mod={makeMod({ url: "https://steam.example" })} onClick={vi.fn()} onSync={vi.fn()} />)
        const link = screen.getByTitle("Open mod page")
        expect(link).toHaveAttribute("href", "https://steam.example")
    })
})
