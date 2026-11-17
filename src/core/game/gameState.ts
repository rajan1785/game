/** Plain, JSON-friendly snapshot of a game in progress. */
export interface TrayItemState {
  shapeId: string;
  colorIndex: number;
}

export interface GameState {
  boardSize: number;
  cells: number[];
  tray: (TrayItemState | null)[];
  score: number;
  streak: number;
  movesSinceClear: number;
  linesCleared: number;
}
