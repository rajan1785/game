// Inlines the bundle into one self-contained HTML file (dist/LuminaBlocks.html)
// that runs by double-clicking it - handy for sharing a build or for itch.io.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const js = readFileSync('web/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const icon = Buffer.from(readFileSync('web/icons/icon.svg')).toString('base64');

const out = html
  .replace('<script src="game.js"></script>', () => `<script>${js}</script>`)
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace('href="icons/icon.svg"', `href="data:image/svg+xml;base64,${icon}"`);

if (out === html || out.includes('src="game.js"')) {
  throw new Error('web/index.html no longer matches what this script expects.');
}
mkdirSync('dist', { recursive: true });
writeFileSync('dist/LuminaBlocks.html', out);
console.log(`dist/LuminaBlocks.html (${(out.length / 1024).toFixed(1)} kB)`);
