// Taps on the modeler's buttons.
//
// A touch that begins and ends on the same button is a tap, however much the
// finger shifted in between (the browser drops its own click once a finger
// moves a little or stays down a moment). A touch that ends anywhere else does
// nothing. The browser's own touch clicks on these buttons are dropped and the
// tap is sent from here instead, so a button never fires twice.
//
// Controls that turn a touch into something else (a strip's swipe, a tool's
// hold-to-arrange) claim it, and no tap is sent for that touch.

const BUTTON = 'button, [role="button"]';
const SCOPE = '.axis-modeler';
const touches = new Map(); // pointerId -> { button, rect, claimed }
let lastTouchAt = 0;
let lastTouchButton = null;

const buttonFor = (target) => {
  const button = target instanceof Element ? target.closest(BUTTON) : null;
  return button && button.closest(SCOPE) ? button : null;
};

const inside = (rect, x, y) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

// True when the point is on `el`: whatever is drawn there belongs to it, or
// the point lies inside the box it had when the touch began (a button that
// shrinks while pressed still counts).
export function releasedOver(el, x, y, rect = null) {
  if (!el?.isConnected) return false;
  const hit = document.elementFromPoint(x, y);
  if (hit && (hit === el || el.contains(hit))) return true;
  return inside(rect || el.getBoundingClientRect(), x, y);
}

// The touch became a swipe, drag or hold: its release is not a tap.
export function claimTouch(pointerId) {
  const touch = touches.get(pointerId);
  if (touch) touch.claimed = true;
}

export function installButtonTaps() {
  const down = (e) => {
    if (e.pointerType !== 'touch') return;
    const button = buttonFor(e.target);
    if (!button) return;
    touches.set(e.pointerId, { button, rect: button.getBoundingClientRect(), claimed: false });
  };
  const up = (e) => {
    const touch = touches.get(e.pointerId);
    if (!touch) return;
    touches.delete(e.pointerId);
    lastTouchAt = performance.now();
    lastTouchButton = touch.button;
    const { clientX: x, clientY: y } = e;
    // After the controls' own release handlers, so their claims are in.
    setTimeout(() => {
      const { button, rect, claimed } = touch;
      if (claimed || button.disabled || !releasedOver(button, x, y, rect)) return;
      button.click();
    }, 0);
  };
  const cancel = (e) => { touches.delete(e.pointerId); };
  const click = (e) => {
    if (!e.isTrusted) return;
    const button = buttonFor(e.target);
    if (!button) return;
    // Clicks report the pointer type; a WebView too old to say falls back to
    // "a touch just ended on this button".
    const type = /** @type {PointerEvent} */ (e).pointerType;
    const fromTouch = type === 'touch' || (type === undefined && button === lastTouchButton && performance.now() - lastTouchAt < 1000);
    if (!fromTouch) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('click', click, true);
  return () => {
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('click', click, true);
    touches.clear();
  };
}
