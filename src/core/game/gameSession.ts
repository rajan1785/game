import { Board, type LineClear } from '../domain/board';
import type { GridPoint } from '../domain/gridPoint';
import type { Piece } from '../domain/piece';
import { ShapeLibrary } from '../domain/shapeLibrary';
import type { PieceGenerator } from '../generation/pieceGenerator';
import type { ScoringPolicy } from '../scoring/scoringPolicy';
import { Signal } from '../util/signal';
import type { GameState } from './gameState';
import { SteppedLevelProgression, type LevelProgression } from './levelProgression';

export type GameStatus = 'playing' | 'gameOver';

export interface PlacementOutcome {
  readonly slot: number;
  readonly piece: Piece;
  readonly origin: GridPoint;
  readonly placedCells: readonly GridPoint[];
  readonly clear: LineClear;
  readonly pointsEarned: number;
  readonly streak: number;
  readonly boardCleared: boolean;
  readonly totalScore: number;
  readonly level: number;
  /** True when this placement carried the player into a new level. */
  readonly levelUp: boolean;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * One run of the game: a board, a tray of pieces, the score and the combo
 * streak. This is the aggregate root for all rules; the UI only ever asks it
 * questions and tells it where the player dropped a piece.
 */
export class GameSession {
  static readonly TRAY_SIZE = 3;

  readonly placed = new Signal<PlacementOutcome>();
  readonly trayRefilled = new Signal<void>();
  readonly ended = new Signal<void>();

  readonly board: Board;
  private readonly slots: (Piece | null)[];
  private currentScore = 0;
  private currentStreak = 0;
  private movesSinceClear = 0;
  private totalLines = 0;
  private currentStatus: GameStatus = 'playing';

  constructor(
    private readonly generator: PieceGenerator,
    private readonly scoring: ScoringPolicy,
    private readonly progression: LevelProgression = new SteppedLevelProgression(),
    board?: Board,
    tray?: (Piece | null)[],
  ) {
    this.board = board ?? new Board();
    this.slots = tray ?? this.generator.nextTray(this.board, GameSession.TRAY_SIZE, 1);
  }

  get tray(): readonly (Piece | null)[] {
    return this.slots;
  }

  get score(): number {
    return this.currentScore;
  }

  /** Number of consecutive clears in the running combo (0 when none). */
  get streak(): number {
    return this.currentStreak;
  }

  get level(): number {
    return this.progression.levelFor(this.currentScore);
  }

  /** 0..1 progress from the start of the current level to the next one. */
  get levelProgress(): number {
    const level = this.level;
    const from = this.progression.threshold(level);
    const to = this.progression.threshold(level + 1);
    return Math.max(0, Math.min(1, (this.currentScore - from) / (to - from)));
  }

  get linesCleared(): number {
    return this.totalLines;
  }

  get status(): GameStatus {
    return this.currentStatus;
  }

  canPlace(slot: number, origin: GridPoint): boolean {
    const piece = this.slots[slot];
    return this.currentStatus === 'playing' && !!piece && this.board.canPlace(piece.shape, origin);
  }

  canPlaceAnywhere(slot: number): boolean {
    const piece = this.slots[slot];
    return this.currentStatus === 'playing' && !!piece && this.board.canPlaceAnywhere(piece.shape);
  }

  /** Places the piece in the given tray slot; returns undefined if the move is illegal. */
  tryPlace(slot: number, origin: GridPoint): PlacementOutcome | undefined {
    const piece = this.slots[slot];
    if (!piece || !this.canPlace(slot, origin)) {
      return undefined;
    }

    const levelBefore = this.level;
    const result = this.board.place(piece, origin);
    this.slots[slot] = null;

    const lines = result.clear.lineCount;
    if (lines > 0) {
      this.currentStreak++;
      this.movesSinceClear = 0;
      this.totalLines += lines;
    } else {
      this.movesSinceClear++;
      if (this.movesSinceClear >= this.scoring.streakGraceMoves) {
        this.currentStreak = 0;
      }
    }

    const pointsEarned = this.scoring.score(
      result.placedCells.length,
      lines,
      lines > 0 ? this.currentStreak : 0,
      result.boardCleared,
    );
    this.currentScore += pointsEarned;

    const refilled = this.slots.every((item): boolean => item === null);
    if (refilled) {
      const next = this.generator.nextTray(this.board, GameSession.TRAY_SIZE, this.level);
      for (let i = 0; i < GameSession.TRAY_SIZE; i++) {
        this.slots[i] = next[i] ?? null;
      }
    }

    const outcome: PlacementOutcome = {
      slot,
      piece,
      origin,
      placedCells: result.placedCells,
      clear: result.clear,
      pointsEarned,
      streak: this.currentStreak,
      boardCleared: result.boardCleared,
      totalScore: this.currentScore,
      level: this.level,
      levelUp: this.level > levelBefore,
    };

    const over = !this.hasAnyMove();
    if (over) {
      this.currentStatus = 'gameOver';
    }

    this.placed.emit(outcome);
    if (refilled) {
      this.trayRefilled.emit();
    }
    if (over) {
      this.ended.emit();
    }
    return outcome;
  }

  hasAnyMove(): boolean {
    return this.slots.some((piece) => piece !== null && this.board.canPlaceAnywhere(piece.shape));
  }

  toState(): GameState {
    return {
      boardSize: this.board.size,
      cells: this.board.toArray(),
      tray: this.slots.map((piece) =>
        piece ? { shapeId: piece.shape.id, colorIndex: piece.colorIndex } : null,
      ),
      score: this.currentScore,
      streak: this.currentStreak,
      movesSinceClear: this.movesSinceClear,
      linesCleared: this.totalLines,
    };
  }

  /**
   * Rebuilds a session from saved data. Saved data is untrusted (it may be
   * corrupt or from an older version), so anything suspicious yields undefined.
   */
  static tryRestore(
    state: unknown,
    generator: PieceGenerator,
    scoring: ScoringPolicy,
    progression?: LevelProgression,
  ): GameSession | undefined {
    if (typeof state !== 'object' || state === null) {
      return undefined;
    }
    const data = state as Partial<GameState>;
    const board = Board.tryFromArray(data.boardSize, data.cells);
    if (!board || !Array.isArray(data.tray) || data.tray.length !== GameSession.TRAY_SIZE) {
      return undefined;
    }
    if (
      !isCount(data.score) ||
      !isCount(data.streak) ||
      !isCount(data.movesSinceClear) ||
      !isCount(data.linesCleared)
    ) {
      return undefined;
    }

    const tray: (Piece | null)[] = [];
    for (const item of data.tray as unknown[]) {
      if (item === null) {
        tray.push(null);
        continue;
      }
      if (typeof item !== 'object') {
        return undefined;
      }
      const { shapeId, colorIndex } = item as { shapeId?: unknown; colorIndex?: unknown };
      const shape = typeof shapeId === 'string' ? ShapeLibrary.find(shapeId) : undefined;
      if (!shape || !isCount(colorIndex)) {
        return undefined;
      }
      tray.push({ shape, colorIndex });
    }

    const session = new GameSession(generator, scoring, progression, board, tray);
    if (!session.hasAnyMove()) {
      return undefined;
    }
    session.currentScore = data.score;
    session.currentStreak = data.streak;
    session.movesSinceClear = data.movesSinceClear;
    session.totalLines = data.linesCleared;
    return session;
  }
}
