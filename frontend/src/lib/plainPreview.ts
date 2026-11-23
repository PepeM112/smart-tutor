const STASH_OPEN = '';
const STASH_CLOSE = '';
const STASH_PATTERN = new RegExp(`${STASH_OPEN}(\\d+)${STASH_CLOSE}`, 'g');

// An unclosed fence still counts (a prompt cut while streaming or truncated).
const FENCE = /```[ \t]*([\w+#-]*)[^\n]*\n?[\s\S]*?(?:```|$)/g;
const INLINE_CODE = /`([^`\n]+)`/g;
const ESCAPED_DOLLAR = /\\\$/g;
// An escaped `\$` is never a delimiter, so `$a \$ b$` is one span.
const MATH = /(?<!\\)\$\$[\s\S]+?(?<!\\)\$\$|(?<!\\)\$(?:\\.|[^$\\\n])+?\$/g;

/**
 * Plain text of Markdown for one-line, truncated lists.
 * Code fences become `[lang]` or `[code]`. Math keeps its source, `$` included.
 */
export function toPlainPreview(markdown: string): string {
  // Protected spans skip the marker cleanup: `a_b` in math or code is not emphasis.
  const stash: string[] = [];
  const protect = (value: string): string => `${STASH_OPEN}${stash.push(value) - 1}${STASH_CLOSE}`;

  return markdown
    .replace(FENCE, (_match, lang: string) => protect(`[${lang || 'code'}]`))
    .replace(INLINE_CODE, (_match, code: string) => protect(code))
    .replace(MATH, match => protect(match))
    .replace(ESCAPED_DOLLAR, () => protect('$'))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gm, '')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])([*_])(?=\S)(.+?)(?<=\S)\2(?![\w*])/g, '$1$3')
    .replace(/\\([\\*_[\]()#+\-.!~])/g, '$1')
    .replace(STASH_PATTERN, (_match, index: string) => stash[Number(index)] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
