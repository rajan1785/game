/** A cell coordinate on the board, or an offset inside a shape. */
export interface GridPoint {
  readonly row: number;
  readonly col: number;
}

export function offsetPoint(a: GridPoint, b: GridPoint): GridPoint {
  return { row: a.row + b.row, col: a.col + b.col };
}
