import { Shape } from './shape';

const SHAPES: readonly Shape[] = [
  // Tier 1 - small, always welcome.
  Shape.parse('dot', 1, 'X'),
  Shape.parse('i2h', 1, 'XX'),
  Shape.parse('i2v', 1, 'X', 'X'),
  Shape.parse('d2a', 1, 'X.', '.X'),
  Shape.parse('d2b', 1, '.X', 'X.'),
  Shape.parse('l2a', 1, 'XX', 'X.'),
  Shape.parse('l2b', 1, 'XX', '.X'),
  Shape.parse('l2c', 1, 'X.', 'XX'),
  Shape.parse('l2d', 1, '.X', 'XX'),

  // Tier 2 - the bread and butter.
  Shape.parse('i3h', 2, 'XXX'),
  Shape.parse('i3v', 2, 'X', 'X', 'X'),
  Shape.parse('i4h', 2, 'XXXX'),
  Shape.parse('i4v', 2, 'X', 'X', 'X', 'X'),
  Shape.parse('sq2', 2, 'XX', 'XX'),
  Shape.parse('t_a', 2, 'XXX', '.X.'),
  Shape.parse('t_b', 2, '.X.', 'XXX'),
  Shape.parse('t_c', 2, 'X.', 'XX', 'X.'),
  Shape.parse('t_d', 2, '.X', 'XX', '.X'),
  Shape.parse('s_h', 2, '.XX', 'XX.'),
  Shape.parse('s_v', 2, 'X.', 'XX', '.X'),
  Shape.parse('z_h', 2, 'XX.', '.XX'),
  Shape.parse('z_v', 2, '.X', 'XX', 'X.'),

  // Tier 3 - big pieces that need planning.
  Shape.parse('i5h', 3, 'XXXXX'),
  Shape.parse('i5v', 3, 'X', 'X', 'X', 'X', 'X'),
  Shape.parse('r23', 3, 'XXX', 'XXX'),
  Shape.parse('r32', 3, 'XX', 'XX', 'XX'),
  Shape.parse('sq3', 3, 'XXX', 'XXX', 'XXX'),
  Shape.parse('l3a', 3, 'XXX', 'X..', 'X..'),
  Shape.parse('l3b', 3, 'XXX', '..X', '..X'),
  Shape.parse('l3c', 3, 'X..', 'X..', 'XXX'),
  Shape.parse('l3d', 3, '..X', '..X', 'XXX'),
];

const BY_ID = new Map(SHAPES.map((shape) => [shape.id, shape]));

/** The catalogue of every shape the game can deal. */
export const ShapeLibrary = {
  all: SHAPES,

  find(id: string): Shape | undefined {
    return BY_ID.get(id);
  },

  get(id: string): Shape {
    const shape = BY_ID.get(id);
    if (!shape) {
      throw new Error(`Unknown shape '${id}'.`);
    }
    return shape;
  },
} as const;
