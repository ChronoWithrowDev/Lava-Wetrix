export const W = 24;
export const D = 24;
export const H = 10;

export const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
export const inBounds = (x: number, y: number, z: number) =>
  x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D;

export type PieceKind = "terrain" | "lava" | "arrow";

export interface PieceDef {
  defId: string;
  kind: PieceKind;
  name: string;
  tagline: string;
  desc: string;
  cells: [number, number][]; // [dx, dz]
  color: string;
  lavaAmount?: number; // per cell for lava kinds
  weight: number; // spawn weight baseline
}

/* ──────────────────────────────────────────────────────────────
   Big, Tetris-readable pieces with real presence.
   I = 4-long line (horizontal or vertical after rotate)
   L = 3 in a line + 1 foot (classic Tetris L, rotatable)
   O = 2×2 solid block
   One placement redraws the basin. One pour redraws the lake.
   ────────────────────────────────────────────────────────────── */

export const TERRAIN_DEFS: PieceDef[] = [
  {
    defId: "t-i",
    kind: "terrain",
    name: "I-Beam",
    tagline: "4-long straight line",
    desc: "Four basalt cubes in a line. Span a channel, dam a valley, wall off an entire flank in one drop.",
    cells: [
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    color: "#cbd5e1",
    weight: 36,
  },
  {
    defId: "t-l",
    kind: "terrain",
    name: "L-Wall",
    tagline: "L-shape · 3 + 1",
    desc: "Three in a row with a perpendicular foot — the Tetris L. Hooks corners, builds pocket pools, turns lava like a breakwater.",
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    color: "#a8b0c4",
    weight: 34,
  },
  {
    defId: "t-o",
    kind: "terrain",
    name: "Plateau",
    tagline: "2×2 solid mesa",
    desc: "A 2×2 solid block. Four cubes at once — a mesa that lava must split around. Heavy, visible, decisive.",
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    color: "#e2e8f0",
    weight: 30,
  },
];

export const LAVA_DEFS: PieceDef[] = [
  {
    defId: "l-i",
    kind: "lava",
    name: "I-Pour",
    tagline: "4-long line rupture",
    desc: "Four capsules in a straight I. It sheets lava across the floor — give it a channel or it will sheet everywhere.",
    cells: [
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    color: "#ff7a1a",
    lavaAmount: 0.92,
    weight: 34,
  },
  {
    defId: "l-l",
    kind: "lava",
    name: "L-Splash",
    tagline: "L-shape spill",
    desc: "An L of four capsules. It hooks around walls and hunts every gap. Beautiful and treacherous.",
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    color: "#ff6a00",
    lavaAmount: 0.88,
    weight: 32,
  },
  {
    defId: "l-o",
    kind: "lava",
    name: "Crucible",
    tagline: "2×2 deep pour",
    desc: "A 2×2 square of four capsules. Drops deep and stacks tall. Build a pit first, then let it fill like a chalice.",
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    color: "#ff4d00",
    lavaAmount: 0.9,
    weight: 30,
  },
];

export const ARROW_DEFS: PieceDef[] = [
  {
    defId: "a-flatten",
    kind: "arrow",
    name: "Flattening Arrow",
    tagline: "Column reset",
    desc: "A sky-arrow that vaporizes one entire column back to the floor. Erases mistakes — and lava.",
    cells: [[0, 0]],
    color: "#38e1ff",
    weight: 14,
  },
];

export const ALL_DEFS = [...TERRAIN_DEFS, ...LAVA_DEFS, ...ARROW_DEFS];

export interface PieceInstance {
  uid: number;
  def: PieceDef;
}

let uidCounter = 1;
export const makeInstance = (def: PieceDef): PieceInstance => ({
  uid: uidCounter++,
  def,
});

export function rotateCells(cells: [number, number][], rot: number): [number, number][] {
  let out = cells.map(([x, z]) => [x, z] as [number, number]);
  const turns = ((rot % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    out = out.map(([x, z]) => [-z, x] as [number, number]);
  }
  return out;
}

export function cellsBounds(cells: [number, number][]) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Clamp an origin so all cells stay inside the box */
export function clampOrigin(
  cells: [number, number][],
  x: number,
  z: number
): { x: number; z: number } {
  const { minX, maxX, minZ, maxZ } = cellsBounds(cells);
  const cx = Math.min(Math.max(x, -minX), W - 1 - maxX);
  const cz = Math.min(Math.max(z, -minZ), D - 1 - maxZ);
  return { x: cx, z: cz };
}

export function absoluteCells(
  cells: [number, number][],
  ox: number,
  oz: number
): [number, number][] {
  return cells.map(([dx, dz]) => [ox + dx, oz + dz] as [number, number]);
}

export function fallDurationMs(round: number, placedInRound: number): number {
  // Big field = room to think. Slower base than the small-board days.
  const base = 9000 - (round - 1) * 650 - placedInRound * 50;
  return Math.max(2600, base);
}

export function piecesForRound(round: number): number {
  return 14 + round * 2; // R1=16, R2=18... construction-scale rounds
}

export function lavaChaos(round: number): number {
  return 1 + (round - 1) * 0.12;
}
