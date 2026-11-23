"""Shared format rules for AI-written question text. The UI renders it as Markdown with math."""

# Raw strings: the text shows backslashes that the model must write itself.
# Implicit string concatenation, not a "\" line end: in a raw string that backslash would stay in the text.
CONTENT_FORMAT_PROMPT = (
    "Text format:\n"
    '- Question "prompt", multiple-choice "options" and rubric criteria ("point") are rendered as Markdown with '
    'math. Simple-question "answers" are NOT: keep them plain strings, because they are compared as plain text.\n'
    "- Code: use a fenced block with a language tag, for example ```python or ```sql. "
    "Use `backticks` for short inline code.\n"
    r"- Math: inline $x^2 + 1$, block $$\int_0^1 x\,dx = \frac{1}{2}$$. Write valid KaTeX only."
    "\n"
    r'- A literal dollar sign is written \$ (for example "costs \$5"). Write other literal symbols (*, _, #) '
    r"with a backslash too, unless they are part of code or math."
    "\n"
    "- When a text needs no code or math, write plain text. Do not add Markdown for decoration."
)

# Only for prompts whose whole response is JSON. Chat replies are not JSON and need no extra escape.
JSON_ESCAPE_PROMPT = (
    r"The response is JSON: escape every backslash and newline inside strings, for example \\frac, \\$ and \n."
)

# Used where the AI explains a verdict: the student reads it next to the question.
FEEDBACK_FORMAT_PROMPT = (
    r"The reason may quote code with `backticks` or a fenced block, and math as $...$ or $$...$$ (valid KaTeX). "
    r"A literal dollar sign is \$. Escape backslashes in the JSON string."
)
