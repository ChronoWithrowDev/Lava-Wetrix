// Tiny WebAudio synth — no assets, all procedural. Warm & toy-like.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function tone(
  freq: number,
  dur = 0.12,
  type: OscillatorType = "sine",
  vol = 0.12,
  slide = 0,
  delay = 0
) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur = 0.3, vol = 0.1, lowpass = 1200, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  move() {
    tone(320, 0.06, "triangle", 0.05, 40);
  },
  rotate() {
    tone(460, 0.08, "triangle", 0.07, 120);
  },
  placeStone() {
    tone(120, 0.16, "sine", 0.16, -40);
    noise(0.12, 0.08, 900);
  },
  lavaPour() {
    noise(0.5, 0.14, 2400);
    tone(180, 0.3, "sawtooth", 0.04, -80);
    tone(90, 0.4, "sine", 0.1, -20, 0.05);
  },
  arrow() {
    tone(880, 0.25, "sine", 0.1, -600);
    noise(0.35, 0.1, 3000);
    tone(220, 0.3, "triangle", 0.08, -100, 0.08);
  },
  score() {
    tone(660, 0.1, "sine", 0.06);
    tone(990, 0.12, "sine", 0.05, 0, 0.07);
  },
  clever() {
    tone(523, 0.12, "triangle", 0.09);
    tone(659, 0.12, "triangle", 0.09, 0, 0.09);
    tone(784, 0.2, "triangle", 0.1, 0, 0.18);
  },
  warning() {
    tone(220, 0.18, "square", 0.05, 0);
    tone(220, 0.18, "square", 0.05, 0, 0.22);
  },
  roundClear() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.1, 0, i * 0.11));
    noise(0.6, 0.06, 4000, 0.1);
  },
  gameOver() {
    tone(300, 0.8, "sawtooth", 0.07, -220);
    noise(1.0, 0.14, 800);
    tone(75, 1.0, "sine", 0.14, -25, 0.1);
  },
  ui() {
    tone(520, 0.07, "sine", 0.06, 60);
  },
  // bridge physics
  creak() {
    tone(160, 0.32, "sawtooth", 0.035, -70);
    noise(0.28, 0.04, 500);
  },
  collapse() {
    noise(0.5, 0.16, 650);
    tone(64, 0.55, "sine", 0.15, -24);
    tone(190, 0.14, "square", 0.035, -110, 0.04);
  },
  thud() {
    noise(0.18, 0.12, 900);
    tone(90, 0.22, "sine", 0.14, -40);
    noise(0.25, 0.06, 2600, 0.03);
  },
};
