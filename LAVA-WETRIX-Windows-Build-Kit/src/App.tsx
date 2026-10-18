import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Home,
  Flame,
  RotateCw,
  RotateCcw as SpinCcw,
  Compass,
  Maximize,
  Minimize,
} from "lucide-react";
import LavaScene, { type FallingState, type CollapseFx } from "./components/LavaScene";
import { CurrentCard, QueueList, StatsPanel } from "./components/HUD";
import {
  MenuOverlay,
  PausedOverlay,
  RoundClearOverlay,
  GameOverOverlay,
  Toasts,
  type Toast,
} from "./components/Overlays";
import {
  W,
  D,
  H,
  fallDurationMs,
  piecesForRound,
  rotateCells,
  clampOrigin,
  absoluteCells,
  type PieceInstance,
  type PieceDef,
} from "./game/constants";
import {
  createTerrain,
  createLava,
  landingY,
  placePiece,
  stepLava,
  scoreTick,
  detectClever,
  generatePiece,
  initialQueue,
  resetSequencer,
  findUnstable,
  liftCells,
  landFalls,
  previewUnstable,
} from "./game/engine";
import { sfx, setMuted } from "./game/audio";

type Phase = "menu" | "playing" | "paused" | "roundClear" | "gameover";

interface FallingCtrl {
  ox: number;
  oz: number;
  rot: number;
  yFloat: number;
  landingY: number;
  spawnAt: number;
  duration: number;
  unstable: [number, number, number][];
}

const START_Y = H + 2.5;
const SPAWN_X = Math.floor(W / 2) - 1;
const SPAWN_Z = Math.floor(D / 2) - 1;
// bridge physics timing: a creak beat, then the fall, then any chain reaction
const CREAK_MS = 420;
const CHAIN_CREAK_MS = 160;
const FALL_MS = 520;

function demoBoard(): { t: Uint8Array; l: Float32Array } {
  const t = createTerrain();
  const l = createLava();
  const id = (x: number, y: number, z: number) => x + W * (z + D * y);
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1;
      if (edge) {
        t[id(x, 0, z)] = 1;
        if ((x + z) % 3 !== 0) t[id(x, 1, z)] = 1;
      }
    }
  }
  for (let x = 6; x < 18; x++) t[id(x, 0, 11)] = 0;
  for (let z = 5; z < 15; z++) t[id(11, 0, z)] = 0;
  t[id(8, 0, 7)] = 1;
  t[id(15, 0, 16)] = 1;
  t[id(16, 0, 7)] = 1;
  t[id(7, 0, 15)] = 1;
  for (let x = 7; x < 17; x++)
    for (let z = 7; z < 17; z++) {
      l[id(x, 0, z)] = 0.72 + ((x * 3 + z * 5) % 4) * 0.06;
      if (x >= 9 && x <= 14 && z >= 9 && z <= 14) l[id(x, 1, z)] = 0.45;
    }
  return { t, l };
}

let toastId = 1;
let fxId = 1;

