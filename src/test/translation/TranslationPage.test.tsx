import { render, screen, fireEvent } from "@testing-library/react"
import { TranslationPage } from "../../translation/TranslationPage"
import type { ColumnDef } from "../../translation/types"

interface Row {
    id: string
    name: string
}

const columns: ColumnDef<Row>[] = [{ field: "name", label: "Name", width: 200, sortable: true, render: (r) => r.name }]
const rows: Row[] = [{ id: "1", name: "Alpha" }]

function baseProps(overrides = {}) {
    return {
        title: "My Mod",
        progressLabel: "3 / 10 total strings translated",
        statusFilters: [
            { value: "all", label: "All" },
            { value: "missing", label: "Missing" },
        ],
        activeFilter: "all",
        onFilterChange: vi.fn(),
        search: "",
        onSearchChange: vi.fn(),
        columns,
        rows,
        getRowKey: (r: Row) => r.id,
        sortField: null,
        sortDirection: null as null,
        onSort: vi.fn(),
        ...overrides,
    }
}

describe("TranslationPage", () => {
    it("renders the title and progress label", () => {
        render(<TranslationPage {...baseProps()} />)
        expect(screen.getByRole("heading", { name: "My Mod" })).toBeInTheDocument()
        expect(screen.getByText("3 / 10 total strings translated")).toBeInTheDocument()
    })

    it("renders filter pills and marks the active one", () => {
        render(<TranslationPage {...baseProps()} />)
        expect(screen.getByRole("button", { name: "All" })).toHaveClass("btn-primary")
        expect(screen.getByRole("button", { name: "Missing" })).toHaveClass("btn-outline")
    })

    it("calls onFilterChange when a pill is clicked", () => {
        const onFilterChange = vi.fn()
        render(<TranslationPage {...baseProps({ onFilterChange })} />)
        fireEvent.click(screen.getByRole("button", { name: "Missing" }))
        expect(onFilterChange).toHaveBeenCalledWith("missing")
    })

    it("calls onSearchChange when typing in the search box", () => {
        const onSearchChange = vi.fn()
        render(<TranslationPage {...baseProps({ onSearchChange })} />)
        fireEvent.change(screen.getByPlaceholderText(/search keys or text/i), { target: { value: "alp" } })
        expect(onSearchChange).toHaveBeenCalledWith("alp")
    })

    it("renders the strings table rows", () => {
        render(<TranslationPage {...baseProps()} />)
        expect(screen.getByText("Alpha")).toBeInTheDocument()
    })

    it("shows a feedback banner when provided", () => {
        render(<TranslationPage {...baseProps({ banner: { type: "success", message: "Translated 5 strings." }, onDismissBanner: vi.fn() })} />)
        expect(screen.getByText("Translated 5 strings.")).toBeInTheDocument()
    })

    it("shows the translating banner when provided", () => {
        render(<TranslationPage {...baseProps({ translating: { batchIndex: 0, totalBatches: 2 }, onCancelTranslate: vi.fn() })} />)
        expect(screen.getByText(/Translating batch 1 of 2/)).toBeInTheDocument()
    })

    it("renders the toolbar slot", () => {
        render(<TranslationPage {...baseProps({ toolbar: <button>Translate</button> })} />)
        expect(screen.getByRole("button", { name: "Translate" })).toBeInTheDocument()
    })
})
