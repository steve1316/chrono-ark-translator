/// <reference types="vitest/config" />
import fs from "fs"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

// Read CATL_API_PORT from backend/.env so the port is shared with Python.
let apiPort = "8008"
try {
  const envFile = fs.readFileSync("backend/.env", "utf-8")
  const match = envFile.match(/^CATL_API_PORT\s*=\s*(.+)/m)
  if (match) apiPort = match[1].trim()
} catch {
  // No .env file so use the default.
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __API_PORT__: JSON.stringify(apiPort),
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
  },
})