export default function App() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [terrain, setTerrain] = useState<Uint8Array>(() => demoBoard().t);
  const [lava, setLava] = useState<Float32Array>(() => demoBoard().l);
  const [current, setCurrent] = useState<PieceInstance | null>(null);
  const [queue, setQueue] = useState<PieceInstance[]>(() => initialQueue());
  const [falling, setFalling] = useState<FallingCtrl | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("lava-wetrix-best") || 0));
  const [round, setRound] = useState(1);
  const [placed, setPlaced] = useState(0);
  const [volume, setVolume] = useState(0);
  const [stability, setStability] = useState(1);
  const [danger, setDanger] = useState(0);
  const [overflow, setOverflow] = useState(0);
  const [centroid, setCentroid] = useState<[number, number, number]>([W / 2, 1, D / 2]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMutedState] = useState(false);
  const [roundInfo, setRoundInfo] = useState({ bonus: 0, harvested: 0 });
  const [isBest, setIsBest] = useState(false);
  const [collapseFx, setCollapseFx] = useState<CollapseFx[]>([]);
  // camera spin state: accumulative delta angle (radians) & cinematic orbit toggle
  const [cameraRotateDelta, setCameraRotateDelta] = useState(0);
  const [cinematicOrbit, setCinematicOrbit] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const phaseRef = useRef(phase);
  const terrainRef = useRef(terrain);
  const lavaRef = useRef(lava);
  const currentRef = useRef(current);
  const queueRef = useRef(queue);
  const fallingRef = useRef(falling);
  const roundRef = useRef(round);
  const placedRef = useRef(placed);
  const scoreRef = useRef(score);
  const dangerRef = useRef(0);
  const overflowRef = useRef(overflow);
  const volumeRef = useRef(0);
  const movementRef = useRef(0);
  const maxDepthRef = useRef(0);
  const lastWarnRef = useRef(0);
  const lastCleverRef = useRef(0);
  const lastCleverLabelRef = useRef("");
  const pausedAtRef = useRef(0);
  const azimuthRef = useRef(0);
  const lastHoverRef = useRef<{ x: number; z: number } | null>(null);
  const downPosRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const settleRef = useRef<(depth: number) => void>(() => {});

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { terrainRef.current = terrain; }, [terrain]);
  useEffect(() => { lavaRef.current = lava; }, [lava]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { fallingRef.current = falling; }, [falling]);
  useEffect(() => { roundRef.current = round; }, [round]);
  useEffect(() => { placedRef.current = placed; }, [placed]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { dangerRef.current = danger; }, [danger]);
  useEffect(() => { overflowRef.current = overflow; }, [overflow]);

  const pushToast = useCallback((label: string, detail: string, bonus: number, kind: "bonus" | "warn" = "bonus") => {
    const id = toastId++;
    setToasts((t) => [...t.slice(-2), { id, label, detail, bonus, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  /* ---------- deferred timers that respect pause / round-clear ---------- */
  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  }, []);

  const schedule = useCallback((ms: number, fn: () => void) => {
    const handle = { id: 0 };
    const run = () => {
      timersRef.current.delete(handle.id);
      const ph = phaseRef.current;
      if (ph === "playing") fn();
      else if (ph === "paused" || ph === "roundClear") {
        handle.id = window.setTimeout(run, 120);
        timersRef.current.add(handle.id);
      }
      // menu / gameover: dropped
    };
    handle.id = window.setTimeout(run, ms);
    timersRef.current.add(handle.id);
  }, []);

  const previewFor = useCallback((def: PieceDef, abs: [number, number][], ly: number) => {
    return previewUnstable(terrainRef.current, def, abs, ly);
  }, []);

  /* ---------- spawning ---------- */
  const spawnWith = useCallback(
    (terrainArr: Uint8Array, queueArr: PieceInstance[], roundVal: number, placedVal: number) => {
      const cur = queueArr[0];
      if (!cur) return;
      const nextQ = [...queueArr.slice(1)];
      // the piece being pushed is #(placedVal + 1 + nextQ.length) in this round's sequence
      while (nextQ.length < 5) nextQ.push(generatePiece(roundVal, placedVal + 1 + nextQ.length));
      setCurrent(cur);
      currentRef.current = cur;
      setQueue(nextQ);
      queueRef.current = nextQ;
      lastHoverRef.current = null;
      const cells = rotateCells(cur.def.cells, 0);
      const { x: ox, z: oz } = clampOrigin(cells, SPAWN_X, SPAWN_Z);
      const abs = absoluteCells(cells, ox, oz);
      const ly = landingY(terrainArr, abs);
      const unstable = previewUnstable(terrainArr, cur.def, abs, ly);
      const duration = fallDurationMs(roundVal, placedVal);
      const f: FallingCtrl = { ox, oz, rot: 0, yFloat: START_Y, landingY: ly, spawnAt: performance.now(), duration, unstable };
      fallingRef.current = f;
      setFalling(f);
    },
    []
  );

  const startGame = useCallback(() => {
    clearTimers();
    resetSequencer();
    const t = createTerrain();
    const l = createLava();
    terrainRef.current = t;
    lavaRef.current = l;
    setTerrain(t);
    setLava(l);
    setCollapseFx([]);
    setScore(0);
    scoreRef.current = 0;
    setRound(1);
    roundRef.current = 1;
    setPlaced(0);
    placedRef.current = 0;
    setOverflow(0);
    overflowRef.current = 0;
    setVolume(0);
    volumeRef.current = 0;
    setStability(1);
    setDanger(0);
    setToasts([]);
    setIsBest(false);
    lastCleverRef.current = 0;
    lastHoverRef.current = null;
    const q = initialQueue();
    setQueue(q);
    queueRef.current = q;
    setPhase("playing");
    phaseRef.current = "playing";
    window.setTimeout(() => spawnWith(t, q, 1, 0), 30);
    sfx.ui();
  }, [spawnWith, clearTimers]);

  const gameOver = useCallback(() => {
    if (phaseRef.current === "gameover") return;
    clearTimers();
    phaseRef.current = "gameover";
    setPhase("gameover");
    setFalling(null);
    fallingRef.current = null;
    setCollapseFx([]);
    sfx.gameOver();
    const sc = scoreRef.current;
    const b = Number(localStorage.getItem("lava-wetrix-best") || 0);
    if (sc > b) {
      localStorage.setItem("lava-wetrix-best", String(sc));
      setBest(sc);
      setIsBest(true);
    }
  }, [clearTimers]);

  /** Recompute landing height + doom preview for the falling piece after the terrain changes. */
  const refreshFalling = useCallback(() => {
    const cur = currentRef.current;
    const fl = fallingRef.current;
    if (!cur || !fl) return;
    const cells = rotateCells(cur.def.cells, fl.rot);
    const abs = absoluteCells(cells, fl.ox, fl.oz);
    const ly = landingY(terrainRef.current, abs);
    const unstable = previewFor(cur.def, abs, ly);
    const nf: FallingCtrl = { ...fl, landingY: ly, unstable };
    fallingRef.current = nf;
    setFalling(nf);
  }, [previewFor]);

  /* ---------- bridge physics: creak → lift → fall → land → chain ---------- */
  const settleTerrain = useCallback(
    (depth: number) => {
      if (depth > 8) return;
      const unstable = findUnstable(terrainRef.current);
      if (unstable.length === 0) return;
      sfx.creak();
      schedule(depth === 0 ? CREAK_MS : CHAIN_CREAK_MS, () => {
        // re-check: a quick supporting stone dropped during the creak can save a span
        const doomed = findUnstable(terrainRef.current);
        if (doomed.length === 0) return;
        const { terrain: lifted, falls } = liftCells(terrainRef.current, doomed);
        terrainRef.current = lifted;
        setTerrain(lifted);
        const t0 = performance.now();
        setCollapseFx(falls.map((f) => ({ id: fxId++, ...f, t0, dur: FALL_MS })));
        sfx.collapse();
        const n = falls.length;
        pushToast(
          depth === 0 ? "SPAN COLLAPSED" : "CHAIN COLLAPSE",
          `${n} unsupported stone${n === 1 ? "" : "s"} fell`,
          0,
          "warn"
        );
        refreshFalling();
        schedule(FALL_MS, () => {
          const res = landFalls(terrainRef.current, lavaRef.current, falls);
          terrainRef.current = res.terrain;
          lavaRef.current = res.lava;
          setTerrain(res.terrain);
          setLava(res.lava);
          setCollapseFx([]);
          sfx.thud();
          refreshFalling();
          settleRef.current(depth + 1);
        });
      });
    },
    [schedule, pushToast, refreshFalling]
  );
  useEffect(() => {
    settleRef.current = settleTerrain;
  }, [settleTerrain]);

  /* ---------- placement ---------- */
  const doPlace = useCallback(() => {
    const cur = currentRef.current;
    const fl = fallingRef.current;
    if (!cur || !fl || phaseRef.current !== "playing") return;
    const cells = rotateCells(cur.def.cells, fl.rot);
    const abs = absoluteCells(cells, fl.ox, fl.oz);
    const res = placePiece(terrainRef.current, lavaRef.current, cur.def, abs, roundRef.current);
    if (res.overflow) {
      gameOver();
      return;
    }
    terrainRef.current = res.terrain;
    lavaRef.current = res.lava;
    setTerrain(res.terrain);
    setLava(res.lava);

    const newPlaced = placedRef.current + 1;
    placedRef.current = newPlaced;
    setPlaced(newPlaced);

    if (cur.def.kind === "lava") {
      sfx.lavaPour();
      const gain = Math.round((res.releasedVolume ?? 1) * 22);
      scoreRef.current += gain;
      setScore(scoreRef.current);
    } else if (cur.def.kind === "arrow") {
      sfx.arrow();
      const dangerBonus = Math.round(25 + dangerRef.current * 40 + overflowRef.current * 1.5);
      scoreRef.current += dangerBonus;
      setScore(scoreRef.current);
      if (res.clearedColumn) {
        pushToast("COLUMN VAPORIZED", `(${res.clearedColumn[0]}, ${res.clearedColumn[1]}) flattened to floor`, dangerBonus);
      }
    } else {
      sfx.placeStone();
      scoreRef.current += 10;
      setScore(scoreRef.current);
    }

    const needed = piecesForRound(roundRef.current);
    if (newPlaced >= needed) {
      const before = lavaRef.current.reduce((s, v) => s + v, 0);
      const drained = new Float32Array(lavaRef.current.map((v) => v * 0.55));
      lavaRef.current = drained;
      setLava(drained);
      const after = drained.reduce((s, v) => s + v, 0);
      const harvested = before - after;
      const bonus = Math.round(roundRef.current * 500 + harvested * 80);
      scoreRef.current += bonus;
      setScore(scoreRef.current);
      setRoundInfo({ bonus, harvested });
      setCurrent(null);
      currentRef.current = null;
      setFalling(null);
      fallingRef.current = null;
      setPhase("roundClear");
      phaseRef.current = "roundClear";
      sfx.roundClear();
      // any failing span resolves when the next round begins
      if (cur.def.kind !== "lava") settleRef.current(0);
      return;
    }
    spawnWith(res.terrain, queueRef.current, roundRef.current, newPlaced);
    // stone and arrows change the structure — let physics judge it
    if (cur.def.kind !== "lava") settleRef.current(0);
  }, [gameOver, pushToast, spawnWith]);

  const continueRound = useCallback(() => {
    const nr = roundRef.current + 1;
    roundRef.current = nr;
    setRound(nr);
    placedRef.current = 0;
    setPlaced(0);
    overflowRef.current = Math.max(0, overflowRef.current - 40);
    setOverflow(overflowRef.current);
    setPhase("playing");
    phaseRef.current = "playing";
    spawnWith(terrainRef.current, queueRef.current, nr, 0);
    sfx.ui();
  }, [spawnWith]);

  /* ---------- movement ---------- */
  const updateFallingPos = useCallback(
    (ox: number, oz: number, rot: number) => {
      const cur = currentRef.current;
      if (!cur) return;
      const cells = rotateCells(cur.def.cells, rot);
      const clamped = clampOrigin(cells, ox, oz);
      const abs = absoluteCells(cells, clamped.x, clamped.z);
      const ly = landingY(terrainRef.current, abs);
      const prev = fallingRef.current;
      if (!prev) return;
      const unstable = previewFor(cur.def, abs, ly);
      const nf: FallingCtrl = { ...prev, ox: clamped.x, oz: clamped.z, rot, landingY: ly, unstable };
      fallingRef.current = nf;
      setFalling(nf);
    },
    [previewFor]
  );

  /* Camera-relative movement: W is always screen-up, S always screen-down. */
  const moveScreen = useCallback(
    (sx: number, sy: number) => {
      if (phaseRef.current !== "playing") return;
      const fl = fallingRef.current;
      if (!fl) return;
      const phi = azimuthRef.current || 0;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const fx = sx * cos - sy * sin;
      const fz = -sx * sin - sy * cos;
      let dx = 0;
      let dz = 0;
      if (Math.abs(fx) >= Math.abs(fz)) dx = fx >= 0 ? 1 : -1;
      else dz = fz >= 0 ? 1 : -1;
      updateFallingPos(fl.ox + dx, fl.oz + dz, fl.rot);
      sfx.move();
    },
    [updateFallingPos]
  );

  /* Mouse-follow placement: the piece glides to the cursor, centred. */
  const handleHoverCell = useCallback(
    (hx: number, hz: number) => {
      if (phaseRef.current !== "playing") return;
      const cur = currentRef.current;
      const fl = fallingRef.current;
      if (!cur || !fl) return;
      const last = lastHoverRef.current;
      if (last && last.x === hx && last.z === hz) return;
      lastHoverRef.current = { x: hx, z: hz };
      const cells = rotateCells(cur.def.cells, fl.rot);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [dx, dz] of cells) {
        minX = Math.min(minX, dx);
        maxX = Math.max(maxX, dx);
        minZ = Math.min(minZ, dz);
        maxZ = Math.max(maxZ, dz);
      }
      const ox = Math.round(hx - (minX + maxX) / 2);
      const oz = Math.round(hz - (minZ + maxZ) / 2);
      const clamped = clampOrigin(cells, ox, oz);
      if (clamped.x === fl.ox && clamped.z === fl.oz) return;
      const abs = absoluteCells(cells, clamped.x, clamped.z);
      const ly = landingY(terrainRef.current, abs);
      const unstable = previewFor(cur.def, abs, ly);
      const nf: FallingCtrl = { ...fl, ox: clamped.x, oz: clamped.z, landingY: ly, unstable };
      fallingRef.current = nf;
      setFalling(nf);
    },
    [previewFor]
  );

  const rotate = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    const fl = fallingRef.current;
    if (!fl) return;
    updateFallingPos(fl.ox, fl.oz, (fl.rot + 1) % 4);
    sfx.rotate();
  }, [updateFallingPos]);

  const drop = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    doPlace();
  }, [doPlace]);

  /* Spin camera around the playfield in 45° (PI/4) steps */
  const spinCamera = useCallback((direction: 1 | -1) => {
    const step = (Math.PI / 4) * direction;
    setCameraRotateDelta((d) => d + step);
    sfx.ui();
  }, []);

  const toggleCinematicOrbit = useCallback(() => {
    setCinematicOrbit((prev) => !prev);
    sfx.ui();
  }, []);

  /* Fullscreen — standard API with a WebKit fallback for older Safari/Chromium shells */
  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const active = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (active) {
        if (doc.exitFullscreen) void doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } else {
        if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
        else el.webkitRequestFullscreen?.();
      }
    } catch {
      /* some embedded frames disallow fullscreen — fail quietly */
    }
    sfx.ui();
  }, []);

  // stay in sync however fullscreen changes (button, F key, browser Esc, F11-exit)
  useEffect(() => {
    const sync = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(!!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  /* ---------- falling rAF ---------- */
  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    const loop = () => {
      const fl = fallingRef.current;
      if (fl && phaseRef.current === "playing") {
        const now = performance.now();
        const p = Math.min(1, (now - fl.spawnAt) / fl.duration);
        const y = START_Y - (START_Y - fl.landingY) * p;
        if (p >= 1) {
          doPlace();
        } else {
          const nf = { ...fl, yFloat: y };
          fallingRef.current = nf;
          setFalling(nf);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, doPlace]);

  /* ---------- lava physics ---------- */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const res = stepLava(terrainRef.current, lavaRef.current);
      lavaRef.current = res.lava;
      setLava(res.lava);
      volumeRef.current = res.volume;
      movementRef.current = res.movement;
      maxDepthRef.current = res.maxDepth;
      setVolume(res.volume);
      setDanger(res.topDanger);
      setCentroid(res.centroid);
      setStability((s) => s * 0.7 + (1 / (1 + res.movement * 2.2)) * 0.3);

      let ov = overflowRef.current;
      if (res.overflowCells > 0) {
        ov = Math.min(100, ov + 15);
        const now = performance.now();
        if (now - lastWarnRef.current > 1200) {
          lastWarnRef.current = now;
          sfx.warning();
        }
      } else if (res.topDanger > 0.78) {
        ov = Math.min(100, ov + 4);
      } else {
        ov = Math.max(0, ov - 11);
      }
      overflowRef.current = ov;
      setOverflow(ov);
      if (ov >= 100) gameOver();
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, gameOver]);

  /* menu backdrop simmer */
  useEffect(() => {
    if (phase !== "menu" && phase !== "gameover") return;
    const id = window.setInterval(() => {
      const res = stepLava(terrainRef.current, lavaRef.current, 0.6);
      lavaRef.current = res.lava;
      setLava(new Float32Array(res.lava));
      setVolume(res.volume);
      setCentroid(res.centroid);
      setDanger(0);
    }, 350);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ---------- scoring tick ---------- */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const { points } = scoreTick(volumeRef.current, movementRef.current, maxDepthRef.current, 10, roundRef.current);
      if (points > 0) {
        scoreRef.current += points;
        setScore(scoreRef.current);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ---------- clever detection ---------- */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const found = detectClever(terrainRef.current, lavaRef.current);
      const now = performance.now();
      if (found && (now - lastCleverRef.current > 9000 || found.label !== lastCleverLabelRef.current)) {
        lastCleverRef.current = now;
        lastCleverLabelRef.current = found.label;
        scoreRef.current += found.bonus;
        setScore(scoreRef.current);
        pushToast(found.label, found.detail, found.bonus);
        sfx.clever();
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [phase, pushToast]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && (e.code === "Space" || e.code === "KeyR")) return;
      // fullscreen works from any screen — menu, play, pause, game over
      if (e.code === "KeyF" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      const inMenu = phaseRef.current === "menu";
      if (inMenu && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current === "gameover" && e.code === "Enter") {
        startGame();
        return;
      }
      if (e.code === "KeyP" || e.code === "Escape") {
        if (phaseRef.current === "playing") {
          pausedAtRef.current = performance.now();
          setPhase("paused");
          phaseRef.current = "paused";
        } else if (phaseRef.current === "paused") {
          const fl = fallingRef.current;
          if (fl) {
            const pausedFor = performance.now() - pausedAtRef.current;
            const nf = { ...fl, spawnAt: fl.spawnAt + pausedFor };
            fallingRef.current = nf;
            setFalling(nf);
          }
          setPhase("playing");
          phaseRef.current = "playing";
        }
        return;
      }
      if (phaseRef.current !== "playing") return;
      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          // ArrowLeft spins the camera left
          spinCamera(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          // ArrowRight spins the camera right
          spinCamera(1);
          break;
        case "KeyZ":
          e.preventDefault();
          spinCamera(-1);
          break;
        case "KeyC":
          e.preventDefault();
          spinCamera(1);
          break;
        case "KeyA":
          e.preventDefault();
          moveScreen(-1, 0);
          break;
        case "KeyD":
          e.preventDefault();
          moveScreen(1, 0);
          break;
        case "ArrowUp":
        case "KeyW":
          e.preventDefault();
          moveScreen(0, 1);
          break;
        case "ArrowDown":
        case "KeyS":
          e.preventDefault();
          moveScreen(0, -1);
          break;
        case "KeyQ":
        case "KeyE":
        case "KeyR":
          e.preventDefault();
          rotate();
          break;
        case "Space":
          e.preventDefault();
          drop();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveScreen, rotate, drop, startGame, spinCamera, toggleFullscreen]);

  const toggleMute = () => {
    const m = !muted;
    setMutedState(m);
    setMuted(m);
  };

  const pauseGame = () => {
    if (phase !== "playing") return;
    pausedAtRef.current = performance.now();
    setPhase("paused");
  };
  const resumeGame = () => {
    const fl = fallingRef.current;
    if (fl) {
      const pausedFor = performance.now() - pausedAtRef.current;
      const nf = { ...fl, spawnAt: fl.spawnAt + pausedFor };
      fallingRef.current = nf;
      setFalling(nf);
    }
    setPhase("playing");
  };
  const toMenu = () => {
    clearTimers();
    const d = demoBoard();
    terrainRef.current = d.t;
    lavaRef.current = d.l;
    setTerrain(d.t);
    setLava(d.l);
    setCollapseFx([]);
    setCurrent(null);
    currentRef.current = null;
    setFalling(null);
    fallingRef.current = null;
    lastHoverRef.current = null;
    setPhase("menu");
  };

  const needed = piecesForRound(round);
  const fallingScene: FallingState | null =
    current && falling && (phase === "playing" || phase === "paused")
      ? {
          def: current.def,
          cells: rotateCells(current.def.cells, falling.rot),
          ox: falling.ox,
          oz: falling.oz,
          yFloat: falling.yFloat,
          landingY: falling.landingY,
          unstable: falling.unstable,
        }
      : null;

  const dropProgress =
    falling && phase === "playing"
      ? Math.min(1, Math.max(0, (performance.now() - falling.spawnAt) / falling.duration))
      : 0;
  const timeLeft = falling ? Math.max(0, 1 - dropProgress) : 0;
  const landingHint = falling ? `${Math.max(0, ((1 - dropProgress) * falling.duration) / 1000).toFixed(1)}s` : "—";

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#050309] text-white">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/50 px-3 backdrop-blur-md sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 shadow-[0_0_20px_rgba(255,90,0,0.5)]">
            <Flame size={18} className="text-white" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-tight sm:text-base">
              <span className="bg-gradient-to-b from-amber-200 to-orange-500 bg-clip-text text-transparent">LAVA</span>{" "}
              <span className="bg-gradient-to-b from-sky-200 to-blue-500 bg-clip-text text-transparent">WETRIX</span>
              <span className="ml-2 hidden rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/55 sm:inline-flex">
                24×24
              </span>
            </div>
            <div className="hidden text-[10px] uppercase tracking-[0.22em] text-white/40 sm:block">Adam Withrow · Ukulele Porch</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="mr-1 hidden items-center gap-3 font-mono text-sm md:flex">
            <span className="text-white/50">
              R<span className="font-bold text-white">{round}</span>
            </span>
            <span className="font-black tabular-nums text-amber-200">{score.toLocaleString()}</span>
          </div>
          {/* Camera controls: spin left, spin right, auto-orbit toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
            <button
              onClick={() => spinCamera(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              title="Spin camera left 45° (Z / ←)"
            >
              <SpinCcw size={15} />
            </button>
            <button
              onClick={toggleCinematicOrbit}
              className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
                cinematicOrbit
                  ? "bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
              title="Toggle slow continuous orbit"
            >
              <Compass size={14} className={cinematicOrbit ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Orbit</span>
            </button>
            <button
              onClick={() => spinCamera(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              title="Spin camera right 45° (C / →)"
            >
              <RotateCw size={15} />
            </button>
          </div>

          <button onClick={toggleMute} className={iconBtn} title={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={toggleFullscreen}
            className={iconBtn}
            title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          {phase === "playing" && (
            <button onClick={pauseGame} className={iconBtn} title="Pause (P)">
              <Pause size={16} />
            </button>
          )}
          {phase === "paused" && (
            <button onClick={resumeGame} className={iconBtn} title="Resume">
              <Play size={16} />
            </button>
          )}
          {(phase === "playing" || phase === "paused") && (
            <>
              <button onClick={startGame} className={iconBtn} title="Restart">
                <RotateCcw size={16} />
              </button>
              <button onClick={toMenu} className={iconBtn} title="Menu">
                <Home size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 3D viewport — PC-only, deliberately bare: no buttons, no legend, just the glass */}
        <section
          className={`relative min-h-[50vh] flex-1 lg:min-h-0 ${phase === "playing" ? "cursor-crosshair" : ""}`}
          onContextMenu={(e) => {
            if (phase === "playing") e.preventDefault();
          }}
          onPointerDown={(e) => {
            if (phase !== "playing") return;
            if (e.button === 2) {
              e.preventDefault();
              rotate();
              return;
            }
            if (e.button === 0) {
              downPosRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
            }
          }}
          onPointerUp={(e) => {
            if (phase !== "playing") return;
            if (e.button !== 0) return;
            const start = downPosRef.current;
            downPosRef.current = null;
            if (!start) return;
            const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
            const dt = performance.now() - start.t;
            if (dist < 10 && dt < 450) {
              e.preventDefault();
              drop();
            }
          }}
        >
          <div className="absolute inset-0">
            <LavaScene
              terrain={terrain}
              lava={lava}
              falling={fallingScene}
              collapseFx={collapseFx}
              centroid={centroid}
              volume={volume}
              danger={danger}
              overflowPulse={overflow / 100}
              autoOrbit={phase === "menu"}
              azimuthRef={azimuthRef}
              rotateDelta={cameraRotateDelta}
              cinematicOrbit={cinematicOrbit}
              onHoverCell={phase === "playing" ? handleHoverCell : undefined}
              hoverY={falling ? falling.landingY + 0.5 : 0.5}
            />
          </div>
          <Toasts toasts={toasts} />

          {phase === "playing" && (overflow > 1 || danger > 0.6) && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <div
                className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold backdrop-blur-md ${
                  overflow > 1 ? "animate-pulse border-red-500/60 bg-red-950/70 text-red-200" : "border-orange-500/40 bg-black/60 text-orange-200"
                }`}
              >
                <Flame size={13} />
                {overflow > 1 ? "OVERFLOW — LAVA AT THE RIM" : "RIM WARNING"}
              </div>
            </div>
          )}
        </section>

        {/* side panel — status + queue only */}
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-black/40 p-3 backdrop-blur-md lg:w-[360px] lg:border-l lg:border-t-0">
          <CurrentCard
            piece={current}
            progress={timeLeft}
            landingHint={landingHint}
            unstableCount={current && current.def.kind !== "lava" ? falling?.unstable.length ?? 0 : 0}
          />
          <StatsPanel volume={volume} stability={stability} danger={danger} overflow={overflow} round={round} placed={placed} needed={needed} score={score} best={best} />
          <QueueList queue={queue} />
          <p className="px-1 pb-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/25">Being is enough · Wahoo! · 24×24 Field</p>
        </aside>
      </div>

      {phase === "menu" && <MenuOverlay best={best} onStart={startGame} />}
      {phase === "paused" && <PausedOverlay onResume={resumeGame} onRestart={startGame} onMenu={toMenu} />}
      {phase === "roundClear" && <RoundClearOverlay round={round} bonus={roundInfo.bonus} harvested={roundInfo.harvested} score={score} onContinue={continueRound} />}
      {phase === "gameover" && <GameOverOverlay score={score} best={best} round={round} volume={volume} isBest={isBest} onRestart={startGame} onMenu={toMenu} />}
    </div>
  );
}
