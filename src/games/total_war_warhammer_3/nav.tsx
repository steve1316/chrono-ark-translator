import { MdDashboard, MdPlayArrow } from "react-icons/md"
import { FaList, FaBolt, FaBug, FaShieldAlt } from "react-icons/fa"
import type { GameNavEntry } from "../registry"

export const tw3Nav: GameNavEntry[] = [
    { to: "/dashboard", label: "Dashboard", icon: <MdDashboard /> },
    { to: "/supported-mods", label: "Supported Mods", icon: <FaList /> },
    { to: "/effects", label: "Effects", icon: <FaBolt /> },
    { to: "/validate", label: "Validate", icon: <FaShieldAlt /> },
    { to: "/crashes", label: "Crashes", icon: <FaBug /> },
    { to: "/runner", label: "Runner", icon: <MdPlayArrow /> },
]
