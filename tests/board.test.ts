import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Board } from '../src/core/domain/board';
import { Shape } from '../src/core/domain/shape';
import { ShapeLibrary } from '../src/core/domain/shapeLibrary';

const piece = (id: string, colorIndex = 0) => ({ shape: ShapeLibrary.get(id), colorIndex });

test('shape cells are normalised to the top-left', () => {
  const shape = new Shape('x', [{ row: 5, col: 7 }, { row: 6, col: 7 }, { row: 5, col: 7 }]);
  assert.deepEqual(shape.cells, [{ row: 0, col: 0 }, { row: 1, col: 0 }]);
  assert.equal(shape.rows, 2);
  assert.equal(shape.cols, 1);
});

test('shape ids are unique', () => {
  const ids = ShapeLibrary.all.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a piece cannot leave the board or overlap another', () => {
  const board = new Board();
  const square = ShapeLibrary.get('sq2');
  assert.equal(board.canPlace(square, { row: 7, col: 7 }), false);
  assert.equal(board.canPlace(square, { row: -1, col: 0 }), false);
  board.place(piece('sq2'), { row: 0, col: 0 });
  assert.equal(board.canPlace(square, { row: 1, col: 1 }), false);
  assert.equal(board.canPlace(square, { row: 2, col: 2 }), true);
  assert.throws(() => board.place(piece('sq2'), { row: 1, col: 1 }));
  assert.equal(board.filledCount, 4);
});

test('completing a row clears it', () => {
  const board = new Board();
  const first = board.place(piece('i4h'), { row: 0, col: 0 });
  assert.equal(first.clear.lineCount, 0);
  const second = board.place(piece('i4h', 3), { row: 0, col: 4 });
  assert.deepEqual(second.clear.rows, [0]);
  assert.deepEqual(second.clear.cols, []);
  assert.equal(second.clear.cells.length, 8);
  assert.equal(second.boardCleared, true);
  assert.equal(board.filledCount, 0);
});

test('a row and a column can clear together, sharing one cell', () => {
  const board = new Board();
  board.place(piece('i4h'), { row: 0, col: 1 });
  board.place(piece('i3h'), { row: 0, col: 5 });
  board.place(piece('i4v'), { row: 1, col: 0 });
  board.place(piece('i3v'), { row: 5, col: 0 });
  board.place(piece('dot'), { row: 4, col: 4 }); // bystander

  const preview = board.previewClear(ShapeLibrary.get('dot'), { row: 0, col: 0 });
  assert.deepEqual(preview, { rows: [0], cols: [0] });

  const result = board.place(piece('dot'), { row: 0, col: 0 });
  assert.equal(result.clear.lineCount, 2);
  assert.equal(result.clear.cells.length, 15);
  assert.equal(result.boardCleared, false);
  assert.equal(board.filledCount, 1);
  assert.equal(board.isFilled(4, 4), true);
});

test('preview does not change the board', () => {
  const board = new Board();
  board.place(piece('i4h'), { row: 2, col: 0 });
  const before = board.toArray();
  board.previewClear(ShapeLibrary.get('i4h'), { row: 2, col: 4 });
  assert.deepEqual(board.toArray(), before);
});

test('board round-trips through an array and rejects bad data', () => {
  const board = new Board();
  board.place(piece('l3a', 5), { row: 3, col: 3 });
  const copy = Board.tryFromArray(board.size, board.toArray());
  assert.ok(copy);
  assert.deepEqual(copy.toArray(), board.toArray());
  assert.equal(copy.filledCount, 5);

  assert.equal(Board.tryFromArray(8, [1, 2, 3]), undefined);
  assert.equal(Board.tryFromArray(8, 'nope'), undefined);
  assert.equal(Board.tryFromArray(99, []), undefined);
  assert.equal(Board.tryFromArray(4, new Array(16).fill('x')), undefined);
});
