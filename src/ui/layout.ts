import type { GridPoint } from '../core/domain/gridPoint';
import type { Shape } from '../core/domain/shape';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const contains = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Pure geometry: turns a viewport size into the rectangles everything is
 * drawn in and hit-tested against. One portrait column, centred, so the game
 * looks the same on a phone and in a desktop window.
 */
export class GameLayout {
  readonly pad: number;
  readonly hudHeight: number;
  readonly board: Rect;
  readonly cell: number;
  readonly tray: Rect;
  readonly trayCell: number;
  readonly soundButton: Rect;
  readonly restartButton: Rect;
  readonly gameOverPanel: Rect;
  readonly playAgainButton: Rect;
  /** Scale factor for text, 1 at a typical phone width. */
  readonly unit: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly boardSize: number,
    safeTop = 0,
    safeBottom = 0,
  ) {
    const w = Math.max(240, width);
    const h = Math.max(360, height) - safeTop - safeBottom;
    const column = Math.min(w, 560, h * 0.64);

    this.pad = Math.max(12, column * 0.04);
    this.hudHeight = clamp(h * 0.2, 112, 190);
    const trayHeight = clamp(h * 0.2, 96, 200);

    const side = Math.max(
      120,
      Math.min(column - 2 * this.pad, h - this.hudHeight - trayHeight - 2 * this.pad),
    );
    const spare = h - this.hudHeight - trayHeight - this.pad - side;
    const boardX = (w - side) / 2;
    const boardY = safeTop + this.hudHeight + Math.max(0, spare) * 0.25;

    this.board = { x: boardX, y: boardY, w: side, h: side };
    this.cell = side / boardSize;
    this.unit = side / 360;

    const trayY = boardY + side + this.pad;
    this.tray = {
      x: boardX,
      y: trayY,
      w: side,
      h: Math.max(60, Math.min(trayHeight, safeTop + h - trayY - this.pad * 0.5)),
    };
    this.trayCell = Math.min(this.cell * 0.62, Math.min(this.tray.w / 3, this.tray.h) / 5.2);

    const button = clamp(40 * this.unit, 40, 52);
    const top = safeTop + this.pad;
    this.soundButton = { x: boardX + side - button, y: top, w: button, h: button };
    this.restartButton = { x: boardX + side - 2 * button - 10, y: top, w: button, h: button };

    const panelW = Math.min(side, 340 * Math.max(1, this.unit));
    const panelH = panelW * 0.95;
    this.gameOverPanel = {
      x: (w - panelW) / 2,
      y: boardY + (side - panelH) / 2,
      w: panelW,
      h: panelH,
    };
    this.playAgainButton = {
      x: this.gameOverPanel.x + panelW * 0.14,
      y: this.gameOverPanel.y + panelH * 0.7,
      w: panelW * 0.72,
      h: panelH * 0.18,
    };
  }

  get safeTop(): number {
    return this.soundButton.y - this.pad;
  }

  cellRect(row: number, col: number): Rect {
    return {
      x: this.board.x + col * this.cell,
      y: this.board.y + row * this.cell,
      w: this.cell,
      h: this.cell,
    };
  }

  cellCenter(p: GridPoint): Point {
    return {
      x: this.board.x + (p.col + 0.5) * this.cell,
      y: this.board.y + (p.row + 0.5) * this.cell,
    };
  }

  slotRect(slot: number): Rect {
    const w = this.tray.w / 3;
    return { x: this.tray.x + slot * w, y: this.tray.y, w, h: this.tray.h };
  }

  /** Generous hit-testing: the whole third of the tray grabs its piece. */
  slotAt(p: Point): number {
    const reach: Rect = {
      x: this.tray.x - this.pad,
      y: this.tray.y - this.pad * 0.5,
      w: this.tray.w + 2 * this.pad,
      h: this.tray.h + this.pad,
    };
    if (!contains(reach, p)) {
      return -1;
    }
    return clamp(Math.floor((p.x - this.tray.x) / (this.tray.w / 3)), 0, 2);
  }

  /** Top-left corner that centres a shape in its tray slot. */
  trayPieceOrigin(shape: Shape, slot: number): Point {
    const r = this.slotRect(slot);
    return {
      x: r.x + (r.w - shape.cols * this.trayCell) / 2,
      y: r.y + (r.h - shape.rows * this.trayCell) / 2,
    };
  }

  /**
   * Top-left corner of a dragged piece. With touch the piece floats above
   * the finger so the player can see where it will land.
   */
  dragOrigin(shape: Shape, cursor: Point, lifted: boolean): Point {
    const lift = lifted ? this.cell * 1.4 + (shape.rows * this.cell) / 2 : 0;
    return {
      x: cursor.x - (shape.cols * this.cell) / 2,
      y: cursor.y - (shape.rows * this.cell) / 2 - lift,
    };
  }

  /** Fractional board coordinates of a pixel position. */
  toBoard(p: Point): { row: number; col: number } {
    return { row: (p.y - this.board.y) / this.cell, col: (p.x - this.board.x) / this.cell };
  }
}
