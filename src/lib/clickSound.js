import { theme } from './theme';

// Button click sound: a short, low, crisp click with a faint metallic ring,
// made once in code and played through Web Audio, which follows the phone's
// media volume. Settings > Sound turns it on or off and sets its level.

const BUTTONS = 'button, [role="button"], [role="switch"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], a[href], select';

let context = null;
let clickBuffer = null;
let pending = false;
let started = false;

function audioContext() {
  if (context) return context;
  const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!Ctx) return null;
  try { context = new Ctx({ latencyHint: 'interactive' }); } catch { context = null; }
  return context;
}

// About 60 ms: a low knock that drops in pitch, a brief bright tick at the
// start, and short inharmonic partials for the metal.
function makeClick(ctx) {
  const rate = ctx.sampleRate;
  const length = Math.round(rate * 0.06);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let phase = 0, previousNoise = 0, seed = 12345;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const pitch = 150 + 330 * Math.exp(-t / 0.004);
    phase += 2 * Math.PI * pitch / rate;
    const body = Math.sin(phase) * (1 - Math.exp(-t / 0.0003)) * Math.exp(-t / 0.016) * 0.8;
    const metal = Math.sin(2 * Math.PI * 2480 * t) * Math.exp(-t / 0.005) * 0.2
      + Math.sin(2 * Math.PI * 3890 * t) * Math.exp(-t / 0.0035) * 0.13
      + Math.sin(2 * Math.PI * 5370 * t) * Math.exp(-t / 0.0025) * 0.07;
    const n = noise();
    const tick = (n - previousNoise) * Math.exp(-t / 0.0012) * 0.3;
    previousNoise = n;
    data[i] = body + metal + tick;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= scale;
  // Fade the last couple of milliseconds so it never ends on a pop.
  const fade = Math.round(rate * 0.002);
  for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;
  return buffer;
}

function playNow(volume) {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return false;
  if (!clickBuffer) clickBuffer = makeClick(ctx);
  const source = ctx.createBufferSource();
  source.buffer = clickBuffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
  return true;
}

// Plays the click at the set volume, or at `volume` (0–1) when given.
export function playClick(volume = undefined) {
  const level = volume ?? theme.soundVolume;
  if (level <= 0) return;
  if (playNow(level)) return;
  // Phones only let sound start after a finished tap, so the first click
  // waits for the finger to lift.
  pending = true;
}

function unlock() {
  const ctx = audioContext();
  if (!ctx) return;
  const play = () => {
    if (pending && theme.soundEnabled) playNow(theme.soundVolume);
    pending = false;
  };
  if (ctx.state === 'running') { play(); return; }
  ctx.resume().then(play).catch(() => { pending = false; });
}

function isButton(target) {
  const el = target?.closest?.(BUTTONS);
  if (!el) return false;
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

// Listens for taps on buttons anywhere in the app.
export function startClickSound() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (!theme.soundEnabled || !isButton(event.target)) return;
    playClick();
  }, { capture: true, passive: true });
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }
}
