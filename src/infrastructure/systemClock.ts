import type { Clock } from '../core/persistence/profile';

const MS_PER_DAY = 86_400_000;

/** Local calendar day number, so "a new day" follows the player's own midnight. */
export class SystemClock implements Clock {
  today(): number {
    const now = new Date();
    return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / MS_PER_DAY);
  }
}
