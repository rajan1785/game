/** Randomness behind an interface so game logic can be tested deterministically. */
export interface RandomSource {
  /** A float in [0, 1). */
  next(): number;
}

export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

/** Small deterministic generator (mulberry32) for tests and replays. */
export class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function randomInt(random: RandomSource, maxExclusive: number): number {
  return Math.min(maxExclusive - 1, Math.floor(random.next() * maxExclusive));
}
