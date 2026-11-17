/**
 * Visual language.
 *
 * - A deep, cool, low-contrast backdrop keeps arousal low and pushes the eye
 *   to the only bright things on screen: the blocks.
 * - Seven saturated block hues, spaced around the colour wheel and varied in
 *   lightness so they stay distinguishable for colour-blind players.
 * - Gold is reserved for reward (points, new best) so it keeps its meaning.
 * - "Heat" colours tint the backdrop as a combo builds: warmth = excitement.
 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const rgb = (hex: number): Rgb => ({
  r: (hex >> 16) & 0xff,
  g: (hex >> 8) & 0xff,
  b: hex & 0xff,
});

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
};

export const css = (c: Rgb, alpha = 1): string =>
  `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.max(0, Math.min(1, alpha))})`;

const WHITE = rgb(0xffffff);
const BLACK = rgb(0x000000);

export const lighten = (c: Rgb, t: number): Rgb => mix(c, WHITE, t);
export const darken = (c: Rgb, t: number): Rgb => mix(c, BLACK, t);

export const grey = (c: Rgb): Rgb => {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return { r: l, g: l, b: l };
};

const BLOCKS: readonly Rgb[] = [
  rgb(0xff5e6c), // coral
  rgb(0xffa63d), // amber
  rgb(0xffd93d), // sun
  rgb(0x3ddc84), // mint
  rgb(0x2ec4f1), // sky
  rgb(0x5b7cfa), // indigo
  rgb(0xb45cff), // violet
];

export const Theme = {
  white: WHITE,
  backgroundTop: rgb(0x151936),
  backgroundBottom: rgb(0x0a0c1c),
  heatTop: rgb(0x4a1d5c),
  heatBottom: rgb(0x1c0f33),
  boardPanel: rgb(0x1b2045),
  emptyCell: rgb(0x262c57),
  text: rgb(0xf4f6ff),
  muted: rgb(0x8c93c7),
  gold: rgb(0xffd166),
  accent: rgb(0x2ec4f1),
  success: rgb(0x3ddc84),
  danger: rgb(0xff5e6c),
  panel: rgb(0x20264f),
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

  block(index: number): Rgb {
    return BLOCKS[((index % BLOCKS.length) + BLOCKS.length) % BLOCKS.length];
  },
} as const;
