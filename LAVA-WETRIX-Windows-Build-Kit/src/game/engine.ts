import {
  W,
  D,
  H,
  idx,
  inBounds,
  PieceDef,
  PieceInstance,
  TERRAIN_DEFS,
  LAVA_DEFS,
  ARROW_DEFS,
  makeInstance,
  lavaChaos,
} from "./constants";

export function createTerrain(): Uint8Array {
  return new Uint8Array(W * D * H);
}

export function createLava(): Float32Array {
  return new Float32Array(W * D * H);
}

/** Highest solid Y in a column, or -1 if empty */
export function columnTop(terrain: Uint8Array, x: number, z: number): number {
  for (let y = H - 1; y >= 0; y--) {
    if (terrain[idx(x, y, z)]) return y;
  }
  return -1;
}

/** Highest solid Y strictly below yLimit in a column, or -1 */
export function columnTopBelow(terrain: Uint8Array, x: number, z: number, yLimit: number): number {
  for (let y = Math.min(yLimit, H) - 1; y >= 0; y--) {
    if (terrain[idx(x, y, z)]) return y;
  }
  return -1;
}

/** Landing Y for a set of absolute XZ cells (max of column tops + 1) */
export function landingY(terrain: Uint8Array, absCells: [number, number][]): number {
  let top = -1;
  for (const [x, z] of absCells) {
    if (x < 0 || x >= W || z < 0 || z >= D) continue;
    top = Math.max(top, columnTop(terrain, x, z));
  }
  return top + 1;
}

export interface PlaceResult {
  terrain: Uint8Array;
  lava: Float32Array;
  overflow: boolean;
  clearedColumn?: [number, number];
  releasedVolume?: number;
  placedCells?: [number, number, number][];
}

export function placePiece(
  terrainIn: Uint8Array,
  lavaIn: Float32Array,
  def: PieceDef,
  absCells: [number, number][],
  round: number
): PlaceResult {
  const terrain = new Uint8Array(terrainIn);
  const lava = new Float32Array(lavaIn);

  if (def.kind === "arrow") {
    const [x, z] = absCells[0];
    for (let y = 0; y < H; y++) {
      terrain[idx(x, y, z)] = 0;
      lava[idx(x, y, z)] = 0;
    }
    return { terrain, lava, overflow: false, clearedColumn: [x, z] };
  }

  const ly = landingY(terrain, absCells);
  if (ly >= H) {
    return { terrain: terrainIn, lava: lavaIn, overflow: true };
  }

  if (def.kind === "terrain") {
    const placed: [number, number, number][] = [];
    for (const [x, z] of absCells) {
      if (!inBounds(x, ly, z)) return { terrain: terrainIn, lava: lavaIn, overflow: true };
      terrain[idx(x, ly, z)] = 1;
      if (lava[idx(x, ly, z)] > 0.05) {
        const amt = lava[idx(x, ly, z)];
        lava[idx(x, ly, z)] = 0;
        if (ly + 1 < H) lava[idx(x, ly + 1, z)] = Math.min(1, lava[idx(x, ly + 1, z)] + amt);
      }
      placed.push([x, ly, z]);
    }
    return { terrain, lava, overflow: false, placedCells: placed };
  }

  // lava
  const chaos = lavaChaos(round);
  const per = (def.lavaAmount ?? 0.9) * chaos;
  let released = 0;
  const placed: [number, number, number][] = [];
  for (const [x, z] of absCells) {
    let yy = ly;
    while (yy < H && lava[idx(x, yy, z)] > 0.92 && !terrain[idx(x, yy, z)]) yy++;
    if (yy >= H) return { terrain, lava, overflow: true, releasedVolume: released };
    if (terrain[idx(x, yy, z)]) {
      let y2 = yy + 1;
      while (y2 < H && terrain[idx(x, y2, z)]) y2++;
      if (y2 >= H) return { terrain, lava, overflow: true, releasedVolume: released };
      yy = y2;
    }
    lava[idx(x, yy, z)] = Math.min(1.4, lava[idx(x, yy, z)] + per);
    released += per;
    placed.push([x, yy, z]);
  }
  return { terrain, lava, overflow: false, releasedVolume: released, placedCells: placed };
}

