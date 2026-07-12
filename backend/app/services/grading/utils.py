"""Shared helpers for grading and challenge services."""


def effective_met(entry: dict[str, object]) -> bool:
    """Return the effective 'met' status, considering challenge overrides."""
    cr = entry.get("challenge_result")
    if cr is not None and isinstance(cr, dict) and cr.get("met") is not None:
        return bool(cr["met"])
    return bool(entry.get("met", False))
