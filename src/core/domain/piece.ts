import type { Shape } from './shape';

/** A shape the player can place, together with its colour. */
export interface Piece {
  readonly shape: Shape;
  readonly colorIndex: number;
}
