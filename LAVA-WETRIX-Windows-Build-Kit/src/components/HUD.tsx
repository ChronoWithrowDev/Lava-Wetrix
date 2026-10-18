import { memo } from "react";
import {
  Box,
  Droplets,
  ArrowDownToLine,
  Flame,
  Gauge,
  AlertTriangle,
  Trophy,
  Layers,
  RotateCw,
  Move,
  Space,
  MouseLeft,
  MouseRight,
  Mouse,
} from "lucide-react";
import type { PieceInstance } from "../game/constants";
import { rotateCells } from "../game/constants";

export function KindIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  if (kind === "terrain") return <Box size={size} />;
  if (kind === "lava") return <Droplets size={size} />;
  return <ArrowDownToLine size={size} />;
}

export const PieceMini = memo(function PieceMini({
  piece,
  large = false,
}: {
  piece: PieceInstance;
  large?: boolean;
}) {
  const cells = rotateCells(piece.def.cells, 0);
  const xs = cells.map((c) => c[0]);
  const zs = cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const w = maxX - minX + 1;
  const d = maxZ - minZ + 1;
  const set = new Set(cells.map(([x, z]) => `${x},${z}`));
  // visibly large — presence was the request
  const size = large ? "h-[30px] w-[30px]" : "h-[18px] w-[18px]";
  const gap = large ? "gap-[5px]" : "gap-[4px]";
  const color =
    piece.def.kind === "lava"
      ? "bg-gradient-to-br from-amber-300 via-orange-500 to-red-600 shadow-[0_0_14px_rgba(255,110,0,0.85)] border border-amber-300/40"
      : piece.def.kind === "arrow"
        ? "bg-gradient-to-br from-cyan-200 via-cyan-400 to-blue-600 shadow-[0_0_14px_rgba(56,225,255,0.85)] border border-cyan-200/40"
        : "bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 shadow-[0_0_10px_rgba(180,190,210,0.55)] border border-white/40";
  return (
    <div
      className={`grid ${gap} w-fit`}
      style={{ gridTemplateColumns: `repeat(${w}, minmax(0,1fr))` }}
    >
      {Array.from({ length: d }).map((_, rz) =>
        Array.from({ length: w }).map((_, cx) => {
          const x = minX + cx;
          const z = minZ + (d - 1 - rz);
          const filled = set.has(`${x},${z}`);
          return (
            <div
              key={`${cx}-${rz}`}
              className={`${size} rounded-[6px] ${filled ? color : "bg-white/[0.05] border border-white/[0.04]"}`}
            />
          );
        })
      )}
    </div>
  );
});

