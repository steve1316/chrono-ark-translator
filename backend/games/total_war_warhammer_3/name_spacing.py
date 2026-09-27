"""Split joined pinyin names in WH3 translations into one capitalized word per syllable.

Claude tends to write romanized Chinese names with their syllables run together ("Miaoying" for 妙影). The official game writes named characters and places
with spaces ("Miao Ying", "Yuan Bo"), so every new translation is passed through `space_pinyin_names` before it is saved.
"""

from __future__ import annotations

import itertools
import re
from collections.abc import Iterable

# Runs of Chinese characters in the source text.
_HAN_RUN_RE = re.compile(r"[一-鿿]+")

# A capitalized English word, e.g. "Miaoying" in "[Lord of Raging Gale] Miaoying's".
_WORD_RE = re.compile(r"(?<![A-Za-z])[A-Z][a-z]+(?![A-Za-z])")

# Names are 2 to 4 characters long. Single characters are never split.
_MIN_CHARS = 2
_MAX_CHARS = 4

# Most readings to try for one run of characters, so a run full of characters with several readings stays cheap.
_MAX_READINGS = 16


def _spaced_forms(source: str) -> dict[str, str]:
    """Map the joined pinyin of every 2 to 4 character run in `source` to its spaced, capitalized form.

    Args:
        source: The source text.

    Returns:
        Joined lowercase pinyin (e.g. `miaoying`) -> spaced form (e.g. `Miao Ying`). Longer runs win when two runs share a joined form.
    """
    from pypinyin import Style, pinyin

    forms: dict[str, str] = {}
    for run in _HAN_RUN_RE.findall(source):
        for length in range(min(_MAX_CHARS, len(run)), _MIN_CHARS - 1, -1):
            for start in range(len(run) - length + 1):
                readings = pinyin(run[start : start + length], style=Style.NORMAL, heteronym=True)
                for syllables in itertools.islice(itertools.product(*readings), _MAX_READINGS):
                    if all(s.isascii() and s.isalpha() for s in syllables):
                        forms.setdefault("".join(syllables).lower(), " ".join(s.capitalize() for s in syllables))
    return forms


def glossary_words(terms: Iterable[str]) -> frozenset[str]:
    """Collect the lowercase capitalized words of glossary terms, to pass as `keep` to `space_pinyin_names`.

    Args:
        terms: English glossary terms, e.g. "[Dragon General] Fu Yuanshan".

    Returns:
        Lowercase words such as `yuanshan`, so a name the glossary spells joined stays joined.
    """
    return frozenset(word.lower() for term in terms for word in _WORD_RE.findall(term))


def space_pinyin_names(source: str, english: str, keep: frozenset[str] = frozenset()) -> str:
    """Rewrite joined pinyin names in `english` with one capitalized word per syllable.

    Only a capitalized word that is exactly the joined pinyin of characters in this row's `source` changes, so ordinary English words, names from other
    rows, spellings that are not pinyin, and names that are already spaced or hyphenated are left alone.

    Args:
        source: The Chinese source text of the row.
        english: The English translation of the row.
        keep: Lowercase words to never split, usually from `glossary_words` so the mod glossary's spelling wins (e.g. "Fu Yuanshan").

    Returns:
        The translation with joined names split, e.g. "[Lord of Raging Gale] Miaoying" -> "[Lord of Raging Gale] Miao Ying".
    """
    if not source or not english or not _HAN_RUN_RE.search(source):
        return english
    forms = _spaced_forms(source)
    return _WORD_RE.sub(lambda m: m.group(0) if m.group(0).lower() in keep else forms.get(m.group(0).lower(), m.group(0)), english)
