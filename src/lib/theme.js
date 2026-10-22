import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'gestura_theme_v2';
const WIREFRAME_DEFAULT_MIGRATION = 'gestura_wireframe_default_v3';
const INCHES_DEFAULT_MIGRATION = 'gestura_inches_default_v1';
const DARK_BLUE_HIGHLIGHT_MIGRATION = 'gestura_dark_blue_highlight_v1';
const BIGGER_GRID_MIGRATION = 'gestura_bigger_grid_v1';
const GRID_100_DEFAULT_MIGRATION = 'gestura_grid_100_default_v1';
const STATIC_LIGHT_DEFAULT_MIGRATION = 'gestura_static_light_default_v1';
const SHADOW_BEHIND_MIGRATION = 'gestura_shadow_restore_v1';
const BLACK_BACKGROUND_MIGRATION = 'gestura_viewport_bg_v5';
const WIREFRAME_ON_MIGRATION = 'gestura_wireframe_on_v5';
const STARTUP_DEFAULTS_OFF_MIGRATION = 'axis_startup_defaults_off_v1';
const RENDER_BOOST_MANUAL_ONLY_MIGRATION = 'axis_render_boost_manual_only_v1';
const GRID_DEFAULT_ON_MIGRATION = 'axis_grid_default_on_v1';
const TOOL_LABELS_DEFAULT_ON_MIGRATION = 'axis_tool_labels_default_on_v1';
const DEFAULTS = { backgroundColor: '#1c1c1c', highlightColor: '#0066ff', gridColor: '#3a7bbf', shadowsEnabled: false, shadowIntensity: 0.6, defaultLightingEnabled: true, shineEnabled: true, shineIntensity: 0.7, wireframeEnabled: true, toolLabelsEnabled: true, unit: 'in', gridSquareSize: 1, gridSize: 100, snapToGrid: false, snapDistance: 0.0625, snapAngle: 15, lightFollowCamera: false, lightAzimuth: 45, lightElevation: 50, lightDistance: 8, lightColor: '#ffffff', lightIntensity: 1.5, savedColors: [], gestureMoveThreshold: 5, gestureHoldDelay: 500, gestureSelectReach: 0.025, gesturePinchThreshold: 6, gestureRotateSensitivity: 1, gestureScaleSensitivity: 1, hideDetailWhileEditing: true, renderBoostEnabled: false, focusRenderBoostEnabled: false, gridVisible: true, objectArrowsEnabled: false, measurementsOn: false, measurementOption: 'edge' };

