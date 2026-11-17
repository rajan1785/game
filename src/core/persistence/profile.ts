import type { GameState } from '../game/gameState';

/** Everything remembered about the player between visits. */
export interface PlayerProfile {
  bestScore: number;
  gamesPlayed: number;
  totalLinesCleared: number;
  soundEnabled: boolean;
  /** Consecutive calendar days on which the game was opened. */
  dayStreak: number;
  /** Local day number of the last visit (see Clock), or null on first run. */
  lastPlayedDay: number | null;
  savedGame: GameState | null;
}

export function createDefaultProfile(): PlayerProfile {
  return {
    bestScore: 0,
    gamesPlayed: 0,
    totalLinesCleared: 0,
    soundEnabled: true,
    dayStreak: 0,
    lastPlayedDay: null,
    savedGame: null,
  };
}

/** Port: where the profile lives is an infrastructure concern. */
export interface ProfileStore {
  load(): PlayerProfile;
  save(profile: PlayerProfile): void;
}

/** Port: the current local calendar day as a monotonically increasing integer. */
export interface Clock {
  today(): number;
}
