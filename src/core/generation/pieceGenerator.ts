import type { Board } from '../domain/board';
import type { Piece } from '../domain/piece';
import type { Shape } from '../domain/shape';
import { ShapeLibrary } from '../domain/shapeLibrary';
import { randomInt, type RandomSource } from './randomSource';

/** Strategy that deals the next set of pieces for the tray. */
export interface PieceGenerator {
  /** @param level Current level (1+); higher levels may deal harder trays. */
  nextTray(board: Board, count: number, level: number): Piece[];
}

/**
 * Deals pieces that keep the player in the "flow" zone: big demanding shapes
 * while the board is open, smaller ones as it fills up, and never a tray in
 * which nothing fits. Difficulty creeps up with the level - more big pieces,
 * fewer rescues - so the challenge keeps pace with the player's skill.
 * Losing should always feel like the player's own decision, not bad luck.
 */
export class FairPieceGenerator implements PieceGenerator {
  static readonly DEFAULT_COLOR_COUNT = 7;

  private static readonly RESCUE_FILL_THRESHOLD = 0.55;
  private static readonly RESCUE_CHANCE = 0.5;

  constructor(
    private readonly random: RandomSource,
    private readonly colorCount: number = FairPieceGenerator.DEFAULT_COLOR_COUNT,
  ) {}

  nextTray(board: Board, count: number, level = 1): Piece[] {
    const pressure = Math.min(1, Math.max(0, level - 1) / 10);
    const rescueChance = FairPieceGenerator.RESCUE_CHANCE * (1 - 0.5 * pressure);
    const fill = board.fillRatio;
    const fitting = ShapeLibrary.all.filter((shape) => board.canPlaceAnywhere(shape));
    const pieces: Piece[] = [];
    let anyFits = false;

    for (let i = 0; i < count; i++) {
      const rescue =
        fitting.length > 0 &&
        fill >= FairPieceGenerator.RESCUE_FILL_THRESHOLD &&
        this.random.next() < rescueChance;
      const shape = this.pickWeighted(rescue ? fitting : ShapeLibrary.all, fill, pressure);
      anyFits ||= fitting.includes(shape);
      pieces.push(this.makePiece(shape));
    }

    if (!anyFits && fitting.length > 0 && count > 0) {
      pieces[randomInt(this.random, count)] = this.makePiece(this.pickWeighted(fitting, fill, 0));
    }
    return pieces;
  }

  private makePiece(shape: Shape): Piece {
    return { shape, colorIndex: randomInt(this.random, this.colorCount) };
  }

  private static weight(shape: Shape, fill: number, pressure: number): number {
    switch (shape.tier) {
      case 1:
        return 1 + fill * 2;
      case 2:
        return 2;
      default:
        return 0.2 + (1.5 + pressure) * (1 - fill);
    }
  }

  private pickWeighted(candidates: readonly Shape[], fill: number, pressure: number): Shape {
    let total = 0;
    for (const shape of candidates) {
      total += FairPieceGenerator.weight(shape, fill, pressure);
    }
    let roll = this.random.next() * total;
    for (const shape of candidates) {
      roll -= FairPieceGenerator.weight(shape, fill, pressure);
      if (roll < 0) {
        return shape;
      }
    }
    return candidates[candidates.length - 1];
  }
}
