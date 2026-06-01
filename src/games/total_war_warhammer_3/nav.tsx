import { MdDashboard, MdPlayArrow } from "react-icons/md"
import { FaList, FaShieldAlt, FaBook } from "react-icons/fa"
import type { GameNavEntry } from "../registry"

export const tw3Nav: GameNavEntry[] = [
    { to: "/dashboard", label: "Dashboard", icon: <MdDashboard /> },
    { to: "/supported-mods", label: "Supported Mods", icon: <FaList /> },
    { to: "/glossary", label: "Glossary", icon: <FaBook /> },
    { to: "/validate", label: "Validate", icon: <FaShieldAlt /> },
    { to: "/runner", label: "Runner", icon: <MdPlayArrow /> },
]
