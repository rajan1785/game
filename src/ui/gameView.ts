import type { GridPoint } from '../core/domain/gridPoint';
import type { PlacementOutcome } from '../core/game/gameSession';
import type { GameService } from '../core/services/gameService';
import type { FeedbackPlayer } from './audio';
import { EffectsLayer } from './effects';
import { contains, GameLayout, type Point } from './layout';
import { GameRenderer } from './renderer';
import { Theme, type Rgb } from './theme';
import { GAME_OVER_DELAY, GAME_OVER_FADE, type ViewState } from './viewState';

export interface SafeArea {
  top: number;
  bottom: number;
}

const RESTART_CONFIRM_SECONDS = 2.5;
const SNAP_TOLERANCE = 1.1; // squared cells

/**
 * Presentation controller: owns the canvas, translates pointer and keyboard
 * input into GameService calls, and turns GameService events into feedback.
 * Contains no game rules.
 */
export class GameView {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly renderer: GameRenderer;
  private readonly fx = new EffectsLayer();
  private layout: GameLayout;
  private lastFrame = 0;
  private running = false;

  private readonly state: ViewState = {
    time: 0,
    shownScore: 0,
    heat: 0,
    drag: null,
    gameOverAge: 0,
    restartArmed: 0,
    trayAge: 0,
    reducedMotion: false,
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: GameService,
    private readonly feedback: FeedbackPlayer,
    private readonly safeArea: () => SafeArea = () => ({ top: 0, bottom: 0 }),
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D is not available.');
    }
    this.ctx = ctx;
    this.renderer = new GameRenderer(ctx);
    this.layout = new GameLayout(1, 1, game.session.board.size);
    this.state.shownScore = game.session.score;
    this.feedback.enabled = game.profile.soundEnabled;

    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.applyReducedMotion(motion?.matches ?? false);
    motion?.addEventListener?.('change', (e) => this.applyReducedMotion(e.matches));

