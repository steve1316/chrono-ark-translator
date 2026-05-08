import { registerGame } from "../registry"
import { tw3Nav } from "./nav"
import { TotalWarWarhammer3Routes } from "./routes"

registerGame({
    id: "total_war_warhammer_3",
    displayName: "Warhammer III",
    icon: "total_war_warhammer_3",
    nav: tw3Nav,
    routes: () => <TotalWarWarhammer3Routes />,
})

export {}
