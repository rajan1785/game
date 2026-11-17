import { FairPieceGenerator } from './core/generation/pieceGenerator';
import { MathRandomSource } from './core/generation/randomSource';
import { ComboScoringPolicy } from './core/scoring/scoringPolicy';
import { GameService } from './core/services/gameService';
import { LocalStorageProfileStore, type KeyValueStorage } from './infrastructure/localStorageProfileStore';
import { SystemClock } from './infrastructure/systemClock';
import { WebAudioFeedback } from './ui/audio';
import { GameView, type SafeArea } from './ui/gameView';

/** Composition root: the only place that knows which concrete classes are used. */

function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // storage blocked (e.g. some private modes)
  }
}

function readSafeArea(): SafeArea {
  const probe = document.getElementById('safe-area-probe');
  if (!probe) {
    return { top: 0, bottom: 0 };
  }
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
  };
}

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Game canvas not found.');
  }

  const game = new GameService(
    new LocalStorageProfileStore(browserStorage()),
    new FairPieceGenerator(new MathRandomSource()),
    new ComboScoringPolicy(),
    new SystemClock(),
  );
  new GameView(canvas, game, new WebAudioFeedback(), readSafeArea).start();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support is optional.
    });
  }
}

boot();