/* ══════════════════════════════════════════════════════════════
   BRIDGE PHYSICS
   A stone is SUPPORTED if stone (or the floor) is directly below.
   Unsupported stone survives only within BRIDGE_REACH of a
   supported stone through connected stone on the same level:
     · overhang of one  → holds
     · bridge over two  → holds (each span cell touches an anchor)
     · overhang of two  → the whole span collapses
     · bridge over three → the whole span collapses
   Collapse resolves in two phases (lift → fall) so it can animate,
   and chains until the structure is honest.
   ══════════════════════════════════════════════════════════════ */
export const BRIDGE_REACH = 1;

/** Every terrain cell that cannot hold under the bridge rule. */
export function findUnstable(terrain: Uint8Array): [number, number, number][] {
  const out: [number, number, number][] = [];
  const N = W * D;
  const dist = new Int16Array(N);
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);

  for (let y = 1; y < H; y++) {
    const base = N * y;
    const below = N * (y - 1);
    dist.fill(-1);
    let qh = 0;
    let qt = 0;
    let hanging = 0;
    for (let i = 0; i < N; i++) {
      if (!terrain[base + i]) continue;
      if (terrain[below + i]) {
        dist[i] = 0;
        queue[qt++] = i;
      } else hanging++;
    }
    if (hanging === 0) continue;

    // multi-source BFS from supported stone through connected stone
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % W;
      const z = (i - x) / W;
      const d = dist[i] + 1;
      if (x > 0 && terrain[base + i - 1] && dist[i - 1] < 0) {
        dist[i - 1] = d;
        queue[qt++] = i - 1;
      }
      if (x < W - 1 && terrain[base + i + 1] && dist[i + 1] < 0) {
        dist[i + 1] = d;
        queue[qt++] = i + 1;
      }
      if (z > 0 && terrain[base + i - W] && dist[i - W] < 0) {
        dist[i - W] = d;
        queue[qt++] = i - W;
      }
      if (z < D - 1 && terrain[base + i + W] && dist[i + W] < 0) {
        dist[i + W] = d;
        queue[qt++] = i + W;
      }
    }

    // group hanging stone into spans; a span fails as one piece
    seen.fill(0);
    for (let s = 0; s < N; s++) {
      if (!terrain[base + s] || dist[s] === 0 || seen[s]) continue;
      const members: number[] = [];
      let maxD = 0;
      let h = 0;
      let t = 0;
      queue[t++] = s;
      seen[s] = 1;
      while (h < t) {
        const i = queue[h++];
        members.push(i);
        const di = dist[i] < 0 ? 999 : dist[i];
        if (di > maxD) maxD = di;
        const x = i % W;
        const z = (i - x) / W;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, z > 0 ? i - W : -1, z < D - 1 ? i + W : -1];
        for (const j of nb) {
          if (j < 0) continue;
          if (terrain[base + j] && dist[j] !== 0 && !seen[j]) {
            seen[j] = 1;
            queue[t++] = j;
          }
        }
      }
      if (maxD > BRIDGE_REACH) {
        for (const i of members) {
          const x = i % W;
          out.push([x, y, (i - x) / W]);
        }
      }
    }
  }
  return out;
}

export interface Fall {
  x: number;
  z: number;
  fromY: number;
  toY: number;
}

/** Phase A — lift the doomed stones out of the grid and predict where each lands. */
export function liftCells(terrain: Uint8Array, cells: [number, number, number][]): { terrain: Uint8Array; falls: Fall[] } {
  const t = new Uint8Array(terrain);
  for (const [x, y, z] of cells) t[idx(x, y, z)] = 0;
  const scratch = new Uint8Array(t);
  const falls: Fall[] = [];
  const sorted = [...cells].sort((a, b) => a[1] - b[1]);
  for (const [x, y, z] of sorted) {
    const toY = columnTopBelow(scratch, x, z, y) + 1;
    if (toY < H) scratch[idx(x, toY, z)] = 1;
    falls.push({ x, z, fromY: y, toY });
  }
  return { terrain: t, falls };
}

