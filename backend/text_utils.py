"""Shared text detection utilities."""


def has_cjk(s: str) -> bool:
    """Check if a string contains CJK, Hangul, or Kana characters.

    Args:
        s: The string to check.

    Returns:
        True if the string contains any CJK Unified Ideographs, CJK
        Extension A, Hangul Syllables, Hiragana, or Katakana characters.
    """
    for ch in s:
        cp = ord(ch)
        if (
            0x4E00 <= cp <= 0x9FFF  # CJK Unified Ideographs
            or 0x3400 <= cp <= 0x4DBF  # CJK Extension A
            or 0xAC00 <= cp <= 0xD7AF  # Hangul Syllables
            or 0x3040 <= cp <= 0x309F  # Hiragana
            or 0x30A0 <= cp <= 0x30FF  # Katakana
        ):
            return True
    return False
