// Code block languages: alias → canonical lowlight name, and readable display names.
//
// The fence stores the canonical name (```python), never the alias (```py). The alias map is
// the `aliases` of the highlight.js grammars in lowlight's `common` set, plus a few editor ids
// (VS Code language ids, `node`). A test checks that every target is a registered language.

/** Alias → canonical lowlight language name. Keys are lower case. */
export const CODE_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  ino: 'arduino',
  sh: 'bash',
  zsh: 'bash',
  shellscript: 'bash',
  h: 'c',
  cc: 'cpp',
  'c++': 'cpp',
  'h++': 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cxx: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  patch: 'diff',
  golang: 'go',
  gql: 'graphql',
  toml: 'ini',
  jsp: 'java',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  javascriptreact: 'javascript',
  jsonc: 'json',
  json5: 'json',
  kt: 'kotlin',
  kts: 'kotlin',
  pluto: 'lua',
  mk: 'makefile',
  mak: 'makefile',
  make: 'makefile',
  md: 'markdown',
  mkdown: 'markdown',
  mkd: 'markdown',
  mm: 'objectivec',
  objc: 'objectivec',
  'obj-c': 'objectivec',
  'obj-c++': 'objectivec',
  'objective-c': 'objectivec',
  'objective-c++': 'objectivec',
  pl: 'perl',
  pm: 'perl',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext',
  py: 'python',
  py3: 'python',
  python3: 'python',
  gyp: 'python',
  ipython: 'python',
  pycon: 'python-repl',
  rb: 'ruby',
  gemspec: 'ruby',
  podspec: 'ruby',
  thor: 'ruby',
  irb: 'ruby',
  rs: 'rust',
  console: 'shell',
  shellsession: 'shell',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  typescriptreact: 'typescript',
  vb: 'vbnet',
  html: 'xml',
  xhtml: 'xml',
  rss: 'xml',
  atom: 'xml',
  xjb: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  plist: 'xml',
  wsf: 'xml',
  svg: 'xml',
  yml: 'yaml',
};

/** Readable names for the canonical lowlight names. A name that is missing here shows as it is. */
const CODE_LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  arduino: 'Arduino',
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  graphql: 'GraphQL',
  ini: 'TOML / INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  'php-template': 'PHP template',
  plaintext: 'Plain text',
  python: 'Python',
  'python-repl': 'Python REPL',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell session',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  vbnet: 'Visual Basic .NET',
  wasm: 'WebAssembly',
  xml: 'HTML / XML',
  yaml: 'YAML',
};

/**
 * Resolve a fence info string to the canonical language name.
 * An alias (`py`, `JS`) gives its canonical name. A canonical name stays as it is.
 * An unknown language is kept (trimmed), so no information is lost. Empty gives `null`.
 */
export function normalizeCodeLanguage(language: string | null | undefined): string | null {
  const trimmed = language?.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  return CODE_LANGUAGE_ALIASES[key] ?? (key in CODE_LANGUAGE_LABELS ? key : trimmed);
}

/** Readable name of a language, e.g. `python` → "Python". */
export function codeLanguageLabel(language: string): string {
  return CODE_LANGUAGE_LABELS[language] ?? language;
}

/** True when `query` matches the canonical name, the readable name or any alias of `language`. */
export function codeLanguageMatches(language: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (language.includes(q) || codeLanguageLabel(language).toLowerCase().includes(q)) return true;
  // An exact or prefix alias match ("py", "yml"). A substring would match too much ("c" is in "cs").
  return Object.entries(CODE_LANGUAGE_ALIASES).some(([alias, target]) => target === language && alias.startsWith(q));
}

/** Registered languages, filtered by `query` and sorted by readable name. */
export function searchCodeLanguages(languages: readonly string[], query: string): string[] {
  return languages
    .filter(language => codeLanguageMatches(language, query))
    .sort((a, b) => codeLanguageLabel(a).localeCompare(codeLanguageLabel(b)));
}