export function CurrentCard({
  piece,
  progress,
  landingHint,
  unstableCount = 0,
}: {
  piece: PieceInstance | null;
  progress: number;
  landingHint: string;
  unstableCount?: number;
}) {
  if (!piece)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
        No piece falling…
      </div>
    );
  const kind = piece.def.kind;
  const accent =
    kind === "lava"
      ? "border-orange-500/40 bg-gradient-to-br from-orange-950/80 to-red-950/40"
      : kind === "arrow"
        ? "border-cyan-400/40 bg-gradient-to-br from-cyan-950/80 to-blue-950/40"
        : "border-slate-400/30 bg-gradient-to-br from-slate-800/80 to-slate-900/60";
  return (
    <div className={`rounded-2xl border p-4 ${accent} backdrop-blur-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                kind === "lava"
                  ? "border-orange-500/30 bg-orange-500/20 text-orange-300"
                  : kind === "arrow"
                    ? "border-cyan-400/30 bg-cyan-400/20 text-cyan-300"
                    : "border-slate-400/20 bg-slate-400/20 text-slate-200"
              }`}
            >
              <KindIcon kind={kind} />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                {kind === "lava" ? "Lava capsules" : kind === "arrow" ? "Sky arrow" : "Terrain"}
              </div>
              <div className="text-[15px] font-black leading-tight text-white">{piece.def.name}</div>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/60">{piece.def.desc}</p>
          {unstableCount > 0 && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-950/50 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-red-200">
              <AlertTriangle size={13} className="mt-[1px] shrink-0" />
              <span>
                {kind === "arrow"
                  ? `${unstableCount} stone${unstableCount === 1 ? "" : "s"} will lose support and fall`
                  : `${unstableCount} of these stones won't be held — the span will collapse`}
              </span>
            </div>
          )}
        </div>
        <PieceMini piece={piece} large />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
          <span>Drop in</span>
          <span className="font-mono">{landingHint}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${
              kind === "lava"
                ? "bg-gradient-to-r from-amber-400 to-red-500"
                : kind === "arrow"
                  ? "bg-gradient-to-r from-cyan-300 to-blue-500"
                  : "bg-gradient-to-r from-slate-300 to-slate-500"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function QueueList({ queue }: { queue: PieceInstance[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-sm">
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        Up next
      </div>
      <div className="space-y-2">
        {queue.slice(0, 4).map((p, i) => (
          <div
            key={p.uid}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              i === 0
                ? "border-white/20 bg-white/[0.06]"
                : "border-white/[0.06] bg-white/[0.02] opacity-70"
            }`}
          >
            <span className="font-mono text-[11px] text-white/35">{String(i + 1).padStart(2, "0")}</span>
            <PieceMini piece={p} />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-white/90">{p.def.name}</div>
              <div className="truncate text-[11px] text-white/45">{p.def.tagline}</div>
            </div>
            <span className="ml-auto text-white/30">
              <KindIcon kind={p.def.kind} size={14} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Meter({
  icon,
  label,
  value,
  display,
  bar,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  display: string;
  bar?: boolean;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-white/50">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</span>
        <span className="ml-auto font-mono text-sm font-bold text-white">{display}</span>
      </div>
      {bar && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/50">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

export function StatsPanel({
  volume,
  stability,
  danger,
  overflow,
  round,
  placed,
  needed,
  score,
  best,
}: {
  volume: number;
  stability: number;
  danger: number;
  overflow: number;
  round: number;
  placed: number;
  needed: number;
  score: number;
  best: number;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/60 to-orange-950/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/60">
            <Flame size={13} /> Score
          </div>
          <div className="font-mono text-xl font-black tabular-nums text-amber-100">{score.toLocaleString()}</div>
          <div className="flex items-center gap-1 text-[11px] text-white/40">
            <Trophy size={11} /> best {best.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
            <Layers size={13} /> Round {round}
          </div>
          <div className="font-mono text-xl font-black tabular-nums text-white">
            {placed}
            <span className="text-sm text-white/40">/{needed}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
              style={{ width: `${Math.min(100, (placed / needed) * 100)}%` }}
            />
          </div>
        </div>
      </div>
      <Meter
        icon={<Droplets size={14} />}
        label="Lava held"
        value={Math.min(1, volume / 250)}
        display={`${volume.toFixed(1)}u`}
        bar
        tone="bg-gradient-to-r from-red-600 via-orange-500 to-amber-300"
      />
      <Meter
        icon={<Gauge size={14} />}
        label="Stability"
        value={stability}
        display={`${Math.round(stability * 100)}%`}
        bar
        tone="bg-gradient-to-r from-emerald-500 to-teal-300"
      />
      <div
        className={`rounded-xl border px-3 py-2.5 transition-colors ${
          overflow > 1
            ? "animate-pulse border-red-500/60 bg-red-950/50"
            : danger > 0.5
              ? "border-orange-500/40 bg-orange-950/30"
              : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className={overflow > 1 || danger > 0.5 ? "text-red-300" : "text-white/50"} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Overflow</span>
          <span className="ml-auto font-mono text-sm font-bold text-white">{Math.round(Math.min(100, overflow))}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-600"
            style={{ width: `${Math.min(100, overflow)}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-white/45">
          {overflow > 1 ? "LAVA AT THE RIM — it is spilling!" : danger > 0.5 ? "Getting close to the rim…" : "Rim is clear. Breathe."}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   CONTROLS PANEL — shown ONLY in pause menu / guide, never on
   the gameplay screen. The playfield stays clean: lava, stone,
   strategy. Round 3: W = screen-up, S = screen-down, always
   camera-relative; mouse-move positions the piece.
   ────────────────────────────────────────────────────────────── */
export function ControlsPanel() {
  const Row = ({ k, label, icon }: { k: string; label: string; icon?: React.ReactNode }) => (
    <div className="flex items-center gap-2 text-[12px] leading-tight text-white/60">
      <span className="flex min-w-[104px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 font-mono text-[11px] font-semibold text-white/85">
        {icon}
        {k}
      </span>
      <span className="text-white/55">{label}</span>
    </div>
  );
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
        <Mouse size={12} /> Controls
        <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-white/25">W/S fixed · camera spin added</span>
      </div>
      <div className="space-y-1.5">
        <Row k="Mouse move" label="Slide piece — it follows your cursor" icon={<Mouse size={11} />} />
        <Row k="Left Click" label="Drop piece" icon={<MouseLeft size={12} />} />
        <Row k="Right Click" label="Rotate piece" icon={<MouseRight size={12} />} />
        <Row k="Z / C / Arrows" label="Spin camera 45° around playfield" icon={<RotateCw size={11} />} />
        <Row k="W / ↑" label="Slide up (camera-relative)" icon={<Move size={11} />} />
        <Row k="S / ↓" label="Slide down (camera-relative)" icon={<Move size={11} />} />
        <Row k="A / D" label="Slide left / right" icon={<Move size={11} />} />
        <Row k="Q / E / R" label="Rotate piece" icon={<RotateCw size={11} />} />
        <Row k="SPACE" label="Drop piece" icon={<Space size={11} />} />
        <Row k="Drag" label="Free orbit · Scroll to zoom" />
        <Row k="F" label="Toggle fullscreen" />
        <Row k="P / Esc" label="Pause (controls live here)" />
      </div>
      <div className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200/70">
        Tip: stone needs support. Overhangs hold one, bridges hold two — longer spans collapse. A red ghost means
        it will fall.
      </div>
    </div>
  );
}

export function ControlsHelp() {
  return <ControlsPanel />;
}
