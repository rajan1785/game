import {
  createDefaultProfile,
  type PlayerProfile,
  type ProfileStore,
} from '../core/persistence/profile';

/** The slice of the Web Storage API this adapter needs (easy to fake in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const count = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

/**
 * Persists the profile as JSON in localStorage (or anything shaped like it).
 * Stored data is treated as untrusted: missing or malformed fields fall back
 * to defaults, and storage failures (private mode, quota) never break play.
 */
export class LocalStorageProfileStore implements ProfileStore {
  static readonly DEFAULT_KEY = 'lumina-blocks/profile/v1';

  constructor(
    private readonly storage: KeyValueStorage | undefined,
    private readonly key: string = LocalStorageProfileStore.DEFAULT_KEY,
  ) {}

  load(): PlayerProfile {
    const profile = createDefaultProfile();
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) {
        return profile;
      }
      const data: unknown = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) {
        return profile;
      }
      const d = data as Record<string, unknown>;
      profile.bestScore = count(d.bestScore, 0);
      profile.gamesPlayed = count(d.gamesPlayed, 0);
      profile.totalLinesCleared = count(d.totalLinesCleared, 0);
      profile.soundEnabled = d.soundEnabled !== false;
      profile.dayStreak = count(d.dayStreak, 0);
      profile.lastPlayedDay = typeof d.lastPlayedDay === 'number' ? count(d.lastPlayedDay, 0) : null;
      // Validated later by GameSession.tryRestore.
      profile.savedGame = (d.savedGame ?? null) as PlayerProfile['savedGame'];
    } catch {
      // Corrupt JSON or blocked storage: start fresh.
    }
    return profile;
  }

  save(profile: PlayerProfile): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(profile));
    } catch {
      // Storage full or unavailable: the game stays playable, just not saved.
    }
  }
}
