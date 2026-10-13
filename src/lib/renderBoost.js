import { theme } from './theme';

const TRIANGLE_THRESHOLD = 10000;
// Render Boost switches itself on when the scene reaches the threshold and off
// again when it drops below, but only if Render Boost wasn't already on and the
// user hasn't toggled it by hand since.
let autoEnabled = false;
let wasHeavy = false;

export function isClosedSurface(mesh) {
  if (!mesh?.faces?.length) return false;
  const counts = new Map();
  for (const face of mesh.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts.size > 0 && [...counts.values()].every((count) => count === 2);
}

// Called when a model is opened or created: its saved Render Boost state is
// respected, and auto-enable only applies to crossing 10k during editing.
export function resetRenderBoostAuto() {
  autoEnabled = false;
  wasHeavy = true;
}

export function setRenderBoostManual(enabled) {
  autoEnabled = false;
  theme.set({ renderBoostEnabled: enabled });
}

export function updateRenderBoostTriangleLoad(manager, triangles) {
  const heavy = triangles >= TRIANGLE_THRESHOLD;
  manager._renderBoostTriangleHeavy = heavy;
  if (heavy === wasHeavy) return;
  wasHeavy = heavy;
  if (heavy && !theme.renderBoostEnabled) {
    autoEnabled = true;
    theme.set({ renderBoostEnabled: true });
    window.dispatchEvent(new CustomEvent('axis-render-boost-active'));
  } else if (!heavy && autoEnabled) {
    autoEnabled = false;
    theme.set({ renderBoostEnabled: false });
  }
}

export function pulseNavigationResolution(manager) {
  if (!theme.renderBoostEnabled || manager._basePixelRatio <= 1) return;
  clearTimeout(manager._renderBoostTimer);
  if (!manager._navigationResolutionReduced) {
    manager._navigationResolutionReduced = true;
    manager.renderer.setPixelRatio(1);
  }
  manager._renderBoostTimer = setTimeout(() => restoreNavigationResolution(manager), 140);
}

export function restoreNavigationResolution(manager) {
  clearTimeout(manager._renderBoostTimer);
  manager._renderBoostTimer = null;
  if (!manager._navigationResolutionReduced) return;
  manager._navigationResolutionReduced = false;
  manager.renderer.setPixelRatio(manager._basePixelRatio);
}