import type { GridPoint } from '../core/domain/gridPoint';
import type { Piece } from '../core/domain/piece';
import type { Point } from './layout';

export interface DragState {
  readonly slot: number;
  readonly piece: Piece;
  readonly pointerId: number;
  /** True for touch input: the piece floats above the finger. */
  readonly lifted: boolean;
  cursor: Point;
  /** Where the piece will land if released now, or null if it does not fit. */
  target: GridPoint | null;
  clearRows: number[];
  clearCols: number[];
}

/** Transient presentation state. None of this is game truth. */
export interface ViewState {
  time: number;
  /** Score as displayed; counts up towards the real score. */
  shownScore: number;
  /** 0..1 combo excitement, drives the warm background tint. */
  heat: number;
  drag: DragState | null;
  /** Seconds since the game ended; 0 while playing. */
  gameOverAge: number;
  /** Seconds left in which a second tap on restart confirms it. */
  restartArmed: number;
  /** Seconds since the tray was last dealt, for the deal-in animation. */
  trayAge: number;
  reducedMotion: boolean;
}

export const GAME_OVER_DELAY = 0.55;
export const GAME_OVER_FADE = 0.4;
