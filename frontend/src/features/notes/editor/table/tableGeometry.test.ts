import { describe, expect, it } from 'vitest';

import {
  bandIndexAt,
  gapFromPoint,
  gapOffset,
  hoverFromPoint,
  isInTableBand,
  isOnTable,
  TABLE_MENU_REACH,
  type Band,
  type TableMeasure,
} from './tableGeometry';

// Three columns of 100px from x=50, three rows of 40px from y=20 (the first row is the header).
const columns: Band[] = [
  { start: 50, size: 100 },
  { start: 150, size: 100 },
  { start: 250, size: 100 },
];
const rows: Band[] = [
  { start: 20, size: 40 },
  { start: 60, size: 40 },
  { start: 100, size: 40 },
];
const table: TableMeasure = {
  tablePos: 0,
  left: 50,
  top: 20,
  width: 300,
  height: 120,
  columns,
  rows,
  clipLeft: 50,
  clipRight: 350,
  viewportLeft: 50,
  layout: 'compact',
  hasHeaderRow: true,
  hasMergedCells: false,
};

describe('bandIndexAt', () => {
  it('gives the band that holds the value', () => {
    expect(bandIndexAt(columns, 50)).toBe(0);
    expect(bandIndexAt(columns, 149)).toBe(0);
    expect(bandIndexAt(columns, 150)).toBe(1);
    expect(bandIndexAt(columns, 349)).toBe(2);
  });

  it('clamps to the first and last band outside the bands', () => {
    expect(bandIndexAt(columns, -20)).toBe(0);
    expect(bandIndexAt(columns, 900)).toBe(2);
  });

  it('gives 0 for no bands', () => {
    expect(bandIndexAt([], 10)).toBe(0);
  });
});

describe('isOnTable / hoverFromPoint', () => {
  it('finds the cell under the pointer', () => {
    expect(hoverFromPoint(table, 200, 80)).toEqual({ row: 1, col: 1 });
    expect(isOnTable(table, 200, 80)).toBe(true);
  });

  it('keeps the nearest cell in the zone around the table', () => {
    // 20px left of the table, level with the last row.
    expect(hoverFromPoint(table, 30, 120)).toEqual({ row: 2, col: 0 });
    expect(isOnTable(table, 30, 120)).toBe(false);
    // Above the table, over the last column.
    expect(hoverFromPoint(table, 340, 5)).toEqual({ row: 0, col: 2 });
  });

  it('gives null when the pointer is far from the table', () => {
    expect(hoverFromPoint(table, 0, 80)).toBeNull();
    expect(hoverFromPoint(table, 200, 400)).toBeNull();
    expect(hoverFromPoint(table, 500, 80)).toBeNull();
  });

  it('gives null for a table without cells', () => {
    expect(hoverFromPoint({ ...table, rows: [], columns: [] }, 200, 80)).toBeNull();
  });
});

describe('isInTableBand', () => {
  const width = 800;

  it('holds the whole row band of the table, across the container width', () => {
    expect(isInTableBand(table, 0, 20, width)).toBe(true);
    expect(isInTableBand(table, 400, 80, width)).toBe(true);
    expect(isInTableBand(table, width, 140, width)).toBe(true);
    expect(isInTableBand(table, width + 1, 80, width)).toBe(false);
  });

  it('keeps the margin above and below, like the hover zone', () => {
    expect(isInTableBand(table, 100, 20 - 30, width)).toBe(true);
    expect(isInTableBand(table, 100, 20 - 31, width)).toBe(false);
    expect(isInTableBand(table, 100, 140 + 26, width)).toBe(true);
    expect(isInTableBand(table, 100, 140 + 27, width)).toBe(false);
  });

  it('is wider than the hover zone: far to the left, hoverFromPoint has no cell but the band holds', () => {
    expect(hoverFromPoint(table, 0, 80)).toBeNull();
    expect(isInTableBand(table, 0, 80, width)).toBe(true);
  });

  it('reaches left of the container, to the table menu button (negative x)', () => {
    // The table starts at x=50: the band reaches 50 - TABLE_MENU_REACH (-6).
    expect(isInTableBand(table, 50 - TABLE_MENU_REACH, 80, width)).toBe(true);
    expect(isInTableBand(table, 50 - TABLE_MENU_REACH - 1, 80, width)).toBe(false);
  });
});

describe('gapFromPoint', () => {
  it('counts the bands that the pointer passed by their center', () => {
    expect(gapFromPoint(columns, 60)).toBe(0);
    expect(gapFromPoint(columns, 101)).toBe(1);
    expect(gapFromPoint(columns, 201)).toBe(2);
    expect(gapFromPoint(columns, 340)).toBe(3);
  });

  it('clamps to the ends', () => {
    expect(gapFromPoint(columns, -100)).toBe(0);
    expect(gapFromPoint(columns, 900)).toBe(3);
  });

  it('never goes below `minGap` (nothing is dropped above the header row)', () => {
    expect(gapFromPoint(rows, 25, 1)).toBe(1);
    expect(gapFromPoint(rows, 300, 1)).toBe(3);
  });
});

describe('gapOffset', () => {
  it('gives the position of the line between two bands', () => {
    expect(gapOffset(columns, 0)).toBe(50);
    expect(gapOffset(columns, 1)).toBe(150);
    expect(gapOffset(columns, 3)).toBe(350);
  });

  it('clamps a gap that is too large and handles no bands', () => {
    expect(gapOffset(rows, 9)).toBe(140);
    expect(gapOffset([], 2)).toBe(0);
  });
});
