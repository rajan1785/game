/** Strategy that maps a score to a level: the short-term goal that is always within reach. */
export interface LevelProgression {
  /** The level (starting at 1) a score belongs to. */
  levelFor(score: number): number;
  /** The score at which the given level begins. */
  threshold(level: number): number;
}

/**
 * Each level needs a little more than the last (100, 200, 300 ... points), so
 * early levels arrive quickly and later ones have to be earned.
 */
export class SteppedLevelProgression implements LevelProgression {
  constructor(private readonly step: number = 50) {}

  threshold(level: number): number {
    const n = Math.max(1, Math.floor(level));
    return this.step * (n - 1) * n;
  }

  levelFor(score: number): number {
    let level = 1;
    while (this.threshold(level + 1) <= score) {
      level++;
    }
    return level;
  }
}
