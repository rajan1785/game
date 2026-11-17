import type { GridPoint } from '../core/domain/gridPoint';
import type { Point, Rect } from './layout';
import { css, lighten, Theme, type Rgb } from './theme';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: Rgb;
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  color: Rgb;
}

interface CellFlash {
  rect: Rect;
  color: Rgb;
  age: number;
}

const POP_DURATION = 0.2;
const FLASH_DURATION = 0.32;

const easeOutBack = (t: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/**
 * Short-lived "juice": particles, floating score text, clear flashes, pop-in
 * and screen shake. Purely cosmetic - the game is fully playable without it,
 * which is exactly what `reducedMotion` does.
 */
export class EffectsLayer {
  reducedMotion = false;

  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private flashes: CellFlash[] = [];
  private readonly pops = new Map<string, number>();
  private now = 0;
  private shake = 0;

  burst(center: Point, color: Rgb, count: number, speed: number): void {
    if (this.reducedMotion || this.particles.length > 500) {
      return;
    }
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const life = 0.45 + Math.random() * 0.45;
      this.particles.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - speed * 0.35,
        life,
        maxLife: life,
        size: 2.5 + Math.random() * 4,
        color: Math.random() < 0.3 ? lighten(color, 0.6) : color,
      });
    }
  }

  floatText(text: string, at: Point, color: Rgb, size: number, life = 1.1): void {
    this.texts.push({ text, x: at.x, y: at.y, age: 0, life, size, color });
  }

  flash(rect: Rect, color: Rgb, delay: number): void {
    this.flashes.push({ rect, color, age: -delay });
  }

  pop(cell: GridPoint): void {
    this.pops.set(`${cell.row},${cell.col}`, this.now);
  }

  /** Scale to draw a board cell at; overshoots briefly after a placement. */
  popScale(row: number, col: number): number {
    if (this.pops.size === 0 || this.reducedMotion) {
      return 1;
    }
    const start = this.pops.get(`${row},${col}`);
    if (start === undefined) {
      return 1;
    }
    const t = (this.now - start) / POP_DURATION;
    return t >= 1 ? 1 : 0.6 + 0.4 * easeOutBack(Math.max(0, t));
  }

  addShake(amount: number): void {
    if (!this.reducedMotion) {
      this.shake = Math.min(16, this.shake + amount);
    }
  }

  shakeOffset(): Point {
    if (this.shake < 0.3) {
      return { x: 0, y: 0 };
    }
    return {
      x: (Math.random() * 2 - 1) * this.shake,
      y: (Math.random() * 2 - 1) * this.shake,
    };
  }

  clear(): void {
    this.particles = [];
    this.texts = [];
    this.flashes = [];
    this.pops.clear();
    this.shake = 0;
  }

  update(dt: number, gravity: number): void {
    this.now += dt;
    this.shake *= Math.exp(-dt * 9);

    for (const p of this.particles) {
      p.life -= dt;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) {
      t.age += dt;
    }
    this.texts = this.texts.filter((t) => t.age < t.life);

    for (const f of this.flashes) {
      f.age += dt;
    }
    this.flashes = this.flashes.filter((f) => f.age < FLASH_DURATION);

    for (const [key, start] of this.pops) {
      if (this.now - start > POP_DURATION) {
        this.pops.delete(key);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, drawBlock: (rect: Rect, color: Rgb, alpha: number, scale: number) => void): void {
    for (const f of this.flashes) {
      const t = Math.max(0, f.age / FLASH_DURATION);
      drawBlock(f.rect, lighten(f.color, (1 - t) * 0.85), 1 - t * t, 1 + 0.12 * Math.sin(t * Math.PI) - t * 0.5);
    }

    for (const p of this.particles) {
      const k = p.life / p.maxLife;
      ctx.fillStyle = css(p.color, k);
      const s = p.size * (0.4 + 0.6 * k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.age / t.life;
      const rise = this.reducedMotion ? 0 : t.size * 1.6 * (1 - Math.pow(1 - k, 3));
      const grow = this.reducedMotion ? 1 : 0.7 + 0.3 * easeOutBack(Math.min(1, t.age / 0.18));
      const alpha = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
      ctx.font = `800 ${Math.round(t.size * grow)}px ${Theme.font}`;
      ctx.fillStyle = `rgba(5,6,20,${alpha * 0.55})`;
      ctx.fillText(t.text, t.x, t.y - rise + Math.max(1.5, t.size * 0.06));
      ctx.fillStyle = css(t.color, alpha);
      ctx.fillText(t.text, t.x, t.y - rise);
    }
  }
}
