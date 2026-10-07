"""Note markdown -> plain text.

Pure functions, no app imports: `embedding_service` and `note_service` both use them,
and `embedding_service` already imports `note_service`.
"""

from __future__ import annotations

import html
import re

# The note editor stores text colors as inline HTML: <span data-color="red" data-bg="yellow">.
# Only the tags are removed; the text inside them stays. Tags carry no meaning for
# search and would only add noise tokens to the embeddings.
_COLOR_SPAN_TAG = re.compile(r"</?span(?:\s+data-(?:color|bg)=\"[a-z]+\")*\s*>")


def strip_color_spans(text_content: str) -> str:
    """Remove the note editor's color <span> tags and keep their inner text."""
    return _COLOR_SPAN_TAG.sub("", text_content)


# The note editor stores tables as HTML (`<table><tr><td>..</td></tr></table>`, with data-* and
# colwidth attributes). Raw tags would add noise tokens and split rows badly, so each table
# becomes plain text: cells separated by " | ", rows by newlines.
_TABLE_BLOCK = re.compile(r"<table\b[^>]*>.*?</table>", re.IGNORECASE | re.DOTALL)
_TABLE_ROW = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_TABLE_CELL = re.compile(r"<t[hd]\b[^>]*>(.*?)</t[hd]>", re.IGNORECASE | re.DOTALL)
_BLOCK_BREAK_TAG = re.compile(r"<br\s*/?>|</(?:p|li|pre|blockquote)>", re.IGNORECASE)
_ANY_TAG = re.compile(r"<[^>]+>")


def _cell_to_text(cell_html: str) -> str:
    """Plain text of one cell: tags removed, entities decoded, whitespace collapsed to one line."""
    spaced = _BLOCK_BREAK_TAG.sub(" ", cell_html)
    return " ".join(html.unescape(_ANY_TAG.sub("", spaced)).split())


def _table_to_text(table_html: str) -> str:
    rows = [
        " | ".join(_cell_to_text(cell) for cell in _TABLE_CELL.findall(row)) for row in _TABLE_ROW.findall(table_html)
    ]
    return "\n".join(rows)


def tables_to_text(text_content: str) -> str:
    """Replace each HTML table with readable text: cells joined by " | ", rows by newlines."""
    return _TABLE_BLOCK.sub(lambda match: _table_to_text(match.group(0)), text_content)


# Callouts are GitHub alerts: a quote whose first line is only a marker, `> [!TIP]`. The marker line
# is dropped (the callout text on the next lines stays). Toggles are `<details><summary>..</summary>..</details>`:
# the tags are dropped and the title and the content stay.
_CALLOUT_MARKER_LINE = re.compile(
    r"^(?:[ \t]*>)+[ \t]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)",
    re.IGNORECASE | re.MULTILINE,
)
_DETAILS_TAG = re.compile(r"</?(?:details|summary)\b[^>]*>[ \t]*\n?", re.IGNORECASE)


def _details_tag_replacement(match: re.Match[str]) -> str:
    # A title must not run into the first word of the content: the closing summary tag becomes a newline.
    return "\n" if match.group(0).lower().startswith("</summary") else ""


def strip_callouts_and_toggles(text_content: str) -> str:
    """Remove callout marker lines and toggle tags. The text inside them is kept."""
    return _DETAILS_TAG.sub(_details_tag_replacement, _CALLOUT_MARKER_LINE.sub("", text_content))


def clean_note_for_embedding(text_content: str) -> str:
    """Note markdown -> text for embeddings. Tables first, because cells can hold color spans."""
    return strip_callouts_and_toggles(strip_color_spans(tables_to_text(text_content)))


# Markdown syntax that only marks up text. Removing it keeps the words a reader sees.
_FENCE_LINE = re.compile(r"^[ \t]*(?:```|~~~).*$", re.MULTILINE)
_LINE_PREFIX = re.compile(
    r"^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?", re.MULTILINE
)
_RULE_LINE = re.compile(r"^[ \t]*(?:[-*_][ \t]*){3,}$", re.MULTILINE)
_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_EMPHASIS = re.compile(r"(\*\*|__|~~|\*|_|`)(?=\S)(.+?)(?<=\S)\1")


def markdown_to_plain_text(text_content: str) -> str:
    """Note markdown -> the text a reader sees, on one line. For search snippets.

    Best effort with regexes, not a full parser: an odd construct can keep a stray mark.
    """
    text = clean_note_for_embedding(text_content)
    text = _FENCE_LINE.sub("", text)
    text = _RULE_LINE.sub("", text)
    text = _LINE_PREFIX.sub("", text)
    text = _IMAGE.sub(r"\1", text)
    text = _LINK.sub(r"\1", text)
    text = _EMPHASIS.sub(r"\2", text)
    text = html.unescape(_ANY_TAG.sub("", text))
    return " ".join(text.split())
