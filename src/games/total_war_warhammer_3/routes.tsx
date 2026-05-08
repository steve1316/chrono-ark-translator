import { Routes, Route, Navigate } from "react-router-dom"
import Placeholder from "./pages/Placeholder"

export function TotalWarWarhammer3Routes() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Placeholder />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
    )
}
