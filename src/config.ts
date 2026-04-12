/** Port injected by Vite at build time from CATL_API_PORT in backend/.env. */
declare const __API_PORT__: string

/** Base URL for the FastAPI backend. */
export const API_BASE = `http://localhost:${__API_PORT__}/api`
