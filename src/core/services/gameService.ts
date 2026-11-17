import type { GridPoint } from '../domain/gridPoint';
import { GameSession, type PlacementOutcome } from '../game/gameSession';
import type { PieceGenerator } from '../generation/pieceGenerator';
import type { Clock, PlayerProfile, ProfileStore } from '../persistence/profile';
import type { ScoringPolicy } from '../scoring/scoringPolicy';
import { Signal } from '../util/signal';

/**
 * Application service: the single entry point the UI talks to. Coordinates
 * the current session with the player's profile (best score, statistics,
 * save/resume) and re-publishes session events so the UI never has to
 * re-subscribe when a new game starts.
 */
export class GameService {
  readonly placed = new Signal<PlacementOutcome>();
  readonly newBest = new Signal<number>();
  readonly gameEnded = new Signal<void>();
  readonly gameStarted = new Signal<void>();

  readonly profile: PlayerProfile;
  private current: GameSession;
  private bestAtGameStart: number;
  private newBestAnnounced = false;

  constructor(
    private readonly store: ProfileStore,
    private readonly generator: PieceGenerator,
    private readonly scoring: ScoringPolicy,
    clock: Clock,
  ) {
    this.profile = store.load();
    this.registerVisit(clock.today());
    this.bestAtGameStart = this.profile.bestScore;
    this.current =
      GameSession.tryRestore(this.profile.savedGame, generator, scoring) ??
      new GameSession(generator, scoring);
    this.save();
  }

  get session(): GameSession {
    return this.current;
  }

  /** The best score as it stood when this game began - the target to chase. */
  get bestToBeat(): number {
    return this.bestAtGameStart;
  }

  get hasBeatenBest(): boolean {
    return this.current.score > this.bestAtGameStart;
  }

  startNewGame(): void {
    this.current = new GameSession(this.generator, this.scoring);
    this.bestAtGameStart = this.profile.bestScore;
    this.newBestAnnounced = false;
    this.save();
    this.gameStarted.emit();
  }

  tryPlace(slot: number, origin: GridPoint): PlacementOutcome | undefined {
    const outcome = this.current.tryPlace(slot, origin);
    if (!outcome) {
      return undefined;
    }

    this.profile.totalLinesCleared += outcome.clear.lineCount;
    let announceBest = false;
    if (this.current.score > this.profile.bestScore) {
      this.profile.bestScore = this.current.score;
      if (this.bestAtGameStart > 0 && !this.newBestAnnounced) {
        this.newBestAnnounced = true;
        announceBest = true;
      }
    }

    const over = this.current.status === 'gameOver';
    if (over) {
      this.profile.gamesPlayed++;
    }
    this.save();

    this.placed.emit(outcome);
    if (announceBest) {
      this.newBest.emit(this.current.score);
    }
    if (over) {
      this.gameEnded.emit();
    }
    return outcome;
  }

  setSoundEnabled(enabled: boolean): void {
    this.profile.soundEnabled = enabled;
    this.save();
  }

  save(): void {
    const session = this.current;
    this.profile.savedGame =
      session.status === 'playing' && session.score > 0 ? session.toState() : null;
    this.store.save(this.profile);
  }

  private registerVisit(today: number): void {
    const last = this.profile.lastPlayedDay;
    if (last === null || today - last > 1 || today < last) {
      this.profile.dayStreak = 1;
    } else if (today - last === 1) {
      this.profile.dayStreak++;
    }
    this.profile.lastPlayedDay = today;
  }
}
