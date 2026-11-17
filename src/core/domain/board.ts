import { offsetPoint, type GridPoint } from './gridPoint';
import type { Piece } from './piece';
import type { Shape } from './shape';

export interface ClearedCell {
  readonly position: GridPoint;
  readonly colorIndex: number;
}

/** The rows and columns removed by a single placement. */
export interface LineClear {
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  readonly cells: readonly ClearedCell[];
  readonly lineCount: number;
}

/** What happened to the board when a piece was placed. */
export interface PlacementResult {
  readonly placedCells: readonly GridPoint[];
  readonly clear: LineClear;
  readonly boardCleared: boolean;
}

export const NO_CLEAR: LineClear = { rows: [], cols: [], cells: [], lineCount: 0 };

const EMPTY = -1;

/**
 * The square playing grid. Owns every rule about what fits where and which
 * lines are complete; knows nothing about scoring, input or rendering.
 */
export class Board {
  static readonly DEFAULT_SIZE = 8;
  static readonly EMPTY_CELL = EMPTY;

  private readonly cells: Int8Array;
  private filled = 0;

  constructor(readonly size: number = Board.DEFAULT_SIZE) {
    if (!Number.isInteger(size) || size < 4 || size > 16) {
      throw new RangeError('Board size must be an integer between 4 and 16.');
    }
    this.cells = new Int8Array(size * size).fill(EMPTY);
  }

  get filledCount(): number {
    return this.filled;
  }

  get fillRatio(): number {
    return this.filled / (this.size * this.size);
  }

  get isCleared(): boolean {
    return this.filled === 0;
  }

  contains(p: GridPoint): boolean {
    return p.row >= 0 && p.row < this.size && p.col >= 0 && p.col < this.size;
  }

  isFilled(row: number, col: number): boolean {
    return this.cells[row * this.size + col] !== EMPTY;
  }

  /** The colour index stored in a cell, or `Board.EMPTY_CELL`. */
  colorAt(row: number, col: number): number {
    return this.cells[row * this.size + col];
  }

  canPlace(shape: Shape, origin: GridPoint): boolean {
    for (const offset of shape.cells) {
      const p = offsetPoint(origin, offset);
      if (!this.contains(p) || this.isFilled(p.row, p.col)) {
        return false;
      }
    }
    return true;
  }

  canPlaceAnywhere(shape: Shape): boolean {
    for (let row = 0; row <= this.size - shape.rows; row++) {
      for (let col = 0; col <= this.size - shape.cols; col++) {
        if (this.canPlace(shape, { row, col })) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * The rows and columns that would complete if the shape were placed at the
   * origin. Does not change the board.
   */
  previewClear(shape: Shape, origin: GridPoint): { rows: number[]; cols: number[] } {
    const rows: number[] = [];
    const cols: number[] = [];
    if (!this.canPlace(shape, origin)) {
      return { rows, cols };
    }

    const added = new Set<number>();
    const touchedRows = new Set<number>();
    const touchedCols = new Set<number>();
    for (const offset of shape.cells) {
      const p = offsetPoint(origin, offset);
      added.add(p.row * this.size + p.col);
      touchedRows.add(p.row);
      touchedCols.add(p.col);
    }

    const occupied = (row: number, col: number): boolean =>
      this.isFilled(row, col) || added.has(row * this.size + col);

    for (const row of [...touchedRows].sort((a, b) => a - b)) {
      let full = true;
      for (let col = 0; col < this.size && full; col++) {
        full = occupied(row, col);
      }
      if (full) {
        rows.push(row);
      }
    }
    for (const col of [...touchedCols].sort((a, b) => a - b)) {
      let full = true;
      for (let row = 0; row < this.size && full; row++) {
        full = occupied(row, col);
      }
      if (full) {
        cols.push(col);
      }
    }
    return { rows, cols };
  }

  /** Places a piece and removes every completed row and column. */
  place(piece: Piece, origin: GridPoint): PlacementResult {
    if (!this.canPlace(piece.shape, origin)) {
      throw new Error(`Shape '${piece.shape.id}' does not fit at (${origin.row}, ${origin.col}).`);
    }

    const placedCells: GridPoint[] = [];
    for (const offset of piece.shape.cells) {
      const p = offsetPoint(origin, offset);
      this.cells[p.row * this.size + p.col] = Math.max(0, piece.colorIndex);
      placedCells.push(p);
    }
    this.filled += placedCells.length;

    const rows: number[] = [];
    const cols: number[] = [];
    for (let i = 0; i < this.size; i++) {
      if (this.isRowFull(i)) {
        rows.push(i);
      }
      if (this.isColFull(i)) {
        cols.push(i);
      }
    }
    if (rows.length === 0 && cols.length === 0) {
      return { placedCells, clear: NO_CLEAR, boardCleared: false };
    }

    const cleared: ClearedCell[] = [];
    for (const row of rows) {
      for (let col = 0; col < this.size; col++) {
        this.clearCell(row, col, cleared);
      }
    }
    for (const col of cols) {
      for (let row = 0; row < this.size; row++) {
        this.clearCell(row, col, cleared);
      }
    }
    this.filled -= cleared.length;

    return {
      placedCells,
      clear: { rows, cols, cells: cleared, lineCount: rows.length + cols.length },
      boardCleared: this.isCleared,
    };
  }

  /** Row-major copy of the cells, for saving. */
  toArray(): number[] {
    return Array.from(this.cells);
  }

  /** Rebuilds a board from `toArray()` output; undefined if the data is invalid. */
  static tryFromArray(size: unknown, cells: unknown): Board | undefined {
    if (
      typeof size !== 'number' ||
      !Number.isInteger(size) ||
      size < 4 ||
      size > 16 ||
      !Array.isArray(cells) ||
      cells.length !== size * size
    ) {
      return undefined;
    }

    const board = new Board(size);
    for (let i = 0; i < cells.length; i++) {
      const value: unknown = cells[i];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < EMPTY || value > 100) {
        return undefined;
      }
      if (value !== EMPTY) {
        board.cells[i] = value;
        board.filled++;
      }
    }
    return board;
  }

  private clearCell(row: number, col: number, cleared: ClearedCell[]): void {
    const index = row * this.size + col;
    const color = this.cells[index];
    if (color === EMPTY) {
      return; // already removed by a crossing line
    }
    cleared.push({ position: { row, col }, colorIndex: color });
    this.cells[index] = EMPTY;
  }

  private isRowFull(row: number): boolean {
    for (let col = 0; col < this.size; col++) {
      if (!this.isFilled(row, col)) {
        return false;
      }
    }
    return true;
  }

  private isColFull(col: number): boolean {
    for (let row = 0; row < this.size; row++) {
      if (!this.isFilled(row, col)) {
        return false;
      }
    }
    return true;
  }
}
