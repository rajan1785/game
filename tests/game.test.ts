import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Board } from '../src/core/domain/board';
import type { Piece } from '../src/core/domain/piece';
import { ShapeLibrary } from '../src/core/domain/shapeLibrary';
import { GameSession } from '../src/core/game/gameSession';
import { SteppedLevelProgression } from '../src/core/game/levelProgression';
import { FairPieceGenerator, type PieceGenerator } from '../src/core/generation/pieceGenerator';
import { SeededRandomSource } from '../src/core/generation/randomSource';
import type { Clock } from '../src/core/persistence/profile';
import { ComboScoringPolicy } from '../src/core/scoring/scoringPolicy';
import { GameService } from '../src/core/services/gameService';
import {
  LocalStorageProfileStore,
  type KeyValueStorage,
} from '../src/infrastructure/localStorageProfileStore';

class FixedGenerator implements PieceGenerator {
  constructor(private readonly shapeId: string) {}
  nextTray(_board: Board, count: number): Piece[] {
    return Array.from({ length: count }, () => ({
      shape: ShapeLibrary.get(this.shapeId),
      colorIndex: 0,
    }));
  }
}

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const clockAt = (day: number): Clock => ({ today: () => day });
const scoring = new ComboScoringPolicy();

test('scoring rewards multi-line clears and combos', () => {
  assert.equal(scoring.score(4, 0, 0, false), 4);
  assert.equal(scoring.score(4, 1, 1, false), 14);
  assert.equal(scoring.score(4, 2, 1, false), 34);
  assert.equal(scoring.score(4, 1, 3, false), 34);
  assert.equal(scoring.score(1, 1, 1, true), 211);
  assert.equal(scoring.score(0, 1, 50, false), 80, 'multiplier is capped');
});

test('tray refills after three placements and the game ends when nothing fits', () => {
  const session = new GameSession(new FixedGenerator('sq3'), scoring);
  let ended = 0;
  let refills = 0;
  session.ended.on(() => ended++);
  session.trayRefilled.on(() => refills++);

  assert.ok(session.tryPlace(0, { row: 0, col: 0 }));
  assert.equal(session.tray[0], null);
  assert.equal(session.tryPlace(0, { row: 0, col: 3 }), undefined, 'empty slot');
  assert.equal(session.tryPlace(1, { row: 0, col: 0 }), undefined, 'occupied cells');
  assert.ok(session.tryPlace(1, { row: 0, col: 3 }));
  assert.ok(session.tryPlace(2, { row: 3, col: 0 }));
  assert.equal(refills, 1);
  assert.equal(session.status, 'playing');

  assert.ok(session.tryPlace(0, { row: 3, col: 3 }));
  assert.equal(session.status, 'gameOver');
  assert.equal(ended, 1);
  assert.equal(session.score, 36);
  assert.equal(session.tryPlace(1, { row: 0, col: 6 }), undefined);
});

test('combo streak grows with consecutive clears and survives a short gap', () => {
  const session = new GameSession(new FixedGenerator('i4h'), scoring);
  session.tryPlace(0, { row: 0, col: 0 });
  const first = session.tryPlace(1, { row: 0, col: 4 });
  assert.equal(first?.streak, 1);
  assert.equal(first?.pointsEarned, 4 + 10 + 200); // line + board clear

  session.tryPlace(2, { row: 1, col: 0 }); // one move without a clear keeps the streak
  const second = session.tryPlace(0, { row: 1, col: 4 });
  assert.equal(second?.streak, 2);
  assert.equal(second?.pointsEarned, 4 + 20 + 200);

  session.tryPlace(1, { row: 2, col: 0 });
  session.tryPlace(2, { row: 3, col: 0 });
  session.tryPlace(0, { row: 4, col: 0 });
  assert.equal(session.streak, 0, 'three moves without a clear reset the streak');
});

test('a session round-trips through its saved state', () => {
  const generator = new FairPieceGenerator(new SeededRandomSource(7));
  const session = new GameSession(new FixedGenerator('i4h'), scoring);
  session.tryPlace(0, { row: 5, col: 2 });

  const json: unknown = JSON.parse(JSON.stringify(session.toState()));
  const restored = GameSession.tryRestore(json, generator, scoring);
  assert.ok(restored);
  assert.equal(restored.score, 4);
  assert.deepEqual(restored.board.toArray(), session.board.toArray());
  assert.equal(restored.tray[0], null);
  assert.equal(restored.tray[1]?.shape.id, 'i4h');

  assert.equal(GameSession.tryRestore(null, generator, scoring), undefined);
  assert.equal(GameSession.tryRestore({ boardSize: 8 }, generator, scoring), undefined);
  const badShape = { ...session.toState(), tray: [{ shapeId: 'nope', colorIndex: 0 }, null, null] };
  assert.equal(GameSession.tryRestore(badShape, generator, scoring), undefined);
});