// Display settings that belong to one model. They are saved with it and restored
// when it opens; everything else here (highlight color, gestures, tool labels,
// saved colors) stays an app-wide preference.
export const SCENE_SETTING_KEYS = [
  'backgroundColor', 'gridColor', 'gridVisible', 'gridSize', 'gridSquareSize', 'unit',
  'snapToGrid', 'snapDistance', 'snapAngle',
  'shadowsEnabled', 'shadowIntensity', 'shineEnabled', 'shineIntensity', 'wireframeEnabled',
  'defaultLightingEnabled',
  'lightFollowCamera', 'lightAzimuth', 'lightElevation', 'lightDistance', 'lightColor', 'lightIntensity',
  'renderBoostEnabled', 'focusRenderBoostEnabled', 'objectArrowsEnabled',
  'measurementsOn', 'measurementOption',
];
const pickScene = (source, fallback) => Object.fromEntries(SCENE_SETTING_KEYS.map((key) => [key, source?.[key] !== undefined ? source[key] : fallback[key]]));

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    if (!localStorage.getItem(WIREFRAME_DEFAULT_MIGRATION)) {
      saved.wireframeEnabled = true;
      localStorage.setItem(WIREFRAME_DEFAULT_MIGRATION, '1');
    }
    if (!localStorage.getItem(INCHES_DEFAULT_MIGRATION)) {
      saved.unit = 'in';
      localStorage.setItem(INCHES_DEFAULT_MIGRATION, '1');
    }
    if (!localStorage.getItem(DARK_BLUE_HIGHLIGHT_MIGRATION)) {
      saved.highlightColor = '#0066ff';
      localStorage.setItem(DARK_BLUE_HIGHLIGHT_MIGRATION, '1');
    }
    if (!localStorage.getItem(BIGGER_GRID_MIGRATION)) {
      saved.gridSquareSize = 1;
      saved.gridSize = 20;
      localStorage.setItem(BIGGER_GRID_MIGRATION, '1');
    }
    if (!localStorage.getItem(GRID_100_DEFAULT_MIGRATION)) {
      saved.gridSquareSize = 1;
      saved.gridSize = 100;
      localStorage.setItem(GRID_100_DEFAULT_MIGRATION, '1');
    }
    if (!localStorage.getItem(STATIC_LIGHT_DEFAULT_MIGRATION)) {
      saved.lightFollowCamera = false;
      localStorage.setItem(STATIC_LIGHT_DEFAULT_MIGRATION, '1');
    }
    if (!localStorage.getItem(SHADOW_BEHIND_MIGRATION)) {
      saved.shadowsEnabled = true;
      saved.lightFollowCamera = false;
      saved.lightAzimuth = 45;
      saved.lightElevation = 50;
      localStorage.setItem(SHADOW_BEHIND_MIGRATION, '1');
    }
    // Dark-grey viewport so black shadows read darker than the background.
    if (!localStorage.getItem(BLACK_BACKGROUND_MIGRATION)) {
      saved.backgroundColor = '#1c1c1c';
      localStorage.setItem(BLACK_BACKGROUND_MIGRATION, '1');
    }
    if (!localStorage.getItem(WIREFRAME_ON_MIGRATION)) {
      saved.wireframeEnabled = true;
      localStorage.setItem(WIREFRAME_ON_MIGRATION, '1');
    }
    if (!localStorage.getItem(STARTUP_DEFAULTS_OFF_MIGRATION)) {
      saved.renderBoostEnabled = false;
      saved.shadowsEnabled = false;
      localStorage.setItem(STARTUP_DEFAULTS_OFF_MIGRATION, '1');
    }
    // Clear any Render Boost state previously enabled by automatic FPS checks.
    // After this one-time reset it remains fully manual.
    if (!localStorage.getItem(RENDER_BOOST_MANUAL_ONLY_MIGRATION)) {
      saved.renderBoostEnabled = false;
      localStorage.setItem(RENDER_BOOST_MANUAL_ONLY_MIGRATION, '1');
    }
    // Grid is on by default; one-time switch for anyone who had it turned off.
    if (!localStorage.getItem(GRID_DEFAULT_ON_MIGRATION)) {
      saved.gridVisible = true;
      localStorage.setItem(GRID_DEFAULT_ON_MIGRATION, '1');
    }
    // Tool labels are on by default; one-time switch for anyone who had them
    // turned off.
    if (!localStorage.getItem(TOOL_LABELS_DEFAULT_ON_MIGRATION)) {
      saved.toolLabelsEnabled = true;
      localStorage.setItem(TOOL_LABELS_DEFAULT_ON_MIGRATION, '1');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return { ...DEFAULTS, ...saved };
  } catch {}
  return { ...DEFAULTS };
}

function hexToInt(hex) {
  return parseInt((hex || '#000000').replace('#', ''), 16);
}

let state = load();
const listeners = new Set();
function emit() { for (const fn of listeners) fn(); }