/** Phase B — land fallen stones on whatever is below now; stone displaces lava upward. */
export function landFalls(
  terrain: Uint8Array,
  lava: Float32Array,
  falls: Fall[]
): { terrain: Uint8Array; lava: Float32Array; landed: Fall[] } {
  const t = new Uint8Array(terrain);
  const l = new Float32Array(lava);
  const landed: Fall[] = [];
  const sorted = [...falls].sort((a, b) => a.fromY - b.fromY);
  for (const f of sorted) {
    let toY = columnTopBelow(t, f.x, f.z, f.fromY) + 1;
    while (toY < H && t[idx(f.x, toY, f.z)]) toY++;
    if (toY >= H) continue;
    const i = idx(f.x, toY, f.z);
    t[i] = 1;
    if (l[i] > 0.05) {
      const amt = l[i];
      l[i] = 0;
      if (toY + 1 < H) {
        const up = idx(f.x, toY + 1, f.z);
        l[up] = Math.min(1, l[up] + amt);
      }
    }
    landed.push({ ...f, toY });
  }
  return { terrain: t, lava: l, landed };
}

/** What would fall if this piece were committed right now? (Drives the red ghost.) */
export function previewUnstable(
  terrain: Uint8Array,
  def: PieceDef,
  absCells: [number, number][],
  ly: number
): [number, number, number][] {
  if (def.kind === "lava") return [];
  const t = new Uint8Array(terrain);
  if (def.kind === "arrow") {
    const [x, z] = absCells[0];
    for (let y = 0; y < H; y++) t[idx(x, y, z)] = 0;
    return findUnstable(t);
  }
  if (ly >= H) return [];
  for (const [x, z] of absCells) if (inBounds(x, ly, z)) t[idx(x, ly, z)] = 1;
  return findUnstable(t);
}

/* ══════════════════════════════════════════════════════════════ */

export interface PhysicsResult {
  lava: Float32Array;
  movement: number;
  volume: number;
  maxDepth: number;
  deepCells: number;
  centroid: [number, number, number];
  topDanger: number;
  overflowCells: number;
}

/**
 * Thick-lava cellular automaton. Preserved from round 1:
 * falls fast, spreads slow, seeks its own level.
 */
