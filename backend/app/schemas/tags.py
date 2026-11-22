MAX_TAGS = 10
TAG_MAX_CHARS = 25


def normalize_tags(tags: list[str]) -> list[str]:
    """Trim, lowercase, drop empty tags and duplicates (first one wins), then check the limits."""
    cleaned = list(dict.fromkeys(tag.strip().lower() for tag in tags if tag.strip()))
    if len(cleaned) > MAX_TAGS:
        raise ValueError(f"You can add at most {MAX_TAGS} tags")
    too_long = next((tag for tag in cleaned if len(tag) > TAG_MAX_CHARS), None)
    if too_long is not None:
        raise ValueError(f"Tag '{too_long}' is longer than {TAG_MAX_CHARS} characters")
    return cleaned
