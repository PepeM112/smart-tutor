import { describe, expect, it } from 'vitest';

import type { FileTreeFolder } from '@/client';

import { buildFolderPath } from './useFolderPath';

const ULID_A = '01ARZ3NDEKTSV4RRFFQ69G5FAA';
const ULID_B = '01ARZ3NDEKTSV4RRFFQ69G5FAB';
const ULID_C = '01ARZ3NDEKTSV4RRFFQ69G5FAC';
const ULID_D = '01ARZ3NDEKTSV4RRFFQ69G5FAD';

const NOW = new Date('2024-01-01T00:00:00Z');

function makeFolder(id: string, name: string, parentId: string | null): FileTreeFolder {
  return { id, name, parentId, updatedAt: NOW };
}

describe('buildFolderPath', () => {
  it('returns empty array for null folderId', () => {
    expect(buildFolderPath(null, [])).toEqual([]);
  });

  it('returns single folder for a root-level folder', () => {
    const folder = makeFolder(ULID_A, 'Root', null);
    expect(buildFolderPath(ULID_A, [folder])).toEqual([folder]);
  });

  it('returns the full chain in root-to-leaf order', () => {
    const a = makeFolder(ULID_A, 'a', null);
    const b = makeFolder(ULID_B, 'b', ULID_A);
    const c = makeFolder(ULID_C, 'c', ULID_B);
    expect(buildFolderPath(ULID_C, [a, b, c])).toEqual([a, b, c]);
  });

  it('stops at a missing parent (incomplete data) instead of crashing', () => {
    // b references a parent that does not exist in the list.
    const b = makeFolder(ULID_B, 'b', ULID_A);
    const c = makeFolder(ULID_C, 'c', ULID_B);
    // Should return [b, c] without looping forever.
    expect(buildFolderPath(ULID_C, [b, c])).toEqual([b, c]);
  });

  it('stops at a cycle to prevent an infinite loop', () => {
    // A → B → A (corrupt data)
    const a = makeFolder(ULID_A, 'a', ULID_B);
    const b = makeFolder(ULID_B, 'b', ULID_A);
    const result = buildFolderPath(ULID_A, [a, b]);
    // Must return a finite array; exact content is less important than not looping.
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for an unknown folderId', () => {
    const a = makeFolder(ULID_A, 'a', null);
    expect(buildFolderPath(ULID_D, [a])).toEqual([]);
  });

  it('orders items root first, leaf last', () => {
    const a = makeFolder(ULID_A, 'a', null);
    const b = makeFolder(ULID_B, 'b', ULID_A);
    const c = makeFolder(ULID_C, 'c', ULID_B);
    const result = buildFolderPath(ULID_C, [c, b, a]); // deliberately shuffled
    expect(result.map(f => f.id)).toEqual([ULID_A, ULID_B, ULID_C]);
  });
});