export const theme = {
  get backgroundColor() { return state.backgroundColor; },
  get highlightColor() { return state.highlightColor; },
  get gridColor() { return state.gridColor || '#3a7bbf'; },
  get highlightInt() { return hexToInt(state.highlightColor); },
  // Menus and overlays always sit on dark glass, so their text stays white no
  // matter what viewport background color is chosen (text shadows keep the
  // on-canvas readouts readable on light backgrounds).
  get uiColor() { return '#ffffff'; },
  get uiColorMuted() { return 'rgba(255,255,255,0.5)'; },
  get shadowsEnabled() { return !!state.shadowsEnabled; },
  get shadowIntensity() { return state.shadowIntensity ?? 0.5; },
  get shineEnabled() { return !!state.shineEnabled; },
  get shineIntensity() { return state.shineIntensity ?? 0.5; },
  get wireframeEnabled() { return state.wireframeEnabled !== false; },
  get toolLabelsEnabled() { return state.toolLabelsEnabled === true; },
  get unit() { return state.unit || 'mm'; },
  get gridSquareSize() { return state.gridSquareSize ?? 1; },
  get gridSize() { return state.gridSize ?? 100; },
  get snapToGrid() { return !!state.snapToGrid; },
  get snapDistance() { return state.snapDistance ?? 0.0625; },
  get snapAngle() { return state.snapAngle ?? 15; },
  get lightFollowCamera() { return state.lightFollowCamera !== false; },
  get lightAzimuth() { return state.lightAzimuth ?? 45; },
  get lightElevation() { return state.lightElevation ?? 50; },
  get lightDistance() { return state.lightDistance ?? 8; },
  get lightColor() { return state.lightColor || '#ffffff'; },
  get lightIntensity() { return state.lightIntensity ?? 1.5; },
  get savedColors() { return state.savedColors || []; },
  get gestureMoveThreshold() { return state.gestureMoveThreshold ?? 5; },
  get gestureHoldDelay() { return state.gestureHoldDelay ?? 500; },
  get gestureSelectReach() { return state.gestureSelectReach ?? 0.025; },
  get gesturePinchThreshold() { return state.gesturePinchThreshold ?? 6; },
  get gestureRotateSensitivity() { return state.gestureRotateSensitivity ?? 1; },
  get gestureScaleSensitivity() { return state.gestureScaleSensitivity ?? 1; },
  get hideDetailWhileEditing() { return state.hideDetailWhileEditing !== false; },
  // The fixed studio wash every scene starts with. Off, the only light in
  // the scene is what the user placed.
  get defaultLightingEnabled() { return state.defaultLightingEnabled !== false; },
  get renderBoostEnabled() { return state.renderBoostEnabled === true; },
  get focusRenderBoostEnabled() { return state.focusRenderBoostEnabled === true; },
  // Viewport display state; saved per model (see SCENE_SETTING_KEYS).
  get gridVisible() { return state.gridVisible === true; },
  get objectArrowsEnabled() { return state.objectArrowsEnabled === true; },
  get measurementsOn() { return !!state.measurementsOn; },
  get measurementOption() { return state.measurementOption || 'edge'; },
  getSceneSettings() { return pickScene(state, DEFAULTS); },
  applySceneSettings(settings) { theme.set(pickScene(settings, DEFAULTS)); },
  resetSceneSettings() { theme.set(pickScene(null, DEFAULTS)); },
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    emit();
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getSnapshot() { return state; },
};

export function useTheme() {
  const state = useSyncExternalStore(theme.subscribe, theme.getSnapshot);
  return {
    backgroundColor: state.backgroundColor,
    highlightColor: state.highlightColor,
    gridColor: theme.gridColor,
    highlightInt: theme.highlightInt,
    uiColor: theme.uiColor,
    uiColorMuted: theme.uiColorMuted,
    shadowsEnabled: theme.shadowsEnabled,
    defaultLightingEnabled: theme.defaultLightingEnabled,
    shadowIntensity: theme.shadowIntensity,
    shineEnabled: theme.shineEnabled,
    shineIntensity: theme.shineIntensity,
    wireframeEnabled: theme.wireframeEnabled,
    toolLabelsEnabled: theme.toolLabelsEnabled,
    unit: theme.unit,
    gridSquareSize: theme.gridSquareSize,
    gridSize: theme.gridSize,
    snapToGrid: theme.snapToGrid,
    snapDistance: theme.snapDistance,
    snapAngle: theme.snapAngle,
    lightFollowCamera: theme.lightFollowCamera,
    lightAzimuth: theme.lightAzimuth,
    lightElevation: theme.lightElevation,
    lightDistance: theme.lightDistance,
    lightColor: theme.lightColor,
    lightIntensity: theme.lightIntensity,
    savedColors: theme.savedColors,
    gestureMoveThreshold: theme.gestureMoveThreshold,
    gestureHoldDelay: theme.gestureHoldDelay,
    gestureSelectReach: theme.gestureSelectReach,
    gesturePinchThreshold: theme.gesturePinchThreshold,
    gestureRotateSensitivity: theme.gestureRotateSensitivity,
    gestureScaleSensitivity: theme.gestureScaleSensitivity,
    hideDetailWhileEditing: theme.hideDetailWhileEditing,
    renderBoostEnabled: theme.renderBoostEnabled,
    focusRenderBoostEnabled: theme.focusRenderBoostEnabled,
    gridVisible: theme.gridVisible,
    objectArrowsEnabled: theme.objectArrowsEnabled,
    measurementsOn: theme.measurementsOn,
    measurementOption: theme.measurementOption,
  };
}