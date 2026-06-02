import { render, screen, fireEvent } from "@testing-library/react"
import { StringsTable } from "../../translation/StringsTable"
import type { ColumnDef } from "../../translation/types"

interface Row {
    id: string
    name: string
}

const rows: Row[] = [
    { id: "1", name: "Alpha" },
    { id: "2", name: "Beta" },
]

const columns: ColumnDef<Row>[] = [{ field: "name", label: "Name", width: 200, sortable: true, render: (r) => r.name }]

describe("StringsTable", () => {
    it("renders a header and one row per item", () => {
        render(<StringsTable rows={rows} columns={columns} getRowKey={(r) => r.id} sortField={null} sortDirection={null} onSort={vi.fn()} />)
        expect(screen.getByText("Name")).toBeInTheDocument()
        expect(screen.getByText("Alpha")).toBeInTheDocument()
        expect(screen.getByText("Beta")).toBeInTheDocument()
    })

    it("calls onSort with the column field when a sortable header is clicked", () => {
        const onSort = vi.fn()
        render(<StringsTable rows={rows} columns={columns} getRowKey={(r) => r.id} sortField={null} sortDirection={null} onSort={onSort} />)
        fireEvent.click(screen.getByText("Name"))
        expect(onSort).toHaveBeenCalledWith("name")
    })

    it("shows the empty message when there are no rows", () => {
        render(<StringsTable rows={[]} columns={columns} getRowKey={(r) => r.id} sortField={null} sortDirection={null} onSort={vi.fn()} emptyMessage="No rows." />)
        expect(screen.getByText("No rows.")).toBeInTheDocument()
    })
})
