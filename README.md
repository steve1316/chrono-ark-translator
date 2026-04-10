# Chrono Ark Mod Translator

A full-stack translation management tool for [Chrono Ark](https://store.steampowered.com/app/1188930/Chrono_Ark/) Steam Workshop mods. It automates the translation of mod localization strings from their source languages (Korean, Chinese, Japanese) into English using AI-powered providers, with support for glossary enforcement, translation memory, batch processing, and manual editing.

Built with **React 19 + TypeScript + Vite** on the frontend and **Python FastAPI** on the backend.

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Translation Pipeline](#translation-pipeline)
- [Glossary System](#glossary-system)
- [Translation Memory](#translation-memory)
- [Mod Discovery and String Extraction](#mod-discovery-and-string-extraction)
- [Supported Translation Providers](#supported-translation-providers)
- [Export and Sync](#export-and-sync)
- [Backup and History](#backup-and-history)
- [Configuration](#configuration)
- [Getting Started](#getting-started)

## Features

- **Multi-provider AI translation** with Claude, OpenAI, DeepL, Ollama, llama.cpp, and manual mode
- **Iterative batch processing** that pauses between batches for glossary term review
- **Two-tier glossary system** with a global base-game glossary and per-mod custom glossaries
- **AI-generated glossary suggestions** proposed by LLMs during translation for consistent terminology
- **Translation memory** with SHA-256 indexed caching to avoid redundant API calls
- **Inline editing** of translations directly in a sortable, filterable, column-resizable table
- **Character context injection** for lore-aware translations of character mods
- **Real-time streaming progress** for local model providers (Ollama, llama.cpp) via SSE
- **Cost estimation** with dry-run previews showing token counts and pricing before committing
- **Prompt inspection** with tabbed views of system prompts and user messages before translation
- **CSV and GData JSON export** that writes translations back to mod-ready localization files
- **Version history** with timestamped backups and point-in-time restoration
- **DLL string extraction** for mods that embed localization strings in .NET assemblies
- **Duplicate file consolidation** that detects and merges redundant CSV files on sync
- **Progress tracking** with per-mod percentage bars and change detection via source text hashing
- **Dashboard** with search, filtering, and at-a-glance status for all installed Workshop mods
- **Local LLM management** with built-in Ollama and llama.cpp process control, model downloading, and VRAM tier presets
- **Dark glassmorphism UI** with a frosted-glass card design

## Architecture Overview

```text
Frontend (React + Vite)              Backend (FastAPI + Uvicorn)
http://localhost:5173                http://localhost:8000/api
┌─────────────────────┐              ┌──────────────────────────┐
│  Dashboard          │              │  Web Server (REST + SSE) │
│  Mod Detail         │◄────JSON────►│    ├─ Mod Router         │
│  Glossary           │              │    ├─ Translation Router  │
│  Settings           │              │    ├─ Glossary Router     │
│  Statistics         │              │    ├─ Settings Router     │
│                     │              │    └─ Provider Routers    │
└─────────────────────┘              ├──────────────────────────┤
                                     │  Game Adapter Layer      │
                                     │    └─ Chrono Ark Adapter │
                                     ├──────────────────────────┤
                                     │  Translation Providers   │
                                     │    ├─ Claude             │
                                     │    ├─ OpenAI             │
                                     │    ├─ DeepL              │
                                     │    ├─ Ollama             │
                                     │    ├─ llama.cpp          │
                                     │    └─ Manual             │
                                     ├──────────────────────────┤
                                     │  Data Layer              │
                                     │    ├─ Translation Memory │
                                     │    ├─ Glossary Manager   │
                                     │    ├─ Progress Tracker   │
                                     │    ├─ History Manager    │
                                     │    └─ Suggestion Manager │
                                     ├──────────────────────────┤
                                     │  Extractors              │
                                     │    ├─ CSV Extractor      │
                                     │    ├─ DLL Extractor      │
                                     │    └─ GData Extractor    │
                                     └──────────────────────────┘
                                                  │
                                     ┌────────────┴────────────┐
                                     │  File-Based Storage     │
                                     │  storage/               │
                                     │    ├─ glossary.json     │
                                     │    ├─ translation_      │
                                     │    │  memory.json       │
                                     │    └─ mods/{mod_id}/    │
                                     │        ├─ source.json   │
                                     │        ├─ translations  │
                                     │        │  .json         │
                                     │        ├─ progress.json │
                                     │        ├─ glossary.json │
                                     │        ├─ history/      │
                                     │        └─ export/       │
                                     └─────────────────────────┘
```

The frontend communicates with the backend exclusively through REST API calls and Server-Sent Events (SSE) for streaming operations. All persistent data is stored as JSON files on the local filesystem with no database required.

### Game Adapter Layer

The backend uses an adapter pattern (`backend/games/base.py`) that abstracts game-specific logic behind a common interface. The Chrono Ark adapter (`backend/games/chrono_ark/`) provides:

- **Mod scanning** of the Steam Workshop directory to discover installed mods
- **CSV column schema** defining the language columns (Key, Type, Desc, Korean, English, Japanese, Chinese, Chinese-TW)
- **Key-to-file mapping** that routes localization keys to their canonical CSV files (e.g., `Skill/*` to `LangDataDB.csv`, `Dialogue/*` to `LangDialogueDB.csv`)
- **Format preservation rules** injected into LLM prompts to prevent corruption of game-specific placeholders like `&a` tags
- **Style examples** extracted from the base game for few-shot learning
- **Game description context** passed to LLMs for domain-appropriate translations

This adapter pattern means the tool could be extended to support other games by implementing a new adapter.

## Translation Pipeline

When a user clicks "Translate" on a mod, the following pipeline executes:

### 1. Preview and Cost Estimation

The frontend calls `POST /api/translate/preview` with the mod ID and selected provider. The backend:

1. Loads all extracted strings for the mod
2. Filters to only untranslated strings (missing English column)
3. Checks the translation memory cache for existing translations
4. Groups remaining strings by source language (priority order: Chinese > Korean > Japanese > Chinese-TW)
5. Divides each language group into batches based on the configured batch size
6. Estimates cost per batch using the provider's token/character pricing model
7. Generates the full system prompt and per-batch user messages for inspection
8. Returns the batch plan, total cost estimate, and prompt previews

The user reviews the prompts and cost in a confirmation modal with tabbed navigation before proceeding.

### 2. Iterative Batch Processing

The `useIterativeTranslation` React hook manages a state machine that processes batches one at a time:

```text
idle → translating → [reviewing] → translating → ... → complete
                         ↑                                  │
                         └── (if suggestions exist) ────────┘
```

For each batch:

1. The frontend sends `POST /api/translate/batch` (or `/batch/stream` for local models)
2. The backend constructs the LLM prompt with:
   - A system prompt defining the translator role, format rules, glossary terms, character context, and style examples
   - A user message containing the batch of source strings as a JSON object
3. The provider returns a JSON response containing:
   - `translations`: a map of localization keys to English translations
   - `suggested_terms`: proposed glossary terms the LLM identified during translation
4. The backend fills duplicate translations (multiple keys with identical source text get the same translation)
5. Translations are saved to the mod's `translations.json` and progress is updated

### 3. Glossary Review Between Batches

If the LLM suggested new glossary terms, the pipeline pauses and presents them in a review modal. Each suggestion includes the English term, source text, language, category, and the LLM's reasoning. The user can:

- **Accept** individual terms (added to the mod glossary for subsequent batches)
- **Dismiss** terms they disagree with
- **Accept All** or **Dismiss All** in bulk

Accepted terms are included in the glossary context for all remaining batches, improving consistency as translation progresses.

### 4. Streaming for Local Models

When using Ollama or llama.cpp, translation uses Server-Sent Events for real-time progress:

- The backend streams token-by-token output from the local model
- The frontend displays tokens per second, elapsed time, and a live progress indicator
- The user can cancel mid-stream via an AbortController

Cloud providers (Claude, OpenAI, DeepL) return complete responses without streaming.

## Glossary System

The glossary system ensures consistent terminology across translations using two tiers:

### Global Glossary

Built automatically from the base game's localization files. The build process:

1. Reads all `_Name` entries from the base game's CSV files
2. Categorizes terms by key prefix (e.g., `Buff/` → buffs, `Skill/` → skills, `Character/` → characters)
3. Extracts source language mappings (Korean, Chinese, Japanese) for each English term
4. Seeds universal mechanic terms (Debuff, Buff, Weakening, etc.) that appear across mods

The global glossary is read-only in the UI and serves as the foundation for translation consistency.

### Per-Mod Glossary

Each mod has its own glossary overlay. Users can:

- **Add terms** with an English name, source text, source language, and category
- **Edit terms** to rename or update source mappings
- **Delete terms** individually or clear all at once
- **Apply terms** with a bulk-replace operation that previews affected strings before applying

Per-mod terms override global terms and are injected into the LLM prompt alongside the global glossary.

### AI-Generated Suggestions

During translation, LLM providers analyze the source text and propose new glossary terms they identify as recurring or significant. Suggestions are:

- Filtered to ensure the term actually appears in the source content (not just in key names)
- Stored in `pending_suggestions.json` until reviewed
- Presented between batches or accessible via the "Suggestions" button
- Automatically included in future prompts once accepted

## Translation Memory

The translation memory acts as a persistent cache indexed by SHA-256 hashes of source text:

```text
source_text → SHA-256 hash → cached English translation
```

- Before sending strings to a provider, the system checks the memory for existing translations
- Cache hits are free and instant, avoiding redundant API calls
- The memory persists across sessions in `translation_memory.json`
- Global statistics track total entries, session hits/misses, and hit rate percentage
- Identical source strings across different mods share the same cached translation

## Mod Discovery and String Extraction

### Mod Scanning

The Chrono Ark adapter scans the Steam Workshop directory for installed mods. For each mod folder it:

1. Reads `ChronoArkMod.json` for metadata (name, author)
2. Discovers `Localization/*.csv` files
3. Discovers `Assemblies/*.dll` files (excluding known framework dependencies)
4. Samples CSV content to detect if English translations are already populated
5. Counts total localization entries

### CSV Extraction

The CSV extractor (`backend/games/chrono_ark/csv_extractor.py`) handles the game's localization CSV format with several robustness features:

- **UTF-8 BOM detection** for proper encoding handling
- **Multiline row stitching** that detects rows split across line boundaries and merges them back together
- **Column shift correction** using character script analysis to validate that language columns contain the expected scripts (e.g., Korean characters in the Korean column)
- **Oversized row merging** that fixes malformed rows with too many columns by strategically merging at the right positions

Each extracted string becomes a `LocString` with the key, type, description, all language translations, and the source CSV filename.

### DLL Extraction

For mods that embed strings in .NET assemblies, the DLL extractor (`backend/games/chrono_ark/dll_extractor.py`):

1. Uses the `dotnetfile` library to read .NET metadata without runtime execution
2. Extracts strings from the #US (User Strings) heap
3. Analyzes IL bytecode to find `ldstr` instruction pairs that represent key/value patterns
4. Filters by minimum string length to exclude noise

### GData/JSON Extraction

Some mods use Game Data Editor JSON files. The GData extractor (`backend/games/chrono_ark/gdata_extractor.py`):

1. Parses `gdata/Add/*.json` files containing game object definitions
2. Extracts scalar fields (Name, Description) from each object
3. Processes dialogue arrays (battle idle text, story text, etc.)
4. Maps extracted fields to CSV-compatible keys using a suffix mapping system

## Supported Translation Providers

| Provider               | Type        | Streaming | Glossary Suggestions | Cost          |
| ---------------------- | ----------- | --------- | -------------------- | ------------- |
| **Claude** (Anthropic) | Cloud API   | Yes       | Yes                  | Per-token     |
| **OpenAI**             | Cloud API   | No        | Yes                  | Per-token     |
| **DeepL**              | Cloud API   | No        | No                   | Per-character |
| **Ollama**             | Local LLM   | Yes (SSE) | Yes                  | Free          |
| **llama.cpp**          | Local LLM   | Yes (SSE) | Yes                  | Free          |
| **Manual**             | JSON export | N/A       | N/A                  | Free          |

### Cloud Providers

Cloud providers (Claude, OpenAI, DeepL) require API keys configured in the Settings page. Keys are stored in the `.env` file and masked in the UI (showing only the last 4 characters). Cost estimation uses each provider's token/character pricing model.

### Local Providers

Ollama and llama.cpp can be fully managed from the Settings page:

- **Installation**: Download and install the binary directly from the UI
- **Model management**: Browse available models, download GGUF files from Hugging Face with streaming progress
- **VRAM tier presets**: Quick-select buttons (4-6GB, 8GB, 12GB, 16GB, 24GB+) that configure appropriate model sizes and GPU layer settings
- **Process control**: Start and stop the local server with stdout/stderr logging
- **Status polling**: Automatic connection checks every 10 seconds
- **GPU offloading**: Configurable GPU layer count for llama.cpp (`-1` for full offload)

### Manual Mode

Exports untranslated strings as a JSON file for offline human translation, with no API calls involved.

### LLM Prompt Structure

All LLM providers (Claude, OpenAI, Ollama, llama.cpp) receive identical prompt templates containing:

1. **Role definition**: Professional game translator specializing in the source language
2. **Game context**: Description of Chrono Ark as a roguelike deck-building game
3. **Format preservation rules**: Game-specific formatting constraints (e.g., preserve `&a` placeholders, maintain percentage values)
4. **Style examples**: Few-shot examples extracted from base game translations showing the expected tone and style
5. **Glossary context**: All applicable terms from both the global and per-mod glossaries
6. **Character context**: Optional lore metadata (source game, character name, background) for character mods
7. **Output format specification**: JSON schema for the expected response containing translations and suggested terms

## Export and Sync

After translating, the user syncs changes to produce mod-ready files:

1. Click "Sync Changes" on the mod detail page
2. The backend loads all saved translations from `translations.json`
3. Translations are applied to the extracted `LocString` objects
4. Strings are grouped by their source CSV file
5. CSV files are written to the mod's `export/` directory preserving the original column structure and encoding
6. An export hash is computed to track whether new changes exist since the last sync

The exported CSV files can be placed in the mod's `Localization/` folder for use in-game.

### Duplicate File Consolidation

If a mod has multiple CSV files for the same language, the system detects them and displays a warning. On the next sync, duplicates are automatically merged into a single canonical file per language.

### GData Export

For mods using Game Data Editor JSON, the export process writes translated values back into the JSON structure while preserving the original file format.

## Backup and History

Before destructive operations (reset, clear translations), the system automatically creates a backup snapshot containing:

- `translations.json` - All current translations
- `glossary.json` - Per-mod glossary terms
- `pending_suggestions.json` - Unreviewed glossary suggestions
- `meta.json` - Timestamp and reason for the backup

Backups are stored in `storage/mods/{mod_id}/history/{timestamp}/` with a maximum retention of 20 backups per mod. Users can browse history entries and restore to any previous state.

## Configuration

All configuration uses environment variables with a `CATL_` prefix, persisted in `backend/.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `CATL_STORAGE_PATH` | `backend/storage` | Local data storage directory |
| `CATL_BASE_GAME_PATH` | *(Steam default)* | Path to Chrono Ark game data |
| `CATL_WORKSHOP_PATH` | *(Steam default)* | Path to Steam Workshop content |
| `CATL_TRANSLATION_PROVIDER` | `claude` | Active translation provider |
| `CATL_BATCH_SIZE` | `100` | Strings per translation batch |
| `CATL_ANTHROPIC_API_KEY` | | Claude API key |
| `CATL_OPENAI_API_KEY` | | OpenAI API key |
| `CATL_DEEPL_API_KEY` | | DeepL API key |
| `CATL_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `CATL_OLLAMA_MODEL` | `qwen2.5:7b` | Ollama model name |
| `CATL_LLAMACPP_BASE_URL` | `http://localhost:8080` | llama.cpp server URL |
| `CATL_LLAMACPP_GPU_LAYERS` | `-1` | GPU layers to offload (-1 = all) |
| `CATL_LLAMACPP_CTX_SIZE` | `8192` | Context window size |
| `CATL_ACTIVE_GAME` | `chrono_ark` | Game adapter to use |

Settings can be changed at runtime through the Settings page without restarting the server.

## Getting Started

### Prerequisites

- **Node.js** (v18+) and **Yarn**
- **Python 3.12+**
- **Chrono Ark** installed via Steam with Workshop mods subscribed

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/steve1316/chrono-ark-translator.git
   cd chrono-ark-translator
   ```

2. Install frontend dependencies:
   ```bash
   yarn install
   ```

3. Install backend dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. Create `backend/.env` and configure your paths and API keys:
   ```env
   CATL_BASE_GAME_PATH=C:\path\to\SteamLibrary\steamapps\common\Chrono Ark\ChronoArk_Data\StreamingAssets
   CATL_WORKSHOP_PATH=C:\path\to\SteamLibrary\steamapps\workshop\content\1188930
   CATL_ANTHROPIC_API_KEY=your-key-here
   ```

5. Start both frontend and backend:
   ```bash
   yarn start
   ```

6. Open `http://localhost:5173` in your browser.

### CLI Usage

The backend also provides a CLI for headless operations:

```bash
python -m backend.main extract --base-game     # Extract base game strings
python -m backend.main translate --mod <id>    # Translate a mod
python -m backend.main status                  # Show translation status
python -m backend.main glossary --show         # Display glossary
python -m backend.main export --mod <id>       # Export translations to CSV
```