test('the fair generator never deals a tray with no playable piece', () => {
  const random = new SeededRandomSource(12345);
  const generator = new FairPieceGenerator(random);
  for (let round = 0; round < 300; round++) {
    // A crowded random board with at least one hole.
    const cells = Array.from({ length: 64 }, () => (random.next() < 0.8 ? 0 : -1));
    cells[Math.floor(random.next() * 64)] = -1;
    const board = Board.tryFromArray(8, cells);
    assert.ok(board);
    const tray = generator.nextTray(board, 3, 1 + (round % 15));
    assert.equal(tray.length, 3);
    assert.ok(tray.some((p) => board.canPlaceAnywhere(p.shape)), `round ${round}`);
    assert.ok(tray.every((p) => p.colorIndex >= 0 && p.colorIndex < 7));
  }
});

test('simulated games with the fair generator always terminate legally', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const random = new SeededRandomSource(seed);
    const session = new GameSession(new FairPieceGenerator(random), scoring);
    let moves = 0;
    while (session.status === 'playing' && moves < 5000) {
      let moved = false;
      for (let slot = 0; slot < 3 && !moved; slot++) {
        const piece = session.tray[slot];
        if (!piece) continue;
        for (let row = 0; row < 8 && !moved; row++) {
          for (let col = 0; col < 8 && !moved; col++) {
            moved = session.tryPlace(slot, { row, col }) !== undefined;
          }
        }
      }
      assert.ok(moved, 'a playing session must always have a legal move');
      moves++;
    }
    assert.ok(session.score > 0);
  }
});

test('service tracks best score, announces a new best once, and resumes saved games', () => {
  const storage = new MemoryStorage();
  const store = new LocalStorageProfileStore(storage);
  const generator = new FixedGenerator('i4h');

  const first = new GameService(store, generator, scoring, clockAt(100));
  first.tryPlace(0, { row: 0, col: 0 });
  assert.equal(first.profile.bestScore, 4);
  assert.equal(first.profile.dayStreak, 1);

  // Next day: the unfinished game comes back and the day streak grows.
  const second = new GameService(store, generator, scoring, clockAt(101));
  assert.equal(second.session.score, 4);
  assert.equal(second.profile.dayStreak, 2);
  assert.equal(second.bestToBeat, 4);

  let announced = 0;
  second.newBest.on(() => announced++);
  second.tryPlace(1, { row: 0, col: 4 });
  second.tryPlace(2, { row: 1, col: 0 });
  assert.equal(announced, 1);
  assert.equal(second.hasBeatenBest, true);

  second.startNewGame();
  assert.equal(second.session.score, 0);
  assert.equal(second.bestToBeat, second.profile.bestScore);

  // Skipping days resets the streak.
  const third = new GameService(store, generator, scoring, clockAt(105));
  assert.equal(third.profile.dayStreak, 1);
});

test('profile store survives corrupt and missing storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(LocalStorageProfileStore.DEFAULT_KEY, '{not json');
  assert.equal(new LocalStorageProfileStore(storage).load().bestScore, 0);

  storage.setItem(LocalStorageProfileStore.DEFAULT_KEY, '{"bestScore":"lots","soundEnabled":false}');
  const profile = new LocalStorageProfileStore(storage).load();
  assert.equal(profile.bestScore, 0);
  assert.equal(profile.soundEnabled, false);

  const none = new LocalStorageProfileStore(undefined);
  none.save(none.load());
  assert.equal(none.load().gamesPlayed, 0);

  const service = new GameService(
    new LocalStorageProfileStore(storage),
    new FixedGenerator('dot'),
    scoring,
    clockAt(1),
  );
  assert.equal(service.session.status, 'playing');
});

test('levels start quickly, then take progressively more points', () => {
  const levels = new SteppedLevelProgression();
  assert.equal(levels.levelFor(0), 1);
  assert.equal(levels.levelFor(99), 1);
  assert.equal(levels.levelFor(100), 2);
  assert.equal(levels.levelFor(299), 2);
  assert.equal(levels.levelFor(300), 3);
  assert.equal(levels.threshold(5), 1000);

  const session = new GameSession(new FixedGenerator('i4h'), scoring);
  session.tryPlace(0, { row: 0, col: 0 });
  assert.equal(session.level, 1);
  const outcome = session.tryPlace(1, { row: 0, col: 4 }); // 214 points in one go
  assert.equal(outcome?.levelUp, true);
  assert.equal(outcome?.level, 2);
  assert.ok(session.levelProgress > 0 && session.levelProgress < 1);
});
