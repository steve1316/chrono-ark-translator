"""Pydantic request/response models for the REST API."""

from typing import Optional
from pydantic import BaseModel


class GlossaryTerm(BaseModel):
    """A global glossary term mapping a source-language word to its English translation.

    Attributes:
        source: The original term in the source language.
        english: The English translation of the term.
    """

    source: str
    english: str


class ModGlossaryTerm(BaseModel):
    """A mod-specific glossary term with per-language source mappings.

    Attributes:
        english: The English translation of the term.
        source_mappings: Mapping of source language codes to the original term
            in each language (e.g. `{"Korean": "마법"}`).
        category: The category for this term (e.g. `"custom"`, `"skill"`).
    """

    english: str
    source_mappings: dict[str, str] = {}
    category: str = "custom"


class SuggestionAction(BaseModel):
    """Payload for accepting or dismissing glossary term suggestions.

    Attributes:
        terms: List of specific English term strings to act on.
        all: If `True`, the action applies to every pending suggestion
            regardless of `terms`.
    """

    terms: list[str] = []
    all: bool = False


class TranslationRequest(BaseModel):
    """Request body for translation, estimation, and preview endpoints.

    Attributes:
        mod_id: The unique workshop identifier of the mod to translate.
        provider: Optional override for the translation provider name.
            Defaults to the value in `config.TRANSLATION_PROVIDER` when
            `None`.
    """

    mod_id: str
    provider: Optional[str] = None


class BatchTranslationRequest(BaseModel):
    """Request body for translating a single batch of strings.

    Attributes:
        mod_id: The unique workshop identifier of the mod to translate.
        provider: Optional override for the translation provider name.
        keys: Explicit localization keys to translate in this batch.
        source_lang: The source language for all keys in this batch.
        is_first_batch: When True, creates a backup before translating.
    """

    mod_id: str
    provider: Optional[str] = None
    keys: list[str]
    source_lang: str
    is_first_batch: bool = False


class TranslationUpdate(BaseModel):
    """Payload for manually updating a single translated string.

    Attributes:
        key: The localization key identifying the string (e.g.
            `"LangDataDB::Skill_FireBall::Desc"`).
        english: The new English translation text. An empty string clears
            the existing translation.
    """

    key: str
    english: str


class CharacterContext(BaseModel):
    """Optional character lore context used to improve translation quality.

    Attributes:
        source_game: The name of the game the character originates from.
        character_name: The character's display name.
        background: Free-text description of the character's lore, personality,
            or speech style that should inform translations.
    """

    source_game: str = ""
    character_name: str = ""
    background: str = ""


class SettingsResponse(BaseModel):
    """Current application settings returned by GET /api/settings.

    Attributes:
        provider: Active translation provider ID (claude, openai, deepl, ollama, manual).
        batch_size: Number of strings sent per API request.
        anthropic_api_key_set: Masked Anthropic key (e.g. `"••••ab12"`)
            or empty string if not configured.
        openai_api_key_set: Masked OpenAI key or empty string.
        deepl_api_key_set: Masked DeepL key or empty string.
        ollama_base_url: Ollama server base URL.
        ollama_model: Selected Ollama model name.
        ollama_vram_tier: Selected VRAM tier (e.g. `"8gb"`).
        ollama_status: Ollama status — `"running"`, `"stopped"`, or `"not_installed"`.
        llamacpp_base_url: llama-server base URL.
        llamacpp_model: Display-only model name for llama-server.
        llamacpp_binary_path: Path to the llama-server binary.
        llamacpp_model_path: Path to the GGUF model file.
        llamacpp_gpu_layers: Number of layers to offload to GPU (-1 = all).
        llamacpp_ctx_size: Context window size for llama-server.
        ollama_managed: Whether this app spawned the running Ollama process.
        llamacpp_managed: Whether this app spawned the running llama-server process.
        ignored_mods: List of workshop mod IDs hidden from the dashboard.
    """

    provider: str
    batch_size: int
    anthropic_api_key_set: str
    openai_api_key_set: str
    deepl_api_key_set: str
    ollama_base_url: str
    ollama_model: str
    ollama_vram_tier: str
    ollama_status: str
    llamacpp_base_url: str
    llamacpp_model: str
    llamacpp_binary_path: str
    llamacpp_model_path: str
    llamacpp_gpu_layers: int
    llamacpp_ctx_size: int
    llamacpp_vram_tier: str
    ollama_managed: bool
    llamacpp_managed: bool
    ignored_mods: list[str]


class SettingsUpdate(BaseModel):
    """Payload for POST /api/settings.

    All fields are optional — only include fields that should change.
    Omitted (`None`) fields are left at their current values.

    Attributes:
        provider: New translation provider ID.
        batch_size: New batch size (must be >= 1).
        anthropic_api_key: New Anthropic API key value.
        openai_api_key: New OpenAI API key value.
        deepl_api_key: New DeepL API key value.
        ollama_base_url: New Ollama base URL.
        ollama_model: New Ollama model name.
        ollama_vram_tier: New VRAM tier selection.
        llamacpp_base_url: New llama-server base URL.
        llamacpp_model: New llama-server display model name.
        llamacpp_binary_path: New llama-server binary path.
        llamacpp_model_path: New GGUF model file path.
        llamacpp_gpu_layers: New GPU layer count (-1 = all).
        llamacpp_ctx_size: New context window size.
        ignored_mods: New list of workshop mod IDs to hide from the dashboard.
    """

    provider: Optional[str] = None
    batch_size: Optional[int] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    deepl_api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_vram_tier: Optional[str] = None
    llamacpp_base_url: Optional[str] = None
    llamacpp_model: Optional[str] = None
    llamacpp_binary_path: Optional[str] = None
    llamacpp_model_path: Optional[str] = None
    llamacpp_gpu_layers: Optional[int] = None
    llamacpp_ctx_size: Optional[int] = None
    llamacpp_vram_tier: Optional[str] = None
    ignored_mods: Optional[list[str]] = None


class GlossaryReplacePreview(BaseModel):
    """Request body for previewing glossary term replacements.

    Attributes:
        old_english: The current English term to find in translations.
        new_english: The replacement English term.
    """

    old_english: str
    new_english: str


class OllamaPullRequest(BaseModel):
    """Request body for POST /api/ollama/pull.

    Attributes:
        model: The Ollama model name to pull (e.g. `"qwen2.5:7b"`).
    """

    model: str


class LlamaCppInstallRequest(BaseModel):
    """Request body for POST /api/llamacpp/install.

    Attributes:
        backend: GPU backend to download (e.g. `"vulkan"`, `"cuda-12"`).
    """

    backend: str = "vulkan"


class GGUFDownloadRequest(BaseModel):
    """Request body for POST /api/llamacpp/download.

    Attributes:
        url: URL to download the GGUF model from.
        filename: Target filename for the downloaded model.
    """

    url: str
    filename: str
