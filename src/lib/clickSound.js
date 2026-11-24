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

// About 20 ms: a quick, crisp tick. A bright noise snap at the very start,
// short metallic partials high up, and a touch of mid "clack", with nothing
// low, so it reads as a sharp tick rather than a thump. Kept quiet: at the
// default half volume it is just loud enough to hear.
export function makeClickSamples(rate) {
  const length = Math.round(rate * 0.02);
  const data = new Float32Array(length);
  let seed = 12345, n1 = 0, n2 = 0;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const n = noise();
    // Second difference of white noise: only the bright top end is left.
    const bright = n - 2 * n1 + n2;
    n2 = n1; n1 = n;
    const snap = bright * Math.exp(-t / 0.0006) * 0.35;
    const metal = Math.sin(2 * Math.PI * 3150 * t) * Math.exp(-t / 0.0022) * 0.5
      + Math.sin(2 * Math.PI * 4870 * t + 0.7) * Math.exp(-t / 0.0016) * 0.35
      + Math.sin(2 * Math.PI * 6930 * t + 1.3) * Math.exp(-t / 0.0011) * 0.2;
    const clack = Math.sin(2 * Math.PI * 1650 * t) * Math.exp(-t / 0.0026) * 0.22;
    const attack = 1 - Math.exp(-t / 0.00008);
    data[i] = (snap + metal + clack) * attack;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = peak > 0 ? 0.55 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= scale;
  // Fade the last millisecond so it never ends on a pop.
  const fade = Math.round(rate * 0.001);
  for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;
  return data;
}

function makeClick(ctx) {
  const samples = makeClickSamples(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
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
// `waitForLift`: if sound is not allowed yet (phones only allow it after a
// finished tap), play it when the finger lifts instead of not at all.
export function playClick(volume = undefined, waitForLift = true) {
  const level = volume ?? theme.soundVolume;
  if (level <= 0) return;
  if (playNow(level)) return;
  if (waitForLift) pending = true;
}

// Multi-select turning on by holding a finger down. The finger is still down,
// so a click that cannot play right now is skipped rather than played late.
export function playMultiSelectClick() {
  if (theme.soundEnabled) playClick(undefined, false);
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
