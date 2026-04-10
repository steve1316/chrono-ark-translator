"""
Ollama local LLM translation provider.

Translates source language text to English using a locally-running Ollama
instance via its native /api/chat endpoint. No API key or cost.
"""

import json
import time
from threading import Event
from typing import Generator, Optional
import requests
from backend import config
from backend.translator.base import TranslationProvider


class OllamaProvider(TranslationProvider):
    """Translation provider using a local Ollama instance.

    Uses Ollama's native /api/chat endpoint to translate game mod text from a
    source language to English. Supports glossary enforcement, style
    examples, character context, and automatic glossary term suggestions.

    Attributes:
        _base_url: Ollama server base URL.
        _model: Ollama model name to use for requests.
    """

    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        """Initialize the Ollama provider.

        Args:
            base_url: Ollama server base URL. Defaults to config value.
            model: Ollama model name. Defaults to config value.
        """
        self._base_url = base_url or config.OLLAMA_BASE_URL
        self._model = model or config.OLLAMA_MODEL

    @property
    def name(self) -> str:
        return f"Ollama ({self._model})"

    @property
    def supports_streaming(self) -> bool:
        return True

    def _unload_model(self) -> None:
        """Tell Ollama to unload the model from GPU memory immediately."""
        try:
            requests.post(
                f"{self._base_url}/api/chat",
                json={"model": self._model, "messages": [], "keep_alive": 0},
                timeout=5,
            )
        except Exception:
            pass

    def translate_batch(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
    ) -> tuple[dict[str, str], list[dict]]:
        """Translate a batch of strings via Ollama's /api/chat endpoint.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g. `"Korean"`).
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.
            style_examples: Dict of category -> [(source, english)] pairs.
            character_context: Character background info dict.

        Returns:
            A tuple of (translations dict mapping key to English text,
            suggested_terms list of dicts).

        Raises:
            RuntimeError: If Ollama is unreachable.
        """
        system_prompt, user_message = self.build_prompt(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )

        # Estimate token count to set an adequate context window.
        # Ollama defaults to a small num_ctx (2048-4096) which silently
        # truncates the prompt for large batches.
        prompt_chars = len(system_prompt) + len(user_message)
        estimated_tokens = int(prompt_chars / 3) + 8192  # headroom for output
        num_ctx = max(8192, ((estimated_tokens + 1023) // 1024) * 1024)

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "options": {
                "num_ctx": num_ctx,
                "temperature": 0.3,
                "num_predict": 8192,
            },
            "stream": False,
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                resp = requests.post(
                    f"{self._base_url}/api/chat",
                    json=payload,
                    timeout=600,
                )
                resp.raise_for_status()
                data = resp.json()

                raw_text = data.get("message", {}).get("content", "")
                translations, suggestions = self._parse_response(raw_text, entries)

                in_tok = data.get("prompt_eval_count")
                out_tok = data.get("eval_count")

                self.last_raw_responses = getattr(self, "last_raw_responses", [])
                self.last_raw_responses.append(
                    {
                        "batch_index": len(self.last_raw_responses),
                        "model": self._model,
                        "input_tokens": in_tok,
                        "output_tokens": out_tok,
                        "cost_usd": 0.0,
                        "raw_text": raw_text,
                    }
                )
                return translations, suggestions

            except requests.ConnectionError:
                raise RuntimeError(f"Cannot connect to Ollama at {self._base_url}. Is Ollama running?")
            except requests.HTTPError as e:
                if attempt == max_retries - 1:
                    print(f"  Ollama API error after {max_retries} retries: {e}")
                    return {}, []
                wait_time = 2**attempt * 2
                time.sleep(wait_time)

        return {}, []

    def translate_batch_stream(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
        cancel_event: Event | None = None,
    ) -> Generator[dict, None, None]:
        """Stream translation via Ollama's `/api/chat` endpoint.

        Yields `progress` events every 0.5 s with token counts and speed,
        followed by a single `complete` event.  If `cancel_event` is set
        mid-stream, the HTTP connection to Ollama is closed immediately and
        a `cancelled` event is yielded.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g. `"Korean"`).
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.
            style_examples: Dict of category -> [(source, english)] pairs.
            character_context: Character background info dict.
            cancel_event: When set, aborts the request and closes the
                HTTP connection.

        Yields:
            Dicts with a `"type"` key. Types: `"started"`, `"progress"`,
            `"complete"`, `"cancelled"`, `"error"`, `"retry"`.
        """
        system_prompt, user_message = self.build_prompt(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )

        prompt_chars = len(system_prompt) + len(user_message)
        estimated_tokens = int(prompt_chars / 3) + 8192
        num_ctx = max(8192, ((estimated_tokens + 1023) // 1024) * 1024)

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "options": {
                "num_ctx": num_ctx,
                "temperature": 0.3,
                "num_predict": 8192,
            },
            "stream": True,
        }

        yield {"type": "started", "model": self._model, "num_entries": len(entries)}

        max_retries = 3
        for attempt in range(max_retries):
            try:
                resp = requests.post(
                    f"{self._base_url}/api/chat",
                    json=payload,
                    timeout=600,
                    stream=True,
                )
                resp.raise_for_status()

                accumulated_text = ""
                tokens_generated = 0
                start_time = time.time()
                last_progress_time = 0.0
                in_tok = None
                out_tok = None

                for line in resp.iter_lines(decode_unicode=True):
                    if cancel_event and cancel_event.is_set():
                        resp.close()
                        self._unload_model()
                        yield {"type": "cancelled"}
                        return

                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if chunk.get("done"):
                        in_tok = chunk.get("prompt_eval_count")
                        out_tok = chunk.get("eval_count")
                        break

                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        accumulated_text += token
                        tokens_generated += 1

                        now = time.time()
                        if now - last_progress_time >= 0.5:
                            elapsed = now - start_time
                            yield {
                                "type": "progress",
                                "tokens_generated": tokens_generated,
                                "elapsed_sec": round(elapsed, 1),
                                "tokens_per_sec": round(tokens_generated / elapsed, 1) if elapsed > 0 else 0,
                            }
                            last_progress_time = now

                translations, suggestions = self._parse_response(accumulated_text, entries)

                self.last_raw_responses = getattr(self, "last_raw_responses", [])
                self.last_raw_responses.append(
                    {
                        "batch_index": len(self.last_raw_responses),
                        "model": self._model,
                        "input_tokens": in_tok,
                        "output_tokens": out_tok,
                        "cost_usd": 0.0,
                        "raw_text": accumulated_text,
                    }
                )

                yield {
                    "type": "complete",
                    "translations": translations,
                    "suggestions": suggestions,
                    "input_tokens": in_tok,
                    "output_tokens": out_tok,
                }
                return

            except requests.ConnectionError:
                yield {"type": "error", "message": f"Cannot connect to Ollama at {self._base_url}. Is Ollama running?"}
                return
            except requests.HTTPError as e:
                if attempt == max_retries - 1:
                    yield {"type": "error", "message": f"Ollama API error after {max_retries} retries: {e}"}
                    return
                yield {"type": "retry", "attempt": attempt + 1, "max_retries": max_retries}
                time.sleep(2**attempt * 2)

        yield {"type": "error", "message": "Translation failed after all retries"}

    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        """Estimate token usage for translating the given entries.

        Args:
            entries: List of (key, source_text) tuples.
            **kwargs: Provider-specific context (`source_lang`,
                `glossary_prompt`, `game_context`, etc.).

        Returns:
            A dict with `estimated_input_tokens`, `estimated_output_tokens`,
            `estimated_cost_usd` (always 0.0), `model`, and `note`.
        """
        source_lang = kwargs.get("source_lang", "Korean")
        glossary_prompt = kwargs.get("glossary_prompt", "")
        game_context = kwargs.get("game_context", "")
        format_rules = kwargs.get("format_rules")
        style_examples = kwargs.get("style_examples")
        character_context = kwargs.get("character_context")

        system_prompt, user_message = self.build_prompt(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )
        full_prompt = system_prompt + user_message

        cjk_chars = sum(1 for c in full_prompt if "\u2e80" <= c <= "\u9fff" or "\uac00" <= c <= "\ud7af" or "\uff00" <= c <= "\uffef")
        ascii_chars = len(full_prompt) - cjk_chars
        estimated_input_tokens = int(cjk_chars * 1.5 + ascii_chars * 0.35) + 300

        output_chars = sum(len(text) for _, text in entries)
        estimated_output_tokens = int(output_chars * 1.5) + 500

        return {
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "estimated_cost_usd": 0.0,
            "model": self._model,
            "note": f"Ollama local inference — no API cost ({len(entries)} strings, ~{estimated_input_tokens + estimated_output_tokens} tokens)",
        }
