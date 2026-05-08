import { registerGame } from "../registry"
import { chronoArkNav } from "./nav"
import { ChronoArkRoutes } from "./routes"

/**
 * Side-effect import that registers the Chrono Ark game with the frontend
 * manifest registry.
 *
 * The App-level shell imports this module so the Chrono Ark routes and nav
 * entries are wired up before the router renders.
 */
registerGame({
    id: "chrono_ark",
    displayName: "Chrono Ark",
    icon: "chrono_ark",
    nav: chronoArkNav,
    routes: () => <ChronoArkRoutes />,
})

// Marker export keeps TypeScript treating this file as a module so the
// side-effect import works even when no other symbols are referenced.
export {}
