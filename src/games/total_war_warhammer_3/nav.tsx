import { MdDashboard, MdPlayArrow } from "react-icons/md"
import { FaList, FaBolt } from "react-icons/fa"
import type { GameNavEntry } from "../registry"

export const tw3Nav: GameNavEntry[] = [
    { to: "/dashboard", label: "Dashboard", icon: <MdDashboard /> },
    { to: "/supported-mods", label: "Supported Mods", icon: <FaList /> },
    { to: "/effects", label: "Effects", icon: <FaBolt /> },
    { to: "/runner", label: "Runner", icon: <MdPlayArrow /> },
]
