"""
FastAPI backend for Chrono Ark Mod Translation Dashboard.

Provides REST APIs for mod discovery, string extraction, translation status,
glossary management, and triggering translation jobs. Routes are organized
into domain-specific modules under `backend.routes`.
"""

import uvicorn
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.routes.helpers import _adapter
from backend.routes import mods, translation, glossary, ollama, llamacpp, settings


app = FastAPI(title="Chrono Ark Translator API")

# Enable CORS for Vite development server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register domain routers.
app.include_router(mods.router)
app.include_router(translation.router)
app.include_router(glossary.router)
app.include_router(ollama.router)
app.include_router(llamacpp.router)
app.include_router(settings.router)

# Mount the workshop directory as static files so preview images are served
# directly without going through a Python endpoint for each request.
# This must be after all route definitions since mounts take priority over
# routes defined after them.
_workshop_path = getattr(_adapter, "_WORKSHOP_PATH", None)
if _workshop_path and Path(_workshop_path).exists():
    app.mount("/api/workshop", StaticFiles(directory=str(_workshop_path)), name="workshop")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_config={
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {"fmt": "%(asctime)s %(levelprefix)s %(message)s", "datefmt": "%Y-%m-%d %H:%M:%S", "use_colors": True, "()": "uvicorn.logging.DefaultFormatter"},
                "access": {
                    "fmt": '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                    "use_colors": True,
                    "()": "uvicorn.logging.AccessFormatter",
                },
            },
            "handlers": {
                "default": {"formatter": "default", "class": "logging.StreamHandler", "stream": "ext://sys.stderr"},
                "access": {"formatter": "access", "class": "logging.StreamHandler", "stream": "ext://sys.stdout"},
            },
            "loggers": {
                "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},
                "uvicorn.error": {"level": "INFO"},
                "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
            },
        },
    )
