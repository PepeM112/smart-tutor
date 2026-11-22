import { describe, expect, it } from 'vitest';

import { deserializeFilterValue, serializeFilterValue } from './serialize';
import { FilterType, type FilterItem } from './types';

const TAGS_FILTER: FilterItem = {
  label: 'Tags',
  key: 'tags',
  type: FilterType.MULTIPLE_SELECT,
  query: 'tags',
  options: { asyncItems: { queryKey: ['tags'], fetch: () => Promise.resolve([]) } },
};

describe('tags filter serialization', () => {
  it('writes one URL param per tag', () => {
    expect(serializeFilterValue(TAGS_FILTER, { tags: ['algebra', 'two words'] })).toEqual({
      tags: ['algebra', 'two words'],
    });
  });

  it('writes nothing for an empty or missing value', () => {
    expect(serializeFilterValue(TAGS_FILTER, {})).toEqual({});
    expect(serializeFilterValue(TAGS_FILTER, { tags: '' })).toEqual({});
  });

  it('reads the tags back as strings, with no options list to match', () => {
    const params = new URLSearchParams('tags=algebra&tags=2024&tags=a%2Cb');

    expect(deserializeFilterValue(TAGS_FILTER, params)).toEqual(['algebra', '2024', 'a,b']);
  });

  it('returns undefined when the URL has no tags', () => {
    expect(deserializeFilterValue(TAGS_FILTER, new URLSearchParams('search=x'))).toBeUndefined();
  });
});
