import type { GridPoint } from './gridPoint';

export type ShapeTier = 1 | 2 | 3;

/**
 * An immutable arrangement of cells, normalised so the top-left of its
 * bounding box is always (0, 0).
 */
export class Shape {
  readonly cells: readonly GridPoint[];
  readonly rows: number;
  readonly cols: number;

  /**
   * @param tier 1 = small and easy to place, 3 = large and demanding.
   */
  constructor(
    readonly id: string,
    cells: readonly GridPoint[],
    readonly tier: ShapeTier = 1,
  ) {
    if (!id.trim()) {
      throw new Error('A shape needs an id.');
    }
    if (cells.length === 0) {
      throw new Error('A shape needs at least one cell.');
    }

    const minRow = Math.min(...cells.map((c) => c.row));
    const minCol = Math.min(...cells.map((c) => c.col));
    const seen = new Set<string>();
    const normalised: GridPoint[] = [];
    for (const cell of cells) {
      const point = { row: cell.row - minRow, col: cell.col - minCol };
      const key = `${point.row},${point.col}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalised.push(point);
      }
    }
    normalised.sort((a, b) => a.row - b.row || a.col - b.col);

    this.cells = normalised;
    this.rows = Math.max(...normalised.map((c) => c.row)) + 1;
    this.cols = Math.max(...normalised.map((c) => c.col)) + 1;
  }

  /** Builds a shape from text rows, where 'X' marks a filled cell. */
  static parse(id: string, tier: ShapeTier, ...rows: string[]): Shape {
    const cells: GridPoint[] = [];
    rows.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        if (line[col] === 'X') {
          cells.push({ row, col });
        }
      }
    });
    return new Shape(id, cells, tier);
  }
}
