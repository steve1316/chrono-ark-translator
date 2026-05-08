import { MdDashboard } from "react-icons/md"
import { FaBook, FaChartLine } from "react-icons/fa"
import type { GameNavEntry } from "../registry"

/**
 * Top-level sidebar entries contributed by the Chrono Ark game manifest.
 *
 * Settings is intentionally excluded because it lives at the cross-game level
 * (mounted directly under `src/pages/Settings/`) and is rendered by the
 * sidebar regardless of the active game.
 */
export const chronoArkNav: GameNavEntry[] = [
    { to: "/dashboard", label: "Dashboard", icon: <MdDashboard /> },
    { to: "/glossary", label: "Glossary", icon: <FaBook /> },
    { to: "/statistics", label: "Statistics", icon: <FaChartLine /> },
]
