import { Board } from '../core/domain/board';
import type { Shape } from '../core/domain/shape';
import type { GameService } from '../core/services/gameService';
import type { EffectsLayer } from './effects';
import type { GameLayout, Point, Rect } from './layout';
import { css, darken, grey, lighten, mix, Theme, type Rgb } from './theme';
import { GAME_OVER_DELAY, GAME_OVER_FADE, type ViewState } from './viewState';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const easeOutBack = (t: number): number => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Draws one frame. Reads game and view state; never changes either. */
export class GameRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(layout: GameLayout, game: GameService, state: ViewState, fx: EffectsLayer): void {
    const ctx = this.ctx;
    this.drawBackground(layout, state);
    this.drawHud(layout, game, state);

    const shake = fx.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.drawBoard(layout, game, state, fx);
    this.drawTray(layout, game, state);
    this.drawOnboarding(layout, game, state);
    fx.draw(ctx, (rect, color, alpha, scale) => this.drawBlock(rect, color, alpha, scale));
    this.drawDraggedPiece(layout, state);
    ctx.restore();

    if (game.session.status === 'gameOver') {
      this.drawGameOver(layout, game, state);
    }
  }

  drawBlock(rect: Rect, color: Rgb, alpha = 1, scale = 1): void {
    const ctx = this.ctx;
    const size = (rect.w - rect.w * 0.1) * scale;
    if (size < 1 || alpha <= 0.01) {
      return;
    }
    const x = rect.x + (rect.w - size) / 2;
    const y = rect.y + (rect.h - size) / 2;
    const body: Rect = { x, y, w: size, h: size };

    const gradient = ctx.createLinearGradient(0, y, 0, y + size);
    gradient.addColorStop(0, css(lighten(color, 0.2), alpha));
    gradient.addColorStop(1, css(darken(color, 0.2), alpha));
    this.roundedPath(body, size * 0.22);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Soft top highlight: reads as a lit, touchable tile.
    this.roundedPath(
      { x: x + size * 0.12, y: y + size * 0.09, w: size * 0.76, h: size * 0.24 },
      size * 0.12,
    );
    ctx.fillStyle = `rgba(255,255,255,${0.26 * alpha})`;
    ctx.fill();
  }

  private drawBackground(layout: GameLayout, state: ViewState): void {
    const ctx = this.ctx;
    const { width: w, height: h } = layout;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, css(mix(Theme.backgroundTop, Theme.heatTop, state.heat * 0.75)));
    gradient.addColorStop(1, css(mix(Theme.backgroundBottom, Theme.heatBottom, state.heat * 0.75)));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // A slow, regular lattice of faint dots: enough movement to feel alive,
    // too quiet and predictable to pull attention from the board.
    const spacing = 46;
    const drift = state.reducedMotion ? 0 : (state.time * 5) % spacing;
    ctx.fillStyle = `rgba(255,255,255,${0.045 + state.heat * 0.03})`;
    let rowIndex = 0;
    for (let y = -spacing + drift; y < h + spacing; y += spacing, rowIndex++) {
      const shift = rowIndex % 2 === 0 ? 0 : spacing / 2;
      for (let x = shift; x < w + spacing; x += spacing) {
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
  }

  private drawHud(layout: GameLayout, game: GameService, state: ViewState): void {
    const ctx = this.ctx;
    const session = game.session;
    const u = layout.unit;
    const top = layout.safeTop;
    const centerX = layout.board.x + layout.board.w / 2;

    // Best score, top-left.
    this.text('BEST', layout.board.x, top + layout.pad + 8 * u, 12 * u, Theme.muted, 'left', 700);
    this.text(
      game.profile.bestScore.toLocaleString('en-US'),
      layout.board.x,
      top + layout.pad + 30 * u,
      22 * u,
      Theme.gold,
      'left',
      800,
    );

    this.drawRestartButton(layout.restartButton, state.restartArmed > 0);
    this.drawSoundButton(layout.soundButton, game.profile.soundEnabled);

    // Score, with a little swell while it is counting up.
    const pending = session.score - state.shownScore;
    const swell = state.reducedMotion ? 1 : 1 + 0.14 * clamp01(pending / 40);
    const scoreY = top + layout.hudHeight * 0.5;
    this.text(
      Math.round(state.shownScore).toLocaleString('en-US'),
      centerX,
      scoreY,
      Math.min(60, 52 * u) * swell,
      Theme.text,
      'center',
      800,
    );

    // Progress towards the next level: a visible goal that is always close.
    const barY = top + layout.hudHeight - 30 * Math.min(1, u) - 4;
    const barW = layout.board.w * 0.5;
    const bar: Rect = { x: centerX - barW / 2, y: barY, w: barW, h: 6 };
    const levelColor = Theme.block(session.level + 3);
    const ratio = session.levelProgress;
    this.roundedPath(bar, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    if (ratio > 0.01) {
      const fill = ctx.createLinearGradient(bar.x, 0, bar.x + bar.w, 0);
      fill.addColorStop(0, css(levelColor));
      fill.addColorStop(1, css(Theme.gold));
      this.roundedPath({ ...bar, w: Math.max(6, bar.w * ratio) }, 3);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    const labelSize = Math.max(11, 12 * u);
    this.text(`LV ${session.level}`, bar.x - 10, barY + 3, labelSize, Theme.text, 'right', 800);
    this.text(`${session.level + 1}`, bar.x + bar.w + 10, barY + 3, labelSize, Theme.muted, 'left', 800);
    const best = game.bestToBeat;

    // One status line under the bar: restart confirmation > combo > hint.
    const lineY = top + layout.hudHeight - 9;
    const lineSize = Math.max(12, 13 * u);
    if (state.restartArmed > 0) {
      this.text('Tap restart again to start over', centerX, lineY, lineSize, Theme.danger, 'center', 700);
    } else if (session.streak >= 2 && session.status === 'playing') {
      const pulse = state.reducedMotion ? 1 : 1 + 0.06 * Math.sin(state.time * 8);
      const color = mix(Theme.gold, Theme.danger, clamp01((session.streak - 2) / 6));
      this.text(`COMBO ×${session.streak}`, centerX, lineY, lineSize * 1.1 * pulse, color, 'center', 800);
    } else if (game.hasBeatenBest && best > 0) {
      this.text('NEW BEST', centerX, lineY, lineSize, Theme.gold, 'center', 800);
    } else if (this.isFirstRun(game) && !state.drag) {
      this.text(
        'Drag blocks onto the board · fill a row or column to clear it',
        centerX,
        lineY,
        Math.min(lineSize, layout.board.w / 30),
        Theme.muted,
        'center',
        600,
      );
    }
  }

  private drawBoard(layout: GameLayout, game: GameService, state: ViewState, fx: EffectsLayer): void {
    const ctx = this.ctx;
    const board = game.session.board;
    const frame = layout.cell * 0.14;
    const panel: Rect = {
      x: layout.board.x - frame,
      y: layout.board.y - frame,
      w: layout.board.w + 2 * frame,
      h: layout.board.h + 2 * frame,
    };

    // The board is the brightest surface and carries a faint glow, so it is
    // the natural resting place for the eye.
    ctx.save();
    ctx.shadowColor = css(mix(Theme.accent, Theme.danger, state.heat), 0.22 + state.heat * 0.25);
    ctx.shadowBlur = 28 + state.heat * 26;
    this.roundedPath(panel, layout.cell * 0.3);
    ctx.fillStyle = css(Theme.boardPanel);
    ctx.fill();
    ctx.restore();

    const drag = state.drag;
    const willClear = (row: number, col: number): boolean =>
      !!drag && (drag.clearRows.includes(row) || drag.clearCols.includes(col));
    const fade = clamp01(state.gameOverAge / GAME_OVER_DELAY);

    for (let row = 0; row < board.size; row++) {
      for (let col = 0; col < board.size; col++) {
        const rect = layout.cellRect(row, col);
        const color = board.colorAt(row, col);
        if (color === Board.EMPTY_CELL) {
          const inset = rect.w * 0.05;
          this.roundedPath(
            { x: rect.x + inset, y: rect.y + inset, w: rect.w - 2 * inset, h: rect.h - 2 * inset },
            rect.w * 0.2,
          );
          ctx.fillStyle = css(Theme.emptyCell);
          ctx.fill();
          continue;
        }

        let tint = Theme.block(color);
        if (drag && willClear(row, col)) {
          // Preview: cells about to clear take the colour of the held piece.
          tint = lighten(Theme.block(drag.piece.colorIndex), 0.25 + 0.15 * Math.sin(state.time * 10));
        } else if (fade > 0) {
          tint = mix(tint, darken(grey(tint), 0.35), fade);
        }
        this.drawBlock(rect, tint, 1, fx.popScale(row, col));
      }
    }

    if (drag?.target) {
      const ghost = Theme.block(drag.piece.colorIndex);
      const clears = drag.clearRows.length + drag.clearCols.length > 0;
      for (const offset of drag.piece.shape.cells) {
        const rect = layout.cellRect(drag.target.row + offset.row, drag.target.col + offset.col);
        this.drawBlock(rect, clears ? lighten(ghost, 0.3) : ghost, clears ? 0.8 : 0.42);
      }
    }
  }

  private drawTray(layout: GameLayout, game: GameService, state: ViewState): void {
    const session = game.session;
    session.tray.forEach((piece, slot) => {
      if (!piece || state.drag?.slot === slot) {
        return;
      }
      const playable = session.status === 'playing' && session.canPlaceAnywhere(slot);
      const dealt = state.reducedMotion ? 1 : clamp01((state.trayAge - slot * 0.06) / 0.28);
      if (dealt <= 0) {
        return;
      }
      const scale = easeOutBack(dealt);
      const bob = state.reducedMotion || !playable ? 0 : Math.sin(state.time * 2.2 + slot * 1.3) * 2;
      const origin = layout.trayPieceOrigin(piece.shape, slot);
      const color = playable ? Theme.block(piece.colorIndex) : darken(grey(Theme.block(piece.colorIndex)), 0.3);
      this.drawShape(
        piece.shape,
        { x: origin.x, y: origin.y + bob },
        layout.trayCell,
        color,
        playable ? 1 : 0.55,
        scale,
      );
    });
  }

  private isFirstRun(game: GameService): boolean {
    return game.profile.gamesPlayed === 0 && game.session.score === 0;
  }

  /**
   * First-run tutorial without words: a ghost of the first piece glides from
   * the tray to the board, over and over, until the player tries it.
   */
  private drawOnboarding(layout: GameLayout, game: GameService, state: ViewState): void {
    const piece = game.session.tray[0];
    if (!piece || state.drag || state.reducedMotion || !this.isFirstRun(game)) {
      return;
    }
    const t = (state.time % 2.6) / 2.6;
    const travel = clamp01((t - 0.1) / 0.55);
    const eased = travel * travel * (3 - 2 * travel);
    const alpha = 0.5 * Math.min(clamp01(t / 0.1), clamp01((1 - t) / 0.2));
    const from = layout.trayPieceOrigin(piece.shape, 0);
    const cell = layout.trayCell + (layout.cell - layout.trayCell) * eased;
    const toX = layout.board.x + (layout.board.w - piece.shape.cols * layout.cell) / 2;
    const toY = layout.board.y + layout.board.h * 0.62 - (piece.shape.rows * layout.cell) / 2;
    this.drawShape(
      piece.shape,
      { x: from.x + (toX - from.x) * eased, y: from.y + (toY - from.y) * eased },
      cell,
      lighten(Theme.block(piece.colorIndex), 0.2),
      alpha,
      1,
    );
  }

  private drawDraggedPiece(layout: GameLayout, state: ViewState): void {
    const drag = state.drag;
    if (!drag) {
      return;
    }
    const ctx = this.ctx;
    const origin = layout.dragOrigin(drag.piece.shape, drag.cursor, drag.lifted);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    this.drawShape(drag.piece.shape, origin, layout.cell, Theme.block(drag.piece.colorIndex), 0.95, 1);
    ctx.restore();
  }

  private drawShape(shape: Shape, origin: Point, cell: number, color: Rgb, alpha: number, scale: number): void {
    const cx = origin.x + (shape.cols * cell) / 2;
    const cy = origin.y + (shape.rows * cell) / 2;
    for (const offset of shape.cells) {
      const x = cx + (origin.x + offset.col * cell - cx) * scale;
      const y = cy + (origin.y + offset.row * cell - cy) * scale;
      this.drawBlock({ x, y, w: cell * scale, h: cell * scale }, color, alpha);
    }
  }

  private drawGameOver(layout: GameLayout, game: GameService, state: ViewState): void {
    const ctx = this.ctx;
    const alpha = clamp01((state.gameOverAge - GAME_OVER_DELAY) / GAME_OVER_FADE);
    if (alpha <= 0) {
      return;
    }
    const session = game.session;
    const panel = layout.gameOverPanel;
    const centerX = panel.x + panel.w / 2;
    const s = panel.w / 340;
    const slide = state.reducedMotion ? 0 : (1 - alpha) * 24;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6,7,20,0.72)';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.translate(0, slide);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    this.roundedPath(panel, 26 * s);
    ctx.fillStyle = css(Theme.panel);
    ctx.fill();
    ctx.restore();

    const beaten = game.hasBeatenBest;
    this.text(
      beaten ? 'NEW BEST!' : 'NO MORE MOVES',
      centerX,
      panel.y + panel.h * 0.14,
      (beaten ? 20 : 15) * s,
      beaten ? Theme.gold : Theme.muted,
      'center',
      800,
    );
    this.text(
      session.score.toLocaleString('en-US'),
      centerX,
      panel.y + panel.h * 0.34,
      64 * s,
      Theme.text,
      'center',
      800,
    );

    const gap = game.profile.bestScore - session.score;
    const line = beaten
      ? game.bestToBeat > 0
        ? `Previous best ${game.bestToBeat.toLocaleString('en-US')}`
        : `You reached level ${session.level}`
      : gap > 0
        ? `Only ${gap.toLocaleString('en-US')} from your best`
        : `Best ${game.profile.bestScore.toLocaleString('en-US')}`;
    this.text(line, centerX, panel.y + panel.h * 0.52, 15 * s, Theme.muted, 'center', 600);

    if (game.profile.dayStreak >= 2) {
      this.text(
        `${game.profile.dayStreak}-day streak`,
        centerX,
        panel.y + panel.h * 0.61,
        13 * s,
        Theme.gold,
        'center',
        700,
      );
    }

    const button = layout.playAgainButton;
    const pulse = state.reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(state.time * 3.2);
    ctx.save();
    ctx.shadowColor = css(Theme.success, 0.35 + 0.3 * pulse);
    ctx.shadowBlur = 16 + 14 * pulse;
    const fill = ctx.createLinearGradient(0, button.y, 0, button.y + button.h);
    fill.addColorStop(0, css(lighten(Theme.success, 0.15)));
    fill.addColorStop(1, css(darken(Theme.success, 0.15)));
    this.roundedPath(button, button.h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
    this.text(
      'PLAY AGAIN',
      centerX,
      button.y + button.h / 2 + 1,
      18 * s,
      { r: 8, g: 40, b: 24 },
      'center',
      800,
    );
    ctx.restore();
  }

  private drawRestartButton(rect: Rect, armed: boolean): void {
    const ctx = this.ctx;
    this.roundedPath(rect, rect.w * 0.3);
    ctx.fillStyle = armed ? css(Theme.danger) : 'rgba(255,255,255,0.08)';
    ctx.fill();

    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const r = rect.w * 0.22;
    const start = -Math.PI * 0.35;
    const end = Math.PI * 1.35;
    ctx.strokeStyle = css(armed ? Theme.white : Theme.muted);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(2, rect.w * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();

    // Arrow head at the start of the arc, pointing clockwise.
    const ax = cx + Math.cos(start) * r;
    const ay = cy + Math.sin(start) * r;
    const h = rect.w * 0.13;
    ctx.beginPath();
    ctx.moveTo(ax + h, ay + h * 0.2);
    ctx.lineTo(ax - h * 0.2, ay + h * 0.4);
    ctx.lineTo(ax + h * 0.5, ay - h);
    ctx.closePath();
    ctx.fill();
  }

  private drawSoundButton(rect: Rect, enabled: boolean): void {
    const ctx = this.ctx;
    this.roundedPath(rect, rect.w * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    const cx = rect.x + rect.w * 0.44;
    const cy = rect.y + rect.h / 2;
    const k = rect.w * 0.1;
    ctx.fillStyle = css(Theme.muted);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(2, rect.w * 0.055);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(cx - k * 2, cy - k * 0.8);
    ctx.lineTo(cx - k * 0.9, cy - k * 0.8);
    ctx.lineTo(cx + k * 0.5, cy - k * 2);
    ctx.lineTo(cx + k * 0.5, cy + k * 2);
    ctx.lineTo(cx - k * 0.9, cy + k * 0.8);
    ctx.lineTo(cx - k * 2, cy + k * 0.8);
    ctx.closePath();
    ctx.fill();

    if (enabled) {
      ctx.beginPath();
      ctx.arc(cx + k * 0.6, cy, k * 1.3, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + k * 0.6, cy, k * 2.4, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + k * 1.5, cy - k);
      ctx.lineTo(cx + k * 3.1, cy + k);
      ctx.moveTo(cx + k * 3.1, cy - k);
      ctx.lineTo(cx + k * 1.5, cy + k);
      ctx.stroke();
    }
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    color: Rgb,
    align: CanvasTextAlign,
    weight: number,
  ): void {
    const ctx = this.ctx;
    ctx.font = `${weight} ${Math.max(8, Math.round(size))}px ${Theme.font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css(color);
    ctx.fillText(value, x, y);
  }

  private roundedPath(r: Rect, radius: number): void {
    const ctx = this.ctx;
    const k = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
    ctx.beginPath();
    ctx.moveTo(r.x + k, r.y);
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
    ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
    ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
    ctx.closePath();
  }
}
