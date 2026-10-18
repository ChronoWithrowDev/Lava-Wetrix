import {
  Play,
  RotateCcw,
  Home,
  Flame,
  Box,
  Droplets,
  ArrowDownToLine,
  Sparkles,
  Waves,
  Keyboard,
  Hammer,
  Maximize2,
  Eye,
  Lightbulb,
  Gauge,
  Trophy,
  X,
  ChevronRight,
  Pause,
  AlertTriangle,
} from "lucide-react";
import { ControlsPanel } from "./HUD";

export interface Toast {
  id: number;
  label: string;
  detail: string;
  bonus: number;
  kind?: "bonus" | "warn";
}

function EmberField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 26 }).map((_, i) => (
        <span
          key={i}
          className="ember"
          style={{
            left: `${(i * 37.7) % 100}%`,
            animationDelay: `${(i * 0.7) % 8}s`,
            animationDuration: `${5 + ((i * 13) % 6)}s`,
            width: `${3 + ((i * 7) % 4)}px`,
            height: `${3 + ((i * 7) % 4)}px`,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_110%,rgba(255,90,0,0.22),transparent_70%)]" />
    </div>
  );
}

function TitleBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative text-center ${compact ? "" : "mb-2"}`}>
      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-orange-200/60">
        <Flame size={13} className="text-orange-400" />
        Adam Withrow · Ukulele Porch
        <Flame size={13} className="text-orange-400" />
      </div>
      <h1
        className={`font-black leading-none tracking-tight ${
          compact ? "text-4xl" : "text-5xl sm:text-7xl"
        }`}
      >
        <span className="bg-gradient-to-b from-amber-200 via-orange-400 to-red-600 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(255,90,0,0.45)]">
          LAVA
        </span>{" "}
        <span className="bg-gradient-to-b from-cyan-100 via-sky-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(56,189,248,0.35)]">
          WETRIX
        </span>
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        A slow, glowing 3D puzzle of stone, magma & clever containment — on a grand 24×24 field.
      </p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-orange-200/80">
        <span className="text-orange-300">{icon}</span>
        {title}
      </div>
      <div className="space-y-2 text-[13px] leading-relaxed text-white/70">{children}</div>
    </div>
  );
}

export function FieldGuide() {
  return (
    <div className="grid gap-3 text-left md:grid-cols-2">
      <Section icon={<Maximize2 size={14} />} title="The 24×24 field">
        <p>
          The glass box is now <b className="text-white">24 × 24 wide, 10 tall</b> — nine times the floor of the
          original. Long rounds feel like real construction: ring a rim, terrace two or three basins, keep a deep
          well open in the middle and a shallow overflow pan on the flank.
        </p>
        <p>
          <b className="text-white">The rhythm is stone-first:</b> about three stones for every pour. Round one
          deals eleven stones, one arrow and four pours; after that, pours arrive one per bag of four (later three),
          never back to back. Read the queue, build toward the pour, let it come to you.
        </p>
      </Section>
      <Section icon={<Box size={14} />} title="I / L / O pieces">
        <p>
          Every piece is <b className="text-white">Tetris-readable and chunky</b>:{" "}
          <b className="text-slate-200">I-Beam</b> (4 in a line, either direction),{" "}
          <b className="text-slate-200">L-Wall</b> (3 + 1 foot, rotatable),{" "}
          <b className="text-slate-200">Plateau</b> (2×2 solid mesa).
        </p>
        <p>
          Lava pours mirror the same I/L/O shapes, so you can <i>see</i> the threat — a 4-long I-Pour sheets across
          the floor unless you channel it.
        </p>
      </Section>
      <Section icon={<Keyboard size={14} />} title="Controls (PC)">
        <p>
          <b className="text-white">Move the mouse</b> and the falling piece follows your cursor, ghost marker and
          all. <b className="text-white">Left click</b> drops, <b className="text-white">right click</b> rotates,
          drag orbits the camera, scroll zooms.
        </p>
        <p>
          <b className="text-white">Rotate the entire play area:</b> press <b className="text-white">Z / C</b> or
          the rotate buttons in the header to spin the camera around the playfield in 45° steps. Toggle{" "}
          <b className="text-white">Orbit</b> to let it slowly glide around your creation continuously just for the joy
          of seeing it from all sides.
        </p>
        <p>
          Keyboard remains a full alternative: <b className="text-white">W/↑ screen-up, S/↓ screen-down</b> (always
          camera-relative, even while spinning), A/D strafe, Q/E/R rotate piece, Space drops, P pauses, and{" "}
          <b className="text-white">F</b> toggles fullscreen.
        </p>
      </Section>
      <Section icon={<Hammer size={14} />} title="Bridge physics">
        <p>
          Stone needs support. A stone with nothing beneath it holds only if it&apos;s touching a supported stone:{" "}
          <b className="text-white">overhangs of one hold, bridges across a two-wide gap hold</b>. Reach further
          and the whole span creaks, lifts, and falls to whatever is below.
        </p>
        <p>
          The ghost turns <b className="text-red-300">red</b> wherever a placement would fail. Arrows that cut a
          supporting column can bring a wall down too — or leave a standing lintel. Lava pooled on a failing bridge
          cascades with it.
        </p>
      </Section>
      <Section icon={<Waves size={14} />} title="What the lava does">
        <p>
          Lava is still thick and patient: <b className="text-white">falls fast, spreads slow</b>, seeks its own
          level one heavy tick at a time. On 24×24 it has glorious room to sheet and pool — calm, deep basins score
          fastest.
        </p>
        <p>
          Watch a pour settle after a tricky channel build. The glow finding level is the whole reward.
        </p>
      </Section>
      <Section icon={<Eye size={14} />} title="A clean playfield">
        <p>
          Built for PC: <b className="text-white">no touch panel, no control legend, no roof</b>. Nothing between you
          and the lava but the ghost marker, the rim light, and the open sky above the glass.
        </p>
        <p>
          Controls live here in the guide and in the <b className="text-white">pause menu (P / Esc)</b>. Learn by
          playing; check by pausing.
        </p>
      </Section>
      <Section icon={<Lightbulb size={14} />} title="What makes you feel clever">
        <p>
          Threading a 4-long I-Pour down a channel you laid two turns ago with an I-Beam. Or hooking an L-Splash
          around an L-Wall with a flick of the mouse and watching it fill a pocket you left on purpose.
        </p>
        <p>
          The game notices: <b className="text-amber-200">DEEP POOL · NARROW CHANNEL · TERRACED BASINS · MOAT ENGINEER</b>{" "}
          — each a little bonus and a bow.
        </p>
      </Section>
      <Section icon={<Gauge size={14} />} title="What makes it hard">
        <p>
          Space is a resource you can waste. Pour big lava onto flat open floor and it sheets thin and wide, creeping
          toward the rim from everywhere at once. Undisciplined building fills the courtyard; disciplined building
          digs wells.
        </p>
        <p>
          Your mistakes are larger now. One misplaced Plateau can split a basin you needed whole. The Arrow forgives —
          one column at a time.
        </p>
      </Section>
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-950/50 to-red-950/20 p-4 backdrop-blur-sm md:col-span-2">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-orange-200/80">
          <Sparkles size={14} className="text-amber-300" />
          How I&apos;d play it
        </div>
        <p className="text-[13px] leading-relaxed text-white/70">
          On 24×24 I&apos;d ring the rim with I-Beams, leave the centre low, and use L-Walls to split the floor into
          a deep well and a shallow overflow pan. Build walls two stones thick before you stack a third storey —
          stone that floats, falls. Then bridge a two-wide channel on purpose and let a pour run under the arch.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">
          <b className="text-white">The glow:</b> still the lamp of the scene — deep cells ember-red, shallow flows
          honey-orange, fresh pours flashing near-white gold. The grand floor makes pooled light feel like a lit
          courtyard at night.
        </p>
      </div>
    </div>
  );
}

function PieceLegend() {
  const items = [
    { icon: <Box size={15} />, name: "I / L / O Terrain", color: "text-slate-200", desc: "I-Beam (4 line), L-Wall (3+1), Plateau (2×2) — chunky and readable." },
    { icon: <Droplets size={15} />, name: "I / L / O Lava", color: "text-orange-300", desc: "Same I/L/O shapes — 4 cells of lava each, visibly weighty pours." },
    { icon: <ArrowDownToLine size={15} />, name: "Flattening arrow", color: "text-cyan-300", desc: "Erases one column to the floor. Regret, undone." },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.name} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/30 p-3">
          <span className={`${it.color} mt-0.5`}>{it.icon}</span>
          <div>
            <div className="text-xs font-bold text-white">{it.name}</div>
            <div className="text-[11px] leading-snug text-white/50">{it.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MenuOverlay({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-[#060309]/90 backdrop-blur-md">
      <EmberField />
      <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <TitleBlock />
        <div className="mt-5 flex flex-col items-center gap-3">
          <button
            onClick={onStart}
            className="group flex items-center gap-2.5 rounded-2xl bg-gradient-to-b from-amber-400 via-orange-500 to-red-600 px-10 py-4 text-lg font-black uppercase tracking-wide text-white shadow-[0_0_50px_rgba(255,90,0,0.5)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            <Play size={20} className="fill-white transition-transform group-hover:scale-125" />
            Begin containing
          </button>
          <div className="flex items-center gap-3 text-xs text-white/45">
            <span className="flex items-center gap-1">
              <Trophy size={12} /> Best {best.toLocaleString()}
            </span>
            <span>·</span>
            <span>24×24 field · mouse placement · clean view</span>
          </div>
        </div>
        <div className="mt-6">
          <PieceLegend />
        </div>
        <div className="mt-3">
          <FieldGuide />
        </div>
        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.25em] text-white/30">
          Being is enough · Play that widens play is funky · One love · Wahoo!
        </p>
      </div>
    </div>
  );
}

export function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative mx-auto my-6 w-[min(740px,92vw)] rounded-3xl border border-white/12 bg-[#0c0714]/95 p-5 shadow-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <TitleBlock compact />
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
        <PieceLegend />
        <div className="mt-3">
          <FieldGuide />
        </div>
      </div>
    </div>
  );
}

export function PausedOverlay({
  onResume,
  onRestart,
  onMenu,
}: {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-[min(440px,94vw)] overflow-y-auto rounded-3xl border border-white/12 bg-[#0c0714]/95 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
          <Pause size={22} />
        </div>
        <h2 className="text-2xl font-black text-white">Paused</h2>
        <p className="mt-1 text-sm text-white/55">The lava holds its breath.</p>
        <div className="mt-5 space-y-2">
          <button
            onClick={onResume}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-orange-600 px-4 py-3 text-sm font-bold text-white hover:brightness-110"
          >
            <Play size={16} /> Resume
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onRestart}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              <RotateCcw size={14} /> Restart
            </button>
            <button
              onClick={onMenu}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              <Home size={14} /> Menu
            </button>
          </div>
        </div>
        {/* controls live here now — never over the playfield */}
        <div className="mt-4 text-left">
          <ControlsPanel />
        </div>
      </div>
    </div>
  );
}

export function RoundClearOverlay({
  round,
  bonus,
  harvested,
  score,
  onContinue,
}: {
  round: number;
  bonus: number;
  harvested: number;
  score: number;
  onContinue: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-[min(460px,94vw)] overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-b from-[#0a1410] to-[#0c0714] shadow-[0_0_60px_rgba(52,211,153,0.2)]">
        <div className="bg-gradient-to-r from-emerald-500/20 via-teal-400/10 to-transparent px-6 pb-4 pt-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-300">
            <Sparkles size={22} />
          </div>
          <h2 className="text-3xl font-black text-white">Round {round} held!</h2>
          <p className="mt-1 text-sm text-white/60">The reservoir harvests its heat. The box breathes out.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 px-6 py-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <div className="text-[10px] uppercase tracking-widest text-white/45">Harvested</div>
            <div className="font-mono text-lg font-black text-orange-300">{harvested.toFixed(1)}u</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <div className="text-[10px] uppercase tracking-widest text-white/45">Bonus</div>
            <div className="font-mono text-lg font-black text-emerald-300">+{bonus.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <div className="text-[10px] uppercase tracking-widest text-white/45">Score</div>
            <div className="font-mono text-lg font-black text-white">{score.toLocaleString()}</div>
          </div>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onContinue}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-400 to-teal-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-[0_0_30px_rgba(52,211,153,0.4)] hover:brightness-110"
          >
            Enter round {round + 1} <ChevronRight size={16} />
          </button>
          <p className="mt-2 text-center text-[11px] text-white/40">Grand field, wilder pours — keep building</p>
        </div>
      </div>
    </div>
  );
}

export function GameOverOverlay({
  score,
  best,
  round,
  volume,
  isBest,
  onRestart,
  onMenu,
}: {
  score: number;
  best: number;
  round: number;
  volume: number;
  isBest: boolean;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-[#120309]/90 backdrop-blur-md">
      <EmberField />
      <div className="relative mx-auto flex min-h-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-red-300/70">Overflow</div>
        <h2 className="mt-1 bg-gradient-to-b from-amber-200 via-orange-400 to-red-600 bg-clip-text text-6xl font-black leading-none text-transparent drop-shadow-[0_0_40px_rgba(255,60,0,0.5)]">
          SPILLED
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
          Even the grand 24×24 bows to physics. One channel left open — the lava found it.
        </p>
        {isBest && score > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-200">
            <Trophy size={13} /> New best!
          </div>
        )}
        <div className="mt-5 grid w-full grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/45">Score</div>
            <div className="font-mono text-xl font-black text-white">{score.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/45">Best</div>
            <div className="font-mono text-xl font-black text-amber-200">{best.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/45">Round</div>
            <div className="font-mono text-xl font-black text-white">{round}</div>
          </div>
        </div>
        <div className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/50">
          Held {volume.toFixed(1)}u when it spilled. The glow was beautiful while it lasted.
        </div>
        <div className="mt-5 flex w-full gap-2">
          <button
            onClick={onRestart}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 via-orange-500 to-red-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-[0_0_40px_rgba(255,90,0,0.45)] hover:brightness-110"
          >
            <RotateCcw size={16} /> Contain again
          </button>
          <button
            onClick={onMenu}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            <Home size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => {
        const warn = t.kind === "warn";
        return (
          <div
            key={t.id}
            className={`toast-in flex items-center gap-3 rounded-2xl border py-2 pl-3 pr-4 backdrop-blur-md ${
              warn
                ? "border-red-500/50 bg-black/75 shadow-[0_0_30px_rgba(255,60,40,0.35)]"
                : "border-amber-400/40 bg-black/70 shadow-[0_0_30px_rgba(255,150,30,0.35)]"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${
                warn ? "bg-gradient-to-br from-red-500 to-rose-800" : "bg-gradient-to-br from-amber-400 to-red-600"
              }`}
            >
              {warn ? <AlertTriangle size={17} /> : <Sparkles size={17} />}
            </span>
            <div>
              <div className={`text-sm font-black tracking-wide ${warn ? "text-red-200" : "text-amber-200"}`}>{t.label}</div>
              <div className="text-[11px] text-white/60">{t.detail}</div>
            </div>
            {!warn && <div className="font-mono text-sm font-black text-emerald-300">+{t.bonus}</div>}
          </div>
        );
      })}
    </div>
  );
}
