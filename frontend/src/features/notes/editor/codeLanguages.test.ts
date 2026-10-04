import { common, createLowlight } from 'lowlight';
import { describe, expect, it } from 'vitest';

import { CODE_LANGUAGE_ALIASES, codeLanguageLabel, normalizeCodeLanguage, searchCodeLanguages } from './codeLanguages';

const lowlight = createLowlight(common);
const registered = lowlight.listLanguages();

describe('code language aliases', () => {
  it('every alias targets a registered lowlight language', () => {
    Object.entries(CODE_LANGUAGE_ALIASES).forEach(([alias, target]) => {
      expect(registered, `${alias} → ${target}`).toContain(target);
    });
  });

  it('normalizes common aliases to the canonical name', () => {
    expect(normalizeCodeLanguage('py')).toBe('python');
    expect(normalizeCodeLanguage('JS')).toBe('javascript');
    expect(normalizeCodeLanguage('ts')).toBe('typescript');
    expect(normalizeCodeLanguage('sh')).toBe('bash');
    expect(normalizeCodeLanguage(' yml ')).toBe('yaml');
  });

  it('keeps canonical, unknown and empty values', () => {
    expect(normalizeCodeLanguage('python')).toBe('python');
    expect(normalizeCodeLanguage('Python')).toBe('python');
    expect(normalizeCodeLanguage('dockerfile')).toBe('dockerfile');
    expect(normalizeCodeLanguage('')).toBeNull();
    expect(normalizeCodeLanguage(null)).toBeNull();
  });

  it('shows readable names', () => {
    expect(codeLanguageLabel('python')).toBe('Python');
    expect(codeLanguageLabel('cpp')).toBe('C++');
    expect(codeLanguageLabel('unknown-lang')).toBe('unknown-lang');
  });

  it('search finds a language by alias, name or label', () => {
    expect(searchCodeLanguages(registered, 'py')).toContain('python');
    expect(searchCodeLanguages(registered, 'yml')).toEqual(['yaml']);
    expect(searchCodeLanguages(registered, 'type')).toEqual(['typescript']);
    expect(searchCodeLanguages(registered, 'c#')).toEqual(['csharp']);
  });
});
