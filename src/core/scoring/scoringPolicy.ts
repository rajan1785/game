/** Strategy that turns a placement into points. */
export interface ScoringPolicy {
  /** Placements without a clear that are tolerated before the combo streak resets. */
  readonly streakGraceMoves: number;

  /**
   * @param cellsPlaced  Number of cells in the placed piece.
   * @param linesCleared Rows plus columns removed by the placement.
   * @param streak       Combo streak after this placement (0 when none is running).
   * @param boardCleared True when the placement emptied the whole board.
   */
  score(cellsPlaced: number, linesCleared: number, streak: number, boardCleared: boolean): number;
}

/**
 * Default scoring: one point per cell, a growing reward for clearing several
 * lines at once, multiplied by the running combo streak.
 */
export class ComboScoringPolicy implements ScoringPolicy {
  static readonly POINTS_PER_LINE = 10;
  static readonly BOARD_CLEAR_BONUS = 200;
  /** Combos stop multiplying here so one long streak cannot dwarf everything else. */
  static readonly MAX_MULTIPLIER = 8;

  readonly streakGraceMoves = 3;

  score(cellsPlaced: number, linesCleared: number, streak: number, boardCleared: boolean): number {
    let points = Math.max(0, cellsPlaced);
    if (linesCleared > 0) {
      // 1 line = 10, 2 = 30, 3 = 60, 4 = 100 ...
      const lineValue = (ComboScoringPolicy.POINTS_PER_LINE * linesCleared * (linesCleared + 1)) / 2;
      points += lineValue * Math.max(1, Math.min(ComboScoringPolicy.MAX_MULTIPLIER, streak));
    }
    if (boardCleared) {
      points += ComboScoringPolicy.BOARD_CLEAR_BONUS;
    }
    return points;
  }
}
