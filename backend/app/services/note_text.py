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
# Tables do not nest in the editor, so a block stops at the next opening tag. Without this, many unclosed
# `<table>` tags make the run time grow with the square of the input.
# The attribute part has no `<` either, so many unclosed `<table ` stop at the next `<` (linear run time).
_TABLE_BLOCK = re.compile(r"<table\b[^<>]*>(?:(?!<table\b).)*?</table>", re.IGNORECASE | re.DOTALL)
_TABLE_ROW = re.compile(r"<tr\b[^<>]*>((?:(?!<tr\b).)*?)</tr>", re.IGNORECASE | re.DOTALL)
_TABLE_CELL = re.compile(r"<t[hd]\b[^<>]*>((?:(?!<t[hd]\b).)*?)</t[hd]>", re.IGNORECASE | re.DOTALL)
_BLOCK_BREAK_TAG = re.compile(r"<br\s*/?>|</(?:p|li|pre|blockquote)>", re.IGNORECASE)
# A tag starts with a letter, `/` or `!`, so "a < b and c > d" and "x <= y" are not read as tags. The body
# has no `<`, so many unclosed `<a ` stop at the next `<` (linear run time).
_ANY_TAG = re.compile(r"</?[A-Za-z!][^<>]*>")


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
_DETAILS_TAG = re.compile(r"</?(?:details|summary)\b[^<>]*>[ \t]*\n?", re.IGNORECASE)


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
_LINE_PREFIX = re.compile(
    r"^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?", re.MULTILINE
)
_RULE_LINE = re.compile(r"^[ \t]*(?:[-*_][ \t]*){3,}$", re.MULTILINE)
# Bounded character classes and spans: an unbounded `.+?` or `[^)]*` makes the run time grow with the
# square of the input on a note with many unclosed marks.
_IMAGE = re.compile(r"!\[([^\[\]\n]*)\]\([^()\n]*\)")
_LINK = re.compile(r"\[([^\[\]\n]+)\]\([^()\n]*\)")
# Marks that are emphasis even inside a word: `**bold**`, `~~strike~~`.
_EMPHASIS_ANYWHERE = re.compile(r"(\*\*|~~)(?=\S)(.{1,300}?)(?<=\S)\1")
# `*` and `_` do not open emphasis inside a word (CommonMark), so `snake_case_name` and `2*3*4` stay as they are.
_EMPHASIS_AT_WORD_EDGE = re.compile(r"(?<!\w)(\*|__?)(?=\S)(.{1,300}?)(?<=\S)\1(?!\w)")

# Code is literal: `__init__` and `List<String>` must not lose characters to the rules above. Code is
# swapped for a placeholder before they run and put back after. The placeholder is a private-use
# character plus an index, so no rule can match it. Fence lines are dropped, the code text stays.
_PLACEHOLDER_OPEN = "\ue000"
_PLACEHOLDER_CLOSE = "\ue001"
_PLACEHOLDER = re.compile(f"{_PLACEHOLDER_OPEN}(\\d+){_PLACEHOLDER_CLOSE}")
_FENCE_OPEN = re.compile(r"[ \t]*(?:(`{3,})[^`]*|(~{3,}).*)")
_FENCE_CLOSE = re.compile(r"[ \t]*(`{3,}|~{3,})[ \t]*")
# A newline or a backtick ends the span, so many unclosed backticks stay linear.
_INLINE_CODE = re.compile(r"`([^`\n]{1,300})`")


def _stash(code: list[str], text: str) -> str:
    code.append(text)
    return f"{_PLACEHOLDER_OPEN}{len(code) - 1}{_PLACEHOLDER_CLOSE}"


def _stash_fenced_blocks(text: str, code: list[str]) -> str:
    """Replace each fenced block (fence lines and body) by one placeholder holding the body."""
    out: list[str] = []
    body: list[str] = []
    fence = ""  # marker of the open fence, "" when outside a block
    for line in text.splitlines():
        if not fence:
            opening = _FENCE_OPEN.fullmatch(line)
            if opening is None:
                out.append(line)
            else:
                fence = opening.group(1) or opening.group(2)
            continue
        closing = _FENCE_CLOSE.fullmatch(line)
        # CommonMark: the closing fence uses the same character and is at least as long.
        if closing is not None and closing.group(1)[0] == fence[0] and len(closing.group(1)) >= len(fence):
            out.append(_stash(code, "\n".join(body)) if body else "")
            body, fence = [], ""
        else:
            body.append(line)
    if fence and body:  # an unclosed fence runs to the end of the note
        out.append(_stash(code, "\n".join(body)))
    return "\n".join(out)


def markdown_to_plain_text(text_content: str) -> str:
    """Note markdown -> the text a reader sees, on one line. For search snippets.

    Best effort with regexes, not a full parser: an odd construct can keep a stray mark.
    Inline code and fenced blocks are kept as written, without their backticks and fence lines.
    """
    code: list[str] = []
    # A stray placeholder character in the note must not be read as a placeholder.
    text = text_content.replace(_PLACEHOLDER_OPEN, "").replace(_PLACEHOLDER_CLOSE, "")
    text = _stash_fenced_blocks(text, code)
    text = _INLINE_CODE.sub(lambda match: _stash(code, match.group(1)), text)
    text = clean_note_for_embedding(text)
    text = _RULE_LINE.sub("", text)
    text = _LINE_PREFIX.sub("", text)
    text = _IMAGE.sub(r"\1", text)
    text = _LINK.sub(r"\1", text)
    text = _EMPHASIS_ANYWHERE.sub(r"\2", text)
    text = _EMPHASIS_AT_WORD_EDGE.sub(r"\2", text)
    # Entities are decoded before the code comes back: `&amp;` typed inside code stays as typed.
    text = html.unescape(_ANY_TAG.sub("", text))
    text = _PLACEHOLDER.sub(lambda match: code[int(match.group(1))], text)
    return " ".join(text.split())
