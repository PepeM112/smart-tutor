import { describe, expect, it } from 'vitest';

import { assignSlugs, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Getting started', 'getting-started'],
    ['  Café & Crème!  ', 'cafe-creme'],
    ['¿Qué es esto?', 'que-es-esto'],
    ['C++ vs C#', 'c-vs-c'],
    ['Section 2.1', 'section-2-1'],
    ['日本語 notes', '日本語-notes'],
  ])('%j -> %j', (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });

  it('uses a fallback for a heading with no letters or digits', () => {
    expect(slugify('')).toBe('section');
    expect(slugify('***')).toBe('section');
  });
});

describe('assignSlugs', () => {
  it('keeps the plain slug for the first heading and numbers the next ones from 2', () => {
    expect(assignSlugs(['Intro', 'Intro', 'Intro'])).toEqual(['intro', 'intro-2', 'intro-3']);
  });

  it('numbers headings with no text one after another', () => {
    expect(assignSlugs(['', '', 'Other'])).toEqual(['section', 'section-2', 'other']);
  });

  it('never repeats a slug, also when a heading already has a numbered name', () => {
    const slugs = assignSlugs(['Intro', 'Intro 2', 'Intro', 'Intro']);
    expect(slugs).toEqual(['intro', 'intro-2', 'intro-3', 'intro-4']);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('is the same for the same input', () => {
    const texts = ['A', 'B', 'A'];
    expect(assignSlugs(texts)).toEqual(assignSlugs(texts));
  });
});