export function stepLava(
  terrain: Uint8Array,
  lavaIn: Float32Array,
  dtScale = 1
): PhysicsResult {
  const next = new Float32Array(lavaIn);
  let movement = 0;

  const DOWN_RATE = 0.55 * dtScale;
  const SIDE_RATE = 0.14 * dtScale;

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y, z);
        if (terrain[i]) continue;
        const amt = next[i];
        if (amt < 0.015) {
          if (amt < 0.015 && amt > 0) {
            if (Math.abs(next[i]) < 0.015) next[i] = 0;
          }
          continue;
        }
        if (y > 0) {
          const bi = idx(x, y - 1, z);
          if (!terrain[bi]) {
            const belowAmt = next[bi];
            const space = 1 - belowAmt;
            if (space > 0.01) {
              const move = Math.min(amt, space, DOWN_RATE, amt * 0.9);
              if (move > 0.001) {
                next[i] -= move;
                next[bi] += move;
                movement += move;
                continue;
              }
            }
          }
        }
        const neighbours: number[][] = [];
        if (x > 0) neighbours.push([x - 1, z]);
        if (x < W - 1) neighbours.push([x + 1, z]);
        if (z > 0) neighbours.push([x, z - 1]);
        if (z < D - 1) neighbours.push([x, z + 1]);

        for (const [nx, nz] of neighbours) {
          const ni = idx(nx, y, nz);
          if (terrain[ni]) continue;
          const nAmt = next[ni];
          const diff = next[i] - nAmt;
          if (diff > 0.06) {
            const move = Math.min(diff * 0.28, SIDE_RATE, next[i] * 0.5);
            if (move > 0.002) {
              next[i] -= move;
              next[ni] += move;
              movement += move * 0.6;
            }
          }
        }
      }
    }
  }

  let volume = 0;
  let overflowCells = 0;
  let topDanger = 0;
  let cx = 0,
    cy = 0,
    cz = 0,
    cw = 0;
  let maxDepth = 0;
  let deepCells = 0;

  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      let depth = 0;
      for (let y = 0; y < H; y++) {
        const a = next[idx(x, y, z)];
        if (a > 0.12) {
          volume += a;
          depth++;
          deepCells++;
          cx += x;
          cy += y;
          cz += z;
          cw += a;
          if (y >= H - 3) topDanger = Math.max(topDanger, (y - (H - 4)) / 3 + a * 0.3);
          if (y >= H - 1 && a > 0.35) overflowCells++;
        } else if (a > 0.015) {
          volume += a;
        }
      }
      maxDepth = Math.max(maxDepth, depth);
    }
  }

  const centroid: [number, number, number] =
    cw > 0 ? [cx / Math.max(1, deepCells), cy / Math.max(1, deepCells), cz / Math.max(1, deepCells)] : [W / 2, 1, D / 2];

  return {
    lava: next,
    movement,
    volume,
    maxDepth,
    deepCells,
    centroid,
    topDanger: Math.min(1, topDanger),
    overflowCells,
  };
}

export function scoreTick(
  volume: number,
  movement: number,
  maxDepth: number,
  deepCells: number,
  round: number
): { points: number; stability: number; events: string[] } {
  const stability = 1 / (1 + movement * 2.2);
  const depthBonus = Math.min(3, Math.max(0, maxDepth - 1)) * 0.6;
  const spreadBonus = Math.min(2, deepCells / 14) * 0.4;
  const roundMult = 1 + (round - 1) * 0.35;
  const points = Math.round(volume * (2.2 + stability * 6 + depthBonus * 3 + spreadBonus * 2) * roundMult);
  const events: string[] = [];
  if (maxDepth >= 4 && volume > 6) events.push("DEEP POOL");
  if (stability > 0.93 && volume > 8) events.push("GLASS-CALM");
  return { points, stability, events };
}