    game.placed.on((outcome) => this.onPlaced(outcome));
    game.newBest.on(() => this.onNewBest());
    game.gameEnded.on(() => this.feedback.play('gameOver'));
    game.gameStarted.on(() => this.onGameStarted());

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e, true));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e, false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancelDrag();
        this.game.save();
      }
    });
    window.addEventListener('pagehide', () => this.game.save());
  }

  start(): void {
    this.resize();
    if (!this.running) {
      this.running = true;
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  // ---- frame loop -------------------------------------------------------

  private frame(timestamp: number): void {
    const dt = this.lastFrame === 0 ? 0 : Math.min(0.05, (timestamp - this.lastFrame) / 1000);
    this.lastFrame = timestamp;
    this.step(dt);
    this.renderer.draw(this.layout, this.game, this.state, this.fx);
    requestAnimationFrame((t) => this.frame(t));
  }

  private step(dt: number): void {
    const state = this.state;
    const session = this.game.session;
    state.time += dt;
    state.trayAge += dt;
    state.restartArmed = Math.max(0, state.restartArmed - dt);

    // Count the score up instead of jumping: the reward lasts a little longer.
    const gap = session.score - state.shownScore;
    state.shownScore = Math.abs(gap) < 0.5 ? session.score : state.shownScore + gap * Math.min(1, dt * 9);

    const targetHeat = session.status === 'playing' ? Math.min(1, session.streak / 6) : 0;
    state.heat += (targetHeat - state.heat) * Math.min(1, dt * 3);

    state.gameOverAge = session.status === 'gameOver' ? state.gameOverAge + dt : 0;
    this.fx.update(dt, this.layout.cell * 28);
  }

  private resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const safe = this.safeArea();
    this.layout = new GameLayout(width, height, this.game.session.board.size, safe.top, safe.bottom);
    this.cancelDrag();
  }

  private applyReducedMotion(reduced: boolean): void {
    this.state.reducedMotion = reduced;
    this.fx.reducedMotion = reduced;
  }

  // ---- input ------------------------------------------------------------

  private pointerPosition(e: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    e.preventDefault();
    this.feedback.unlock();
    const p = this.pointerPosition(e);

    if (contains(this.layout.soundButton, p)) {
      this.toggleSound();
      return;
    }
    if (contains(this.layout.restartButton, p)) {
      this.requestRestart();
      return;
    }
    this.state.restartArmed = 0;

    const session = this.game.session;
    if (session.status === 'gameOver') {
      if (this.gameOverReady() && contains(this.layout.playAgainButton, p)) {
        this.game.startNewGame();
      }
      return;
    }

    if (this.state.drag) {
      return; // a second finger must not steal the drag
    }
    const slot = this.layout.slotAt(p);
    const piece = slot >= 0 ? session.tray[slot] : null;
    if (!piece) {
      return;
    }
    this.state.drag = {
      slot,
      piece,
      pointerId: e.pointerId,
      lifted: e.pointerType !== 'mouse',
      cursor: p,
      target: null,
      clearRows: [],
      clearCols: [],
    };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimisation; dragging still works without it.
    }
    this.feedback.play('pickup');
    this.updateDragTarget();
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.state.drag;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    e.preventDefault();
    drag.cursor = this.pointerPosition(e);
    this.updateDragTarget();
  }

  private onPointerUp(e: PointerEvent, commit: boolean): void {
    const drag = this.state.drag;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    if (commit) {
      drag.cursor = this.pointerPosition(e);
      this.updateDragTarget();
    }
    this.state.drag = null;

    if (commit && drag.target) {
      this.game.tryPlace(drag.slot, drag.target);
    } else if (commit && contains(this.layout.board, drag.cursor)) {
      this.feedback.play('invalid');
    }
  }

  private cancelDrag(): void {
    this.state.drag = null;
  }

  /**
   * Forgiving snapping: take the nearest legal origin within about a cell of
   * where the piece is hovering, so near-misses still land where intended.
   */
  private updateDragTarget(): void {
    const drag = this.state.drag;
    if (!drag) {
      return;
    }
    const session = this.game.session;
    const shape = drag.piece.shape;
    const hover = this.layout.toBoard(this.layout.dragOrigin(shape, drag.cursor, drag.lifted));
    const baseRow = Math.round(hover.row);
    const baseCol = Math.round(hover.col);

    let best: GridPoint | null = null;
    let bestDistance = SNAP_TOLERANCE;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const candidate = { row: baseRow + dr, col: baseCol + dc };
        const distance = (candidate.row - hover.row) ** 2 + (candidate.col - hover.col) ** 2;
        if (distance < bestDistance && session.canPlace(drag.slot, candidate)) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }

    drag.target = best;
    if (best) {
      const preview = session.board.previewClear(shape, best);
      drag.clearRows = preview.rows;
      drag.clearCols = preview.cols;
    } else {
      drag.clearRows = [];
      drag.clearCols = [];
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'm') {
      this.toggleSound();
    } else if (key === 'r') {
      this.feedback.unlock();
      this.requestRestart();
    } else if ((key === ' ' || key === 'enter') && this.gameOverReady()) {
      e.preventDefault();
      this.feedback.unlock();
      this.game.startNewGame();
    }
  }

  private gameOverReady(): boolean {
    return (
      this.game.session.status === 'gameOver' &&
      this.state.gameOverAge > GAME_OVER_DELAY + GAME_OVER_FADE * 0.6
    );
  }

  private toggleSound(): void {
    const enabled = !this.game.profile.soundEnabled;
    this.game.setSoundEnabled(enabled);
    this.feedback.enabled = enabled;
    if (enabled) {
      this.feedback.play('pickup');
    }
  }

  /** Restart is instant when nothing is at stake, otherwise needs a second tap. */
  private requestRestart(): void {
    const session = this.game.session;
    const nothingToLose = session.status === 'gameOver' || session.score === 0;
    if (nothingToLose || this.state.restartArmed > 0) {
      this.game.startNewGame();
    } else {
      this.state.restartArmed = RESTART_CONFIRM_SECONDS;
    }
  }

  // ---- game events -> feedback -------------------------------------------

  private onGameStarted(): void {
    this.fx.clear();
    this.state.drag = null;
    this.state.restartArmed = 0;
    this.state.shownScore = 0;
    this.state.trayAge = 0;
    this.feedback.play('pickup');
  }

  private onPlaced(outcome: PlacementOutcome): void {
    const layout = this.layout;
    const lines = outcome.clear.lineCount;
    for (const cell of outcome.placedCells) {
      this.fx.pop(cell);
    }
    if (this.game.session.tray.every((piece) => piece !== null)) {
      this.state.trayAge = 0;
    }

    if (outcome.levelUp) {
      this.celebrate(`LEVEL ${outcome.level}`, Theme.block(outcome.level + 3), 0.16);
    }

    if (lines === 0) {
      this.feedback.play(outcome.levelUp ? 'levelUp' : 'place');
      return;
    }

    let sumX = 0;
    let sumY = 0;
    outcome.clear.cells.forEach((cell, index) => {
      const color = Theme.block(cell.colorIndex);
      const center = layout.cellCenter(cell.position);
      this.fx.flash(layout.cellRect(cell.position.row, cell.position.col), color, index * 0.012);
      this.fx.burst(center, color, 4, layout.cell * 7);
      sumX += center.x;
      sumY += center.y;
    });
    const count = Math.max(1, outcome.clear.cells.length);
    const margin = layout.cell * 1.5;
    const center: Point = {
      x: Math.max(layout.board.x + margin, Math.min(layout.board.x + layout.board.w - margin, sumX / count)),
      y: Math.max(layout.board.y + margin, sumY / count),
    };

    this.fx.addShake(2 + lines * 2.5 + Math.min(4, outcome.streak));
    const size = layout.cell * (0.62 + Math.min(0.5, lines * 0.1 + outcome.streak * 0.04));
    this.fx.floatText(`+${outcome.pointsEarned}`, center, Theme.gold, size, 1.2);

    const praise = this.praiseFor(outcome);
    if (praise) {
      this.fx.floatText(praise, { x: center.x, y: center.y - size * 1.05 }, Theme.white, size * 0.62, 1.3);
    }
    this.feedback.play('clear', outcome.streak - 1 + (lines - 1));
    if (outcome.levelUp) {
      this.feedback.play('levelUp');
    }
  }

  private praiseFor(outcome: PlacementOutcome): string | null {
    const lines = outcome.clear.lineCount;
    if (outcome.boardCleared) {
      return 'Perfect clear!';
    }
    if (lines >= 4) {
      return 'Incredible!';
    }
    if (lines === 3) {
      return 'Triple!';
    }
    if (lines === 2) {
      return 'Double!';
    }
    if (outcome.streak >= 2) {
      return `Combo ×${outcome.streak}`;
    }
    return null;
  }

  private onNewBest(): void {
    this.celebrate('NEW BEST!', Theme.gold, 0.34);
    this.feedback.play('newBest');
  }

  /** A banner across the board with a row of particle bursts. */
  private celebrate(text: string, color: Rgb, heightRatio: number): void {
    const board = this.layout.board;
    const y = board.y + board.h * heightRatio;
    this.fx.floatText(text, { x: board.x + board.w / 2, y }, color, this.layout.cell * 0.9, 1.8);
    for (let i = 0; i < 5; i++) {
      this.fx.burst({ x: board.x + board.w * (0.15 + 0.175 * i), y }, color, 10, this.layout.cell * 9);
    }
  }
}