export function detectClever(
  terrain: Uint8Array,
  lava: Float32Array
): { label: string; detail: string; bonus: number } | null {
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      let run = 0;
      for (let y = 0; y < H; y++) {
        if (lava[idx(x, y, z)] > 0.35 && !terrain[idx(x, y, z)]) run++;
        else run = 0;
        if (run >= 4) {
          return { label: "DEEP POOL", detail: "Four-deep magma well", bonus: 150 };
        }
      }
    }
  }
  for (let x = 1; x < W - 1; x++) {
    for (let z = 1; z < D - 1; z++) {
      for (let y = 0; y < 4; y++) {
        if (lava[idx(x, y, z)] > 0.3) {
          let walls = 0;
          if (terrain[idx(x + 1, y, z)]) walls++;
          if (terrain[idx(x - 1, y, z)]) walls++;
          if (terrain[idx(x, y, z + 1)]) walls++;
          if (terrain[idx(x, y, z - 1)]) walls++;
          if (walls >= 3) {
            return { label: "NARROW CHANNEL", detail: "Lava threaded through stone", bonus: 120 };
          }
        }
      }
    }
  }
  // Archway: lava flowing beneath a held bridge
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      for (let y = 1; y < H; y++) {
        if (terrain[idx(x, y, z)] && !terrain[idx(x, y - 1, z)] && lava[idx(x, y - 1, z)] > 0.3) {
          return { label: "ARCHWAY", detail: "Lava runs under a standing bridge", bonus: 160 };
        }
      }
  const levels = new Set<number>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) if (lava[idx(x, y, z)] > 0.3) levels.add(y);
  }
  if (levels.size >= 4) {
    return { label: "TERRACED BASINS", detail: "Lava held on many levels", bonus: 200 };
  }
  let adj = 0;
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      for (let y = 0; y < H; y++) {
        if (terrain[idx(x, y, z)]) {
          const nbs = [
            [x + 1, y, z],
            [x - 1, y, z],
            [x, y, z + 1],
            [x, y, z - 1],
          ];
          for (const [nx, ny, nz] of nbs) {
            if (nx < 0 || nx >= W || nz < 0 || nz >= D || ny < 0 || ny >= H) continue;
            if (lava[idx(nx, ny, nz)] > 0.25) {
              adj++;
              break;
            }
          }
        }
      }
  if (adj >= 36) {
    return { label: "MOAT ENGINEER", detail: "Stone kissing lava everywhere", bonus: 180 };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   SEQUENCER — stone-first rhythm.
   Round 1 is scripted (11 stone, 1 arrow, 4 pours in 16).
   After that, pieces come in bags: exactly one pour per bag of
   four (rounds ≤3) or three (later), shuffled, never two pours
   back to back. Players can read the queue and build toward it.
   ══════════════════════════════════════════════════════════════ */
type Kind = "terrain" | "lava" | "arrow";

const OPENING: Kind[] = [
  "terrain", "terrain", "terrain", "lava",
  "terrain", "terrain", "terrain", "lava",
  "terrain", "terrain", "arrow", "terrain",
  "lava", "terrain", "terrain", "lava",
];

let bag: Kind[] = [];
let lastKind: Kind = "terrain";

export function resetSequencer() {
  bag = [];
  lastKind = "terrain";
}

export function lavaEvery(round: number): number {
  return round <= 3 ? 4 : 3;
}

function refillBag(round: number) {
  const n = lavaEvery(round);
  const kinds: Kind[] = ["lava"];
  for (let i = 1; i < n; i++) kinds.push(Math.random() < 0.08 ? "arrow" : "terrain");
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  if (lastKind === "lava" && kinds[0] === "lava") {
    const k = kinds.findIndex((x) => x !== "lava");
    if (k > 0) [kinds[0], kinds[k]] = [kinds[k], kinds[0]];
  }
  bag = kinds;
}

export function nextKindForRound(round: number, pieceIndex: number): Kind {
  if (round === 1 && pieceIndex < OPENING.length) {
    lastKind = OPENING[pieceIndex];
    return lastKind;
  }
  if (bag.length === 0) refillBag(round);
  const k = bag.shift() as Kind;
  lastKind = k;
  return k;
}

function weightedPick(defs: PieceDef[], chaosBoost: number, kind: string): PieceDef {
  const pool = defs.map((d) => {
    let w = d.weight;
    if (kind === "lava" && d.cells.length >= 4) w *= chaosBoost;
    if (kind === "lava" && d.cells.length <= 1) w /= Math.sqrt(chaosBoost);
    return { d, w };
  });
  const total = pool.reduce((s, p) => s + p.w, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.d;
  }
  return pool[0].d;
}

export function generatePiece(round: number, pieceIndex: number): PieceInstance {
  const kind = nextKindForRound(round, pieceIndex);
  const chaosBoost = 1 + (round - 1) * 0.35;
  if (kind === "terrain") return makeInstance(weightedPick(TERRAIN_DEFS, 1, kind));
  if (kind === "lava") return makeInstance(weightedPick(LAVA_DEFS, chaosBoost, kind));
  return makeInstance(weightedPick(ARROW_DEFS, 1, kind));
}

export function initialQueue(): PieceInstance[] {
  // Mirrors OPENING[0..4]: stone, stone, stone, a Crucible taste of lava, stone
  const defs: PieceDef[] = [
    TERRAIN_DEFS[0],
    TERRAIN_DEFS[1],
    TERRAIN_DEFS[2],
    LAVA_DEFS[2],
    TERRAIN_DEFS[0],
  ];
  return defs.map(makeInstance);
}
