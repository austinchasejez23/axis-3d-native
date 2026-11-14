import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Hand } from 'lucide-react';
import ThreeViewport from '@/components/modeler/ThreeViewport';
import TopBar from '@/components/modeler/TopBar';
import PositionHud from '@/components/modeler/PositionHud';
import BottomToolbar from '@/components/modeler/BottomToolbar';
import LibraryPanel from '@/components/modeler/LibraryPanel';
import ModeToolGrid from '@/components/modeler/ModeToolGrid';
import GeneralToolGrid from '@/components/modeler/GeneralToolGrid';
import MenuDrawer from '@/components/modeler/MenuDrawer';
import MarqueeOverlay from '@/components/modeler/MarqueeOverlay';
import DrawOverlay from '@/components/modeler/DrawOverlay';
import DrawFacePanel from '@/components/modeler/DrawFacePanel';
import SegmentsModal from '@/components/modeler/SegmentsModal';
import MaterialsPanel from '@/components/modeler/MaterialsPanel';
import LightingPanel from '@/components/modeler/LightingPanel';
import OrientationPanel from '@/components/modeler/OrientationPanel';
import SculptPanel from '@/components/modeler/SculptPanel';
import SculptRingOverlay from '@/components/modeler/SculptRingOverlay';
import BevelPanel from '@/components/modeler/BevelPanel';
import BooleanPanel from '@/components/modeler/BooleanPanel';
import { applyBooleanPair } from '@/lib/booleanTools';
import ModelLoading from '@/components/modeler/ModelLoading';
import LogoLoader from '@/components/LogoLoader';
import RadialArrayPanel from '@/components/modeler/RadialArrayPanel';
import FreeTransformPanel from '@/components/modeler/FreeTransformPanel';
import SnapPanel from '@/components/modeler/SnapPanel';
import PrecisionPanel from '@/components/modeler/PrecisionPanel';
import MeasurementOverlay from '@/components/modeler/MeasurementOverlay';
import CutPanel from '@/components/modeler/CutPanel';
import AddVertexPanel from '@/components/modeler/AddVertexPanel';
import AngleOverlay from '@/components/modeler/AngleOverlay';
import MeasureOverlay from '@/components/modeler/MeasureOverlay';
import TransformDrawer from '@/components/modeler/TransformDrawer';
import ContextTip from '@/components/modeler/ContextTip';
import GuideSheet from '@/components/modeler/GuideSheet';
import HelpPanel from '@/components/modeler/HelpPanel';
import ToolAnnouncement from '@/components/modeler/ToolAnnouncement';
import PaintToolFlash from '@/components/modeler/PaintToolFlash';
import MultiSelectLabel from '@/components/modeler/MultiSelectLabel';
import GraphicsErrorBanner from '@/components/modeler/GraphicsErrorBanner';
import HintsController from '@/components/modeler/HintsController';
import TriangleCounter from '@/components/modeler/TriangleCounter';
import ViewGizmo from '@/components/modeler/ViewGizmo';
import SelectionPatternPanel from '@/components/modeler/SelectionPatternPanel';

import { EditableMesh } from '@/lib/EditableMesh';
import { getFaceBridgeGroups } from '@/lib/bridgeTools';
import { exportOBJ, exportFBX, downloadFile } from '@/lib/exporters';
import { listProjects, saveProject, loadProject, generateProjectId, projectNameTaken, uniqueProjectName } from '@/lib/storage';
import { beginBevelPreview, updateBevelPreview, commitBevelPreview, cancelBevelPreview } from '@/lib/meshTools';
import { TOOLS } from '@/lib/tools';
import { getToolRequirementNotice } from '@/lib/toolRequirements';
import { UNAVAILABLE_EVENT, notifyUnavailable } from '@/lib/unavailable';
import { useProAccess } from '@/lib/ProAccessContext';
import { FREE_PROJECT_LIMIT, FREE_TRIANGLE_LIMIT, PRO_TOOL_IDS, TRIANGLE_GROWTH_TOOLS, totalTriangles } from '@/lib/proAccess';
import { toolMemory } from '@/lib/toolMemory';
import { useTheme, theme } from '@/lib/theme';
import { resetRenderBoostAuto } from '@/lib/renderBoost';
import useBackDismiss from '@/hooks/use-back-dismiss';
import useCoveredBy from '@/hooks/use-covered-by';
import useAutoSave from '@/hooks/use-autosave';
import { isRadialPrimitive } from '@/lib/primitives';
import useKeyboardViewport from '@/hooks/use-keyboard-viewport';

// Boolean tools that open their own panel.
const BOOLEAN_OPERATION_IDS = new Set(['subtract', 'union', 'intersect']);
// Tools that start working on the canvas instead of changing geometry at once.
const INTERACTIVE_TOOL_IDS = new Set(['extrude', 'cut_loop', 'draw_cut', 'draw_face', 'add_vertex']);

export default function Modeler() {
  const navigate = useNavigate();
  const managerRef = useRef(/** @type {import('@/lib/SceneManager').SceneManager | null} */ (null));
  const toolPromptTimer = useRef(null);
  const renderBoostNoticeTimer = useRef(null);
  const segmentSnapshotRef = useRef(null);
  // Segment edits are applied to the scene once per frame (latest wins), so
  // rapid taps don't each rebuild the shape and the number updates instantly.
  const segmentFrameRef = useRef(0);
  const segmentPendingRef = useRef(null);
  const segmentsOpenRef = useRef(false);
  const segmentMeshIdRef = useRef(null);
  const menuBackRef = useRef(null);
  const transformApplyRef = useRef(null);
  const sculptSessionSnapshotRef = useRef(null);
  const { uiColor, highlightColor, unit, snapToGrid, gridVisible } = useTheme();
  const { isPro, openUpgrade } = useProAccess();
  const { height: workspaceHeight } = useKeyboardViewport();
  const [selectionMode, setSelectionMode] = useState('object');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [modeToolsOpen, setModeToolsOpen] = useState(false);
  const [toolSelectionClearTick] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Where the open menu sits: only what it actually covers is hidden.
  const [menuRect, setMenuRect] = useState(null);
  const [tipRef, tipCovered] = useCoveredBy(menuOpen ? menuRect : null);
  const [hudPillRef, hudCovered] = useCoveredBy(menuOpen ? menuRect : null);
  const [promptsRef, promptsCovered] = useCoveredBy(menuOpen ? menuRect : null);
  const [gizmoRef, gizmoCovered] = useCoveredBy(menuOpen ? menuRect : null);
  const [lightingOpen, setLightingOpen] = useState(false);
  // Orientation reset panel (double-tap the button under Help). What its Undo
  // changed is kept so Cancel can put it back.
  const [orientationOpen, setOrientationOpen] = useState(false);
  const [, setOrientationVersion] = useState(0);
  const orientationSaved = useRef(null);
  const [lightingState, setLightingState] = useState(null);
  // New shapes are created with the segment count last used on a shape.
  const [segments, setSegments] = useState(toolMemory.primitiveSegments);
  const [hud, setHud] = useState({ action: 'idle', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, label: 'Pos. (in)', activeAxis: null });
  const [marquee, setMarquee] = useState(null);
  const [draw, setDraw] = useState(null);
  const [drawAxis, setDrawAxis] = useState('y');
  const [projectName, setProjectName] = useState('Untitled');
  const [freeTransform, setFreeTransform] = useState(false);
  const [freeTransformSettings, setFreeTransformSettings] = useState({ move: true, rotate: true, scale: true });
  const [freeTransformPanelOpen, setFreeTransformPanelOpen] = useState(false);
  // Display settings are saved with each model (see theme SCENE_SETTING_KEYS).
  const setGridVisible = (v) => theme.set({ gridVisible: v });
  const [clayViewport, setClayViewport] = useState(false);
  const [transparentViewport, setTransparentViewport] = useState(false);
  const [orthographic, setOrthographic] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [segValues, setSegValues] = useState({ x: 1, y: 1, z: 1 });
  segmentsOpenRef.current = segmentsOpen;
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [surfaceSub, setSurfaceSub] = useState(null);
  const [surfaceSection, setSurfaceSection] = useState(() => {
    const saved = localStorage.getItem('axis.materials.lastSection');
    return saved === 'paint' || saved === 'texture' ? saved : null;
  });
  const [pickerOpen, setPickerOpen] = useState(true);
  const [paintTool, setPaintTool] = useState('fill');
  const [lastVertexPaintTool, setLastVertexPaintTool] = useState('fill');
  const [paintColor, setPaintColor] = useState(() => localStorage.getItem('axis.paint.color') || '#d41435');
  const [paintSize, setPaintSize] = useState(() => Number(localStorage.getItem('axis.paint.size')) || 32);
  const [paintOpacity, setPaintOpacity] = useState(() => Number(localStorage.getItem('axis.paint.opacity')) || 100);
  const [paintSmoothness, setPaintSmoothness] = useState(() => Number(localStorage.getItem('axis.paint.smoothness')) || 0);
  const [sculptOpen, setSculptOpen] = useState(false);
  const [sculptPanelOpen, setSculptPanelOpen] = useState(false);
  const [sculptTool, setSculptTool] = useState('smooth');
  const [sculptSize, setSculptSize] = useState(0.4);
  const [sculptIntensity, setSculptIntensity] = useState(0.5);
  const [sculptAxes, setSculptAxes] = useState([]);
  const [sculptTuning, setSculptTuning] = useState(false);
  const [bevelOpen, setBevelOpen] = useState(false);
  // Open Boolean panel ({ operation, session }), the scene before its Apply,
  // and whether the result is applied.
  const [booleanPanel, setBooleanPanel] = useState(null);
  const booleanStartRef = useRef(null);
  const booleanAppliedRef = useRef(false);
  // A saved model is being opened (shows the loading arrows).
  const [modelLoading, setModelLoading] = useState(() => !!new URLSearchParams(window.location.search).get('id'));
  const [radialArrayOpen, setRadialArrayOpen] = useState(false);
  const [snapPanelOpen, setSnapPanelOpen] = useState(false);
  const [precision, setPrecision] = useState(false);
  const [precisionPanelOpen, setPrecisionPanelOpen] = useState(false);
  const [precisionIntensity, setPrecisionIntensity] = useState(80);
  // Every right-column settings panel belongs to its toggle. Switching a
  // tool off must dismiss its panel, regardless of how it was disabled.
  useEffect(() => { if (!freeTransform) setFreeTransformPanelOpen(false); }, [freeTransform]);
  useEffect(() => { if (!snapToGrid) setSnapPanelOpen(false); }, [snapToGrid]);
  useEffect(() => { if (!precision) setPrecisionPanelOpen(false); }, [precision]);
  useEffect(() => { if (managerRef.current) managerRef.current.precisionFactor = precision ? 1 - precisionIntensity / 100 : 1; }, [precision, precisionIntensity]);
  const [selectionPattern, setSelectionPattern] = useState(null);
  // Select Loop / Select Ring close on any touch outside their panel (or its
  // keypad), tap or gesture. A tap that closed one does nothing else.
  const selectionPatternRef = useRef(null);
  selectionPatternRef.current = selectionPattern;
  const patternClosedByTouchRef = useRef(false);
  useEffect(() => {
    const onDown = (event) => {
      patternClosedByTouchRef.current = false;
      if (!selectionPatternRef.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[data-selection-pattern-panel], [data-modeling-keypad]')) return;
      patternClosedByTouchRef.current = true;
      setSelectionPattern(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);
  const [selectedMeshId, setSelectedMeshId] = useState(null);
  const [measurementsOn, setMeasurementsOn] = useState(() => theme.measurementsOn);
  const [angleMode, setAngleMode] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurementOption, setMeasurementOption] = useState(() => theme.measurementOption);
  const [, setLockTick] = useState(0);
  const [toolPrompt, setToolPrompt] = useState(null);
  const [renderBoostNotice, setRenderBoostNotice] = useState(false);
  const [transformDrawerOpen, setTransformDrawerOpen] = useState(false);
  const [transformDrawerMeshId, setTransformDrawerMeshId] = useState(null);
  const [transformFocus, setTransformFocus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [addingReference, setAddingReference] = useState(false);
  const [cut, setCut] = useState(null);
  const [addVertex, setAddVertex] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [graphicsError, setGraphicsError] = useState(null);
  const [selectionMetric, setSelectionMetric] = useState({ type: 'object', count: 0, label: '0 selected triangles' });

  // Sync selection mode to SceneManager
  useEffect(() => {
    const mgr = managerRef.current;
    if (mgr && mgr.selectionMode !== selectionMode) mgr.setSelectionMode(selectionMode);
  }, [selectionMode]);

  const handleToggleFreeTransform = useCallback(() => {
    const next = !freeTransform;
    const manager = managerRef.current;
    if (manager) {
      manager.freeMove = next && freeTransformSettings.move;
      manager.freeScale = next && freeTransformSettings.scale;
      manager.freeRotate = next && freeTransformSettings.rotate;
    }
    setFreeTransform(next);
    if (!next) setFreeTransformPanelOpen(false);
  }, [freeTransform, freeTransformSettings]);

  const handleFreeTransformSetting = useCallback((key, enabled) => {
    setFreeTransformSettings((current) => {
      const next = { ...current, [key]: enabled };
      const manager = managerRef.current;
      if (manager && freeTransform) {
        manager.freeMove = next.move;
        manager.freeScale = next.scale;
        manager.freeRotate = next.rotate;
      }
      return next;
    });
  }, [freeTransform]);

  useEffect(() => {
    if (managerRef.current?.grid) managerRef.current.grid.visible = gridVisible;
  }, [gridVisible]);

  useEffect(() => {
    managerRef.current?.setViewportDisplayMode({ clay: clayViewport, transparent: transparentViewport });
  }, [clayViewport, transparentViewport]);

  useEffect(() => {
    managerRef.current?.setOrthographic(orthographic);
  }, [orthographic]);

  useEffect(() => {
    if (managerRef.current) managerRef.current.triangleLimit = isPro ? Infinity : FREE_TRIANGLE_LIMIT;
  }, [isPro]);

  useEffect(() => {
    if (theme.measurementsOn !== measurementsOn || theme.measurementOption !== measurementOption) theme.set({ measurementsOn, measurementOption });
  }, [measurementsOn, measurementOption]);

  // Brush and spray paint directly on the touched surface. Fill (only while the
  // Paint section is open) colors whatever object/face/edge/vertex is tapped;
  // Apply still fills the current selection explicitly.
  useEffect(() => {
    // Paint is only live while the Surface sheet itself is the active tool —
    // opening any other tool set, menu, library or panel deactivates it.
    const paintBlocked = toolsOpen || modeToolsOpen || menuOpen || libraryOpen || segmentsOpen || sculptOpen || transformDrawerOpen || guideOpen || lightingOpen;
    if (paintBlocked) {
      managerRef.current?.exitPaintMode();
    } else if (materialsOpen && (paintTool === 'brush' || paintTool === 'spray')) {
      managerRef.current?.setPaintTool({ tool: paintTool, color: paintColor, size: paintSize, opacity: paintOpacity, smoothness: paintSmoothness });
    } else if (materialsOpen && surfaceSection === 'paint' && paintTool === 'fill') {
      managerRef.current?.setPaintTool({ tool: 'fill', color: paintColor, opacity: paintOpacity / 100 });
    } else {
      managerRef.current?.exitPaintMode();
    }
  }, [materialsOpen, surfaceSection, paintTool, paintColor, paintSize, paintOpacity, paintSmoothness,
      toolsOpen, modeToolsOpen, menuOpen, libraryOpen, segmentsOpen, sculptOpen, transformDrawerOpen, guideOpen, lightingOpen]);

  useEffect(() => {
    const manager = managerRef.current;
    manager?.setLightingEdit(lightingOpen);
    if (lightingOpen) setLightingState(manager?.getLightingState() || null);
  }, [lightingOpen]);

  useEffect(() => {
    localStorage.setItem('axis.paint.color', paintColor);
    localStorage.setItem('axis.paint.size', String(paintSize));
    localStorage.setItem('axis.paint.opacity', String(paintOpacity));
    localStorage.setItem('axis.paint.smoothness', String(paintSmoothness));
  }, [paintColor, paintSize, paintOpacity, paintSmoothness]);

  useEffect(() => {
    if (sculptOpen) managerRef.current?.setSculptTool({ active: true, tool: sculptTool, size: sculptSize, intensity: sculptIntensity, axes: sculptAxes });
    else managerRef.current?.exitSculptMode();
  }, [sculptOpen, sculptTool, sculptSize, sculptIntensity, sculptAxes]);

  // Surface mode preserves the selection while hiding its highlight. The
  // wireframe remains controlled exclusively by the Display setting.
  // Brush and spray work with nothing selected: whatever is selected when they
  // are chosen is deselected, and nothing can be selected while they are active.
  useEffect(() => {
    if (materialsOpen && surfaceSection === 'paint' && (paintTool === 'brush' || paintTool === 'spray')) {
      managerRef.current?.exitMultiSelect();
      managerRef.current?.clearSelection();
      setSelectedMeshId(null);
    }
  }, [materialsOpen, surfaceSection, paintTool, selectedMeshId, multiSelect]);

  // Multi-select never stays active across Materials opening or closing.
  useEffect(() => {
    if (managerRef.current?.multiSelect) managerRef.current.exitMultiSelect();
  }, [materialsOpen]);

  useEffect(() => {
    managerRef.current?.setHighlightsHidden(materialsOpen);
    managerRef.current?.setWireframesHidden(false);
    // Objects are never moved/scaled/rotated while Surface mode is open.
    if (managerRef.current) {
      managerRef.current.surfaceMode = materialsOpen;
      managerRef.current.surfaceSection = surfaceSection;
      if (materialsOpen && surfaceSection === 'texture') managerRef.current.exitMultiSelect();
    }
  }, [materialsOpen, surfaceSection, multiSelect]);

  // Every model lives in the Library automatically — no Save needed.
  const showProjectLimit = useCallback(() => openUpgrade(`Free accounts can keep up to ${FREE_PROJECT_LIMIT} projects.`), [openUpgrade]);
  useAutoSave(managerRef, projectName, null, { isPro, onProjectLimit: showProjectLimit });

  // Populate the scene the moment the 3D view is ready. This runs from the
  // viewport's own ready callback (not a mount effect) so the cube and grid can
  // never be skipped because the scene wasn't built yet — the cause of the
  // occasional empty black canvas.
  const handleViewportReady = useCallback(async (mgr) => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    let existing = null;
    try { existing = projectId ? await loadProject(projectId) : null; } finally { if (!existing) setModelLoading(false); }
    if (!existing && !isPro && listProjects().length >= FREE_PROJECT_LIMIT) {
      openUpgrade(`Free accounts can keep up to ${FREE_PROJECT_LIMIT} projects.`);
      navigate('/library');
      return;
    }
    if (existing) {
      // Let the loading arrows show before the model is built.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      try {
        mgr.loadProject(existing);
        mgr.frameScene();
      } finally {
        setModelLoading(false);
      }
      setProjectName(existing.name || 'Untitled');
    } else {
      theme.resetSceneSettings();
      resetRenderBoostAuto();
      if (mgr.grid) mgr.grid.visible = theme.gridVisible;
      mgr.projectId = generateProjectId();
      mgr.projectName = uniqueProjectName('Untitled', mgr.projectId);
      setProjectName(mgr.projectName);
      mgr.addPrimitive('cube', 12);
      mgr._newProjectStartingView = true;
      mgr.frameScene(7.8);
    }
    mgr.triangleLimit = isPro ? Infinity : FREE_TRIANGLE_LIMIT;
    mgr.setViewportDisplayMode({ clay: clayViewport, transparent: transparentViewport });
    mgr.setOrthographic(orthographic);
  }, [clayViewport, transparentViewport, orthographic, isPro, openUpgrade, navigate]);

  // Keyboard undo
  const undoActionRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoActionRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const closePaint = useCallback(() => {
    managerRef.current?.cancelPaintPreview();
    // However the sheet closes (another tool opening, the system back button),
    // strokes that were never applied are rolled back, the same as X. The
    // checkmark commits them before it gets here, so this is a no-op for it.
    managerRef.current?.cancelPendingPaint?.();
    managerRef.current?.exitPaintMode();
  }, []);

  const closeMaterials = useCallback(() => {
    closePaint();
    setSurfaceSub(null);
    setMaterialsOpen(false);
    window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: 'Materials' } }));
  }, [closePaint]);

  const closeSculpt = useCallback(() => {
    sculptSessionSnapshotRef.current = null;
    setSculptOpen(false);
    setSculptPanelOpen(false);
    setSculptTuning(false);
    window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: 'Sculpt' } }));
  }, []);

  const collapseSculpt = useCallback(() => {
    setSculptPanelOpen(false);
    setSculptTuning(false);
  }, []);

  const cancelOpenBevel = useCallback(() => {
    if (!bevelOpen) return false;
    cancelBevelPreview(managerRef.current);
    setBevelOpen(false);
    return true;
  }, [bevelOpen]);

  // Boolean panels: Done keeps every applied result; Cancel puts the scene
  // back to how it was before the first Apply made in the panel.
  const closeOpenBoolean = useCallback(() => {
    if (!booleanPanel) return false;
    booleanStartRef.current = null;
    booleanAppliedRef.current = false;
    setBooleanPanel(null);
    managerRef.current?.exitMultiSelect();
    return true;
  }, [booleanPanel]);

  const cancelOpenBoolean = useCallback(() => {
    if (!booleanPanel) return false;
    const manager = managerRef.current;
    const start = booleanStartRef.current;
    if (manager && start) {
      manager.restoreSnapshot(start.snapshot);
      // The applied steps are undone here, so they leave the undo history too.
      manager.undoStack.length = Math.min(manager.undoStack.length, start.undoDepth);
      manager.redoStack = [];
      setSelectedMeshId(manager.selection.meshId || null);
    }
    return closeOpenBoolean();
  }, [booleanPanel, closeOpenBoolean]);

  const cancelOpenRadialArray = useCallback(() => {
    if (!radialArrayOpen) return false;
    managerRef.current?.cancelRadialArray();
    setRadialArrayOpen(false);
    return true;
  }, [radialArrayOpen]);

  const cancelOpenSnapPanel = useCallback(() => {
    if (!snapPanelOpen) return false;
    setSnapPanelOpen(false);
    return true;
  }, [snapPanelOpen]);

  const cancelOpenFreeTransformPanel = useCallback(() => {
    if (!freeTransformPanelOpen) return false;
    setFreeTransformPanelOpen(false);
    return true;
  }, [freeTransformPanelOpen]);

  const cancelOpenAddVertex = useCallback(() => {
    if (!managerRef.current?.addVertexMode) return false;
    managerRef.current.cancelAddVertex();
    return true;
  }, []);

  // Tapping empty canvas acts like a back button: it closes the innermost open
  // thing (menu, guide, drawer, library, an open Surface sub-panel/picker, the
  // picked paint tool) and only once nothing is left does it close Surface /
  // Sculpt mode itself. It returns true when it consumed the tap so the current
  // selection is kept instead of being cleared.
  const handleCanvasBack = useCallback((fromCanvas = false) => {
    if (cancelOpenAddVertex()) return true;
    if (selectionPattern) { setSelectionPattern(null); return true; }
    if (cancelOpenBevel()) return true;
    if (cancelOpenRadialArray()) return true;
    if (cancelOpenSnapPanel()) return true;
    if (cancelOpenFreeTransformPanel()) return true;
    if (menuOpen) { setMenuOpen(false); return true; }
    if (guideOpen) { setGuideOpen(false); return true; }
    if (transformDrawerOpen) {
      if (fromCanvas) transformApplyRef.current?.();
      else setTransformDrawerOpen(false);
      return true;
    }
    if (libraryOpen) { setLibraryOpen(false); return true; }
    if (lightingOpen) { setLightingOpen(false); return true; }
    if (orientationOpen) { setOrientationOpen(false); return true; }
    if (sculptOpen) { closeSculpt(); return true; }
    return false;
  }, [cancelOpenAddVertex, selectionPattern, cancelOpenBevel, cancelOpenRadialArray, cancelOpenSnapPanel, cancelOpenFreeTransformPanel, menuOpen, guideOpen, transformDrawerOpen, libraryOpen, lightingOpen, orientationOpen, sculptOpen, closeSculpt]);

  // Device back button closes ONE layer at a time: menu sub-panels first (via
  // the drawer's own back handler), then open tool bars, then the same chain a
  // canvas back-tap walks (menu, guide, drawer, library, panels, modes).
  const handleBackStep = useCallback((fromCanvas = false) => {
    if (menuOpen && menuBackRef.current?.()) return true;
    if (helpOpen) { setHelpOpen(false); return true; }
    if (segmentsOpen) { setSegmentsOpen(false); return true; }
    if (toolsOpen) { setToolsOpen(false); return true; }
    if (modeToolsOpen) { setModeToolsOpen(false); return true; }
    // A Boolean panel: a clean tap on the canvas keeps the result and closes
    // it; the device back button cancels it.
    if (booleanPanel) { if (fromCanvas === true) closeOpenBoolean(); else cancelOpenBoolean(); return true; }
    return handleCanvasBack(fromCanvas === true);
  }, [menuOpen, helpOpen, segmentsOpen, toolsOpen, modeToolsOpen, booleanPanel, closeOpenBoolean, cancelOpenBoolean, handleCanvasBack]);

  const anyPanelOpen = menuOpen || libraryOpen || materialsOpen || sculptOpen || transformDrawerOpen || guideOpen || lightingOpen || helpOpen
    || toolsOpen || modeToolsOpen || segmentsOpen || radialArrayOpen || snapPanelOpen || freeTransformPanelOpen || orientationOpen || !!selectionPattern || !!addVertex || !!booleanPanel;
  useBackDismiss(anyPanelOpen, handleBackStep);

  const handleRedo = useCallback(() => {
    setModeToolsOpen(false);
    setToolsOpen(false);
    if (managerRef.current && !managerRef.current.redo()) notifyUnavailable('Nothing left to redo');
  }, []);

  const stopMeasure = useCallback(() => {
    setMeasureMode(false);
    managerRef.current?.setMeasureMode(false);
    window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: 'Measure' } }));
  }, []);
  const angleModeRef = useRef(false);
  angleModeRef.current = angleMode;
  const measureModeRef = useRef(false);
  measureModeRef.current = measureMode;
  const stopAngle = useCallback(() => {
    if (angleModeRef.current) window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: 'Protractor' } }));
    setAngleMode(false);
  }, []);

  // Every panel entry goes through this dismissal, in the same React update
  // as opening its replacement. Unmounting the old panel removes its keypad too.
  // Tool grids are navigation: their callers decide whether to keep them open.
  const dismissActiveTool = useCallback((keep = null) => {
    setTransformDrawerOpen(false);
    setTransformFocus(null);
    setSegmentsOpen(false);
    setLibraryOpen(false);
    setMenuOpen(false);
    setGuideOpen(false);
    // The Help panel stays open while tools or modes are selected; only its own
    // close button, the Help button, or Back close it.
    setLightingOpen(false);
    setOrientationOpen(false);
    setSnapPanelOpen(false);
    setFreeTransformPanelOpen(false);
    setPrecisionPanelOpen(false);
    if (keep !== 'material') closeMaterials();
    if (keep !== 'sculpt') closeSculpt();
    const mgr = managerRef.current;
    if (keep !== 'draw_face' && mgr?.drawMode) mgr.exitDrawMode();
    if (keep !== 'cut_loop' && keep !== 'draw_cut' && mgr?.cutMode) mgr.exitCutMode();
    if (keep !== 'add_vertex') cancelOpenAddVertex();
    if (keep !== 'select_loop' && keep !== 'select_ring') setSelectionPattern(null);
    if (keep !== 'bevel') cancelOpenBevel();
    if (keep !== 'radial_array') cancelOpenRadialArray();
    if (!BOOLEAN_OPERATION_IDS.has(keep)) closeOpenBoolean();
    if (keep !== 'measure') stopMeasure();
    if (keep !== 'protractor') stopAngle();
  }, [cancelOpenAddVertex, cancelOpenBevel, cancelOpenRadialArray, closeOpenBoolean, stopMeasure, stopAngle, closeMaterials, closeSculpt]);

  // Measure and Protractor are used with the general tools panel open; closing
  // that panel, by any route, turns them off, so no tool stays active outside
  // its own panel.
  useEffect(() => {
    if (toolsOpen) return;
    if (measureModeRef.current) stopMeasure();
    if (angleModeRef.current) stopAngle();
  }, [toolsOpen, stopMeasure, stopAngle]);

  // Undo closes whatever panel or tool bar is open. A panel holding an edit
  // that was never applied (Bevel, Radial array, Add vertex) is cancelled,
  // which takes that edit back; otherwise the last step is undone.
  const handleUndo = useCallback(() => {
    const cancelled = cancelOpenAddVertex() || cancelOpenBevel() || cancelOpenRadialArray();
    if (transformDrawerOpen) transformApplyRef.current?.();
    dismissActiveTool();
    setHelpOpen(false);
    setModeToolsOpen(false);
    setToolsOpen(false);
    if (!cancelled && managerRef.current && !managerRef.current.undo()) notifyUnavailable('Nothing left to undo');
  }, [cancelOpenAddVertex, cancelOpenBevel, cancelOpenRadialArray, dismissActiveTool, transformDrawerOpen]);
  undoActionRef.current = handleUndo;

  // Radial array works on one selected object: once nothing is selected the
  // panel closes and its preview copies go away.
  useEffect(() => {
    if (!radialArrayOpen || selectedMeshId) return;
    managerRef.current?.cancelRadialArray();
    managerRef.current?.clearSelection();
    setRadialArrayOpen(false);
  }, [radialArrayOpen, selectedMeshId]);

  // Material and Texture edit whole objects: entering them switches to Object
  // mode, converting the current selection to its object so nothing is lost.
  const enterObjectMode = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr || mgr.selectionMode === 'object') return;
    const meshId = mgr.selection.meshId;
    mgr.setSelectionMode('object');
    if (meshId) mgr.setSelection({ meshId, type: 'object', indices: [] });
    setSelectionMode('object');
  }, []);

  const handleModeChange = useCallback((mode) => {
    dismissActiveTool(materialsOpen && selectionMode !== mode ? 'material' : null);
    setLightingOpen(false);
    if (materialsOpen && selectionMode !== mode) {
      // Material / Texture: vertex, edge and face are not selectable.
      if (surfaceSection !== 'paint') {
        notifyUnavailable(`${surfaceSection === 'texture' ? 'Texture' : 'Material'} works on whole objects only`);
        return;
      }
      // Discard the old selection's preview before changing modes.
      managerRef.current?.cancelPaintPreview();
      managerRef.current?.pushUndo();
      setSelectionMode(mode);
      setToolsOpen(false);
      setLibraryOpen(false);
      setMenuOpen(false);
      setSegmentsOpen(false);
      setModeToolsOpen(false);
      return;
    }
    closeMaterials(); closeSculpt();
    if (selectionMode === mode) {
      if (modeToolsOpen) {
        setModeToolsOpen(false);
      } else {
        setToolsOpen(false);
        setLibraryOpen(false);
        setMenuOpen(false);
        setSegmentsOpen(false);
        setModeToolsOpen(true);
      }
    } else {
      managerRef.current?.pushUndo();
      setSelectionMode(mode);
      setToolsOpen(false);
      setLibraryOpen(false);
      setMenuOpen(false);
      setSegmentsOpen(false);
      setModeToolsOpen(false);
    }
  }, [selectionMode, modeToolsOpen, materialsOpen, surfaceSection, dismissActiveTool, closeMaterials, closeSculpt]);

  const handleToggleTools = useCallback(() => {
    // General Tools is navigation away from every surface editor. Close
    // Materials explicitly on every press, even if Tools happens to be open,
    // so Paint/Material/Texture can never remain mounted behind the tool grid.
    closeMaterials();
    closeSculpt();
    dismissActiveTool();
    setLightingOpen(false);
    if (toolsOpen) {
      setToolsOpen(false);
    } else {
      setModeToolsOpen(false);
      setLibraryOpen(false);
      setMenuOpen(false);
      setSegmentsOpen(false);
      setToolsOpen(true);
    }
  }, [toolsOpen, dismissActiveTool, closeMaterials, closeSculpt]);

  const handleSelectShape = useCallback((type) => {
    stopMeasure();
    const manager = managerRef.current;
    const snapshot = !isPro ? manager?.captureSnapshot() : null;
    const added = manager?.addPrimitive(type, segments);
    if (!added) return;
    if (!isPro && totalTriangles(manager) > FREE_TRIANGLE_LIMIT) {
      if (snapshot) manager.restoreSnapshot(snapshot);
      openUpgrade(`Free scenes are limited to ${FREE_TRIANGLE_LIMIT.toLocaleString()} triangles.`);
      return;
    }
    setLibraryOpen(false);
  }, [segments, isPro, openUpgrade, stopMeasure]);

  const showToolPrompt = useCallback((text) => {
    (toolPromptTimer.current || []).forEach(clearTimeout);
    setToolPrompt({ text, fading: false });
    toolPromptTimer.current = [
      setTimeout(() => setToolPrompt((current) => current?.text === text ? { ...current, fading: true } : current), 3000),
      setTimeout(() => setToolPrompt((current) => current?.text === text ? null : current), 3500),
    ];
  }, []);

  // Controls that can't act right now send their reason here.
  useEffect(() => {
    const onUnavailable = (event) => showToolPrompt(event.detail?.text);
    window.addEventListener(UNAVAILABLE_EVENT, onUnavailable);
    return () => window.removeEventListener(UNAVAILABLE_EVENT, onUnavailable);
  }, [showToolPrompt]);

  useEffect(() => {
    const showRenderBoostNotice = () => {
      clearTimeout(renderBoostNoticeTimer.current);
      setRenderBoostNotice(true);
      renderBoostNoticeTimer.current = setTimeout(() => setRenderBoostNotice(false), 3500);
    };
    window.addEventListener('axis-render-boost-active', showRenderBoostNotice);
    return () => {
      window.removeEventListener('axis-render-boost-active', showRenderBoostNotice);
      clearTimeout(renderBoostNoticeTimer.current);
    };
  }, []);

  // Orientation reset (right side, under Help): a tap lines the selected
  // geometry's own axes up with the world axes; a double-tap opens its panel.
  const handleOrientationReset = useCallback(() => {
    const manager = managerRef.current;
    if (!manager?.orientationTargets().length) { showToolPrompt('Select geometry to reset its axis orientation'); return; }
    manager.resetOrientation();
    setOrientationVersion((v) => v + 1);
    showToolPrompt('Axis orientation reset');
  }, [showToolPrompt]);
  const openOrientationPanel = useCallback(() => {
    dismissActiveTool();
    orientationSaved.current = null;
    setOrientationOpen(true);
  }, [dismissActiveTool]);
  const undoOrientationReset = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const saved = orientationSaved.current || [];
    const known = new Set(saved.map((item) => item.id));
    orientationSaved.current = [...saved, ...manager.captureOrientation(manager.orientationTargets().filter((mesh) => !known.has(mesh.id)))];
    manager.undoOrientationReset();
    setOrientationVersion((v) => v + 1);
  }, []);
  const cancelOrientationPanel = useCallback(() => {
    if (orientationSaved.current) managerRef.current?.restoreOrientation(orientationSaved.current);
    orientationSaved.current = null;
    setOrientationOpen(false);
  }, []);

  const handleTool = useCallback((toolId) => {
    setSnapPanelOpen(false);
    setFreeTransformPanelOpen(false);
    const manager = managerRef.current;
    if (!isPro && PRO_TOOL_IDS.has(toolId)) {
      openUpgrade(`${TOOLS[selectionMode]?.pages.flat().find((tool) => tool.id === toolId)?.label || 'This tool'} requires AXIS 3D Pro.`);
      return;
    }
    dismissActiveTool(toolId);
    if (BOOLEAN_OPERATION_IDS.has(toolId)) {
      // Boolean opens its panel straight away and starts fresh: anything
      // selected is deselected, and objects are assigned in the panel.
      closeOpenBoolean();
      closeMaterials(); closeSculpt();
      if (manager && manager.selectionMode !== 'object') enterObjectMode();
      manager?.exitMultiSelect();
      manager?.clearSelection();
      setSelectedMeshId(null);
      setModeToolsOpen(false);
      setToolsOpen(false);
      setBooleanPanel({ operation: toolId, session: Date.now() });
      return;
    }
    const requirementNotice = getToolRequirementNotice(manager, toolId);
    if (requirementNotice) {
      showToolPrompt(requirementNotice);
      return;
    }
    closeMaterials(); closeSculpt();
    if (toolId === 'radial_array') {
      const values = { ...toolMemory.radialArray };
      const initialValues = managerRef.current?.beginRadialArray(values);
      if (!initialValues) {
        showToolPrompt('Select one unlocked object first');
        return;
      }
      toolMemory.radialArray = { ...toolMemory.radialArray, ...initialValues };
      setModeToolsOpen(false);
      setToolsOpen(false);
      setRadialArrayOpen(true);
      return;
    }
    if (toolId === 'select_loop' || toolId === 'select_ring') {
      const mgr = managerRef.current;
      const selected = mgr?.selection;
      if (!selected?.meshId || selected.type !== 'edge' || selected.indices.length === 0) {
        showToolPrompt('Select an edge first');
        return;
      }
      // Preserve every user-selected edge as a seed. Expanding the selection
      // first and then taking index 0 silently discarded multi-selection.
      const seed = { meshId: selected.meshId, type: 'edge', indices: [...selected.indices] };
      // Offset always starts at 0; only Skip carries over from the last use.
      const values = { ...toolMemory.selectionPattern, offset: 0 };
      mgr.setSelection(seed);
      mgr.executeTool(toolId, values);
      setSelectionPattern({ toolId, label: toolId === 'select_loop' ? 'Select Loop' : 'Select Ring', seed, initialValues: values, ...values });
      setModeToolsOpen(false);
      setToolsOpen(false);
      return;
    }
    if (toolId === 'bevel') {
      setModeToolsOpen(false);
      setToolsOpen(false);
      if (!beginBevelPreview(managerRef.current)) { showToolPrompt(managerRef.current?.selection?.type === 'vertex' ? 'Select a vertex first' : 'Select an edge first'); return; }
      setBevelOpen(true);
      return;
    }
    if (toolId === 'bridge') {
      const manager = managerRef.current;
      const selected = manager?.selection;
      const mesh = manager?.getMesh(selected?.meshId);
      if (selected?.type === 'face') {
        const groups = getFaceBridgeGroups(mesh, selected.indices);
        const valid = groups.length === 2 && groups[0].loop.length === groups[1].loop.length
          && groups[0].normal.dot(groups[1].normal) < -0.5;
        if (!valid) {
          showToolPrompt('Bridge requires two opposing faces with the same number of vertices on one combined object');
          return;
        }
      } else {
        const edges = mesh?.getEdges() || [];
        const selectedEdges = selected?.indices.map((index) => edges[index]).filter(Boolean) || [];
        const separate = selectedEdges.length === 2 && ![selectedEdges[0].v1, selectedEdges[0].v2].some((id) => id === selectedEdges[1].v1 || id === selectedEdges[1].v2);
        if (!separate) {
          showToolPrompt('Select two edges that don\'t touch, on the same object, to bridge them');
          return;
        }
      }
    }
    const limitSnapshot = !isPro && TRIANGLE_GROWTH_TOOLS.has(toolId) ? manager?.captureSnapshot() : null;
    const editBefore = manager?.editVersion || 0;
    if (manager) manager.toolNotice = null;
    manager?.executeTool(toolId);
    // Dissolve reports why it could not merge (open boundary, non-planar result,
    // ...); Delete reports a vertex it refused because it is a face corner.
    // Any other tool that changed nothing says so instead of doing nothing.
    if (manager?.toolNotice) showToolPrompt(manager.toolNotice);
    else if (manager && !INTERACTIVE_TOOL_IDS.has(toolId) && (manager.editVersion || 0) === editBefore) {
      const label = TOOLS[selectionMode]?.pages.flat().find((tool) => tool.id === toolId)?.label || 'This tool';
      showToolPrompt(`${label} can't be applied to this selection`);
    }
    if (!isPro && totalTriangles(manager) > FREE_TRIANGLE_LIMIT) {
      if (limitSnapshot) manager.restoreSnapshot(limitSnapshot);
      openUpgrade(`Free scenes are limited to ${FREE_TRIANGLE_LIMIT.toLocaleString()} triangles.`);
    }
    // Once a tool is selected and its action is performed, the tool bar
    // auto-closes (applies to all modes).
    setModeToolsOpen(false);
    setToolsOpen(false);
  }, [dismissActiveTool, closeOpenBoolean, closeMaterials, closeSculpt, enterObjectMode, showToolPrompt, isPro, openUpgrade, selectionMode]);

  // Boolean panel: combine the two assigned objects (the first keeps the
  // result). The panel stays open; nothing stays selected.
  const applyBoolean = useCallback((baseId, otherId) => {
    const manager = managerRef.current;
    const operation = booleanPanel?.operation;
    if (!manager || !operation) return false;
    const before = manager.captureSnapshot();
    const undoDepth = manager.undoStack.length;
    if (!applyBooleanPair(manager, baseId, otherId, operation)) return false;
    if (!booleanStartRef.current) booleanStartRef.current = { snapshot: before, undoDepth };
    manager.clearSelection();
    setSelectedMeshId(null);
    return true;
  }, [booleanPanel]);

  // Boolean panel Remove after Apply: back to the objects as they were.
  const undoBooleanApply = useCallback(() => {
    const manager = managerRef.current;
    const start = booleanStartRef.current;
    if (!manager || !start) return;
    manager.restoreSnapshot(start.snapshot);
    manager.undoStack.length = Math.min(manager.undoStack.length, start.undoDepth);
    manager.redoStack = [];
    booleanStartRef.current = null;
    manager.clearSelection();
    setSelectedMeshId(null);
  }, []);

  // Objects are assigned one at a time in a Boolean panel, so multi-select
  // is off while it is open.
  useEffect(() => {
    if (managerRef.current) managerRef.current.multiSelectBlocked = !!booleanPanel;
  }, [booleanPanel]);

  const handleOpenSegments = useCallback(() => {
    setSnapPanelOpen(false);
    setFreeTransformPanelOpen(false);
    dismissActiveTool();
    const mgr = managerRef.current;
    const mesh = mgr?.getMesh(mgr.selection.meshId);
    if (!mesh || mgr.selection.type !== 'object') {
      showToolPrompt('Select an object to change segments');
      return;
    }
    segmentSnapshotRef.current = mgr.captureSnapshot();
    segmentMeshIdRef.current = mesh.id;
    setSegValues({
      ...(mesh.segments ? { ...mesh.segments } : { x: 1, y: 1, z: 1 }),
      primitiveType: mesh.primitiveType,
      primitiveParams: mesh.primitiveParams ? { ...mesh.primitiveParams } : null,
    });
    closeMaterials();
    closeSculpt();
    setToolsOpen(false);
    setModeToolsOpen(false);
    setLibraryOpen(false);
    setMenuOpen(false);
    setSegmentsOpen(true);
  }, [closeMaterials, closeSculpt, dismissActiveTool, showToolPrompt]);

  const applySegmentValues = (next) => {
    if (!next.primitiveType && segmentSnapshotRef.current) managerRef.current?.restoreSnapshot(segmentSnapshotRef.current);
    managerRef.current?.changeSegments(next.x, next.y, next.z, next.primitiveParams);
    if (!isPro && totalTriangles(managerRef.current) > FREE_TRIANGLE_LIMIT) {
      if (segmentSnapshotRef.current) managerRef.current?.restoreSnapshot(segmentSnapshotRef.current);
      setSegmentsOpen(false);
      openUpgrade(`Free scenes are limited to ${FREE_TRIANGLE_LIMIT.toLocaleString()} triangles.`);
    }
  };
  const scheduleSegmentValues = (next) => {
    segmentPendingRef.current = next;
    if (segmentFrameRef.current) return;
    segmentFrameRef.current = requestAnimationFrame(() => {
      segmentFrameRef.current = 0;
      const pending = segmentPendingRef.current;
      segmentPendingRef.current = null;
      if (pending) applySegmentValues(pending);
    });
  };
  // Applies any edit still waiting for its frame.
  const flushSegmentValues = () => {
    if (segmentFrameRef.current) { cancelAnimationFrame(segmentFrameRef.current); segmentFrameRef.current = 0; }
    const pending = segmentPendingRef.current;
    segmentPendingRef.current = null;
    if (pending) applySegmentValues(pending);
  };
  const dropSegmentValues = () => {
    if (segmentFrameRef.current) { cancelAnimationFrame(segmentFrameRef.current); segmentFrameRef.current = 0; }
    segmentPendingRef.current = null;
  };
  // Closing the panel keeps the edits and records them as one undo step.
  const closeSegmentsKeepingEdits = () => {
    if (!segmentsOpenRef.current) return;
    segmentsOpenRef.current = false;
    flushSegmentValues();
    if (segmentSnapshotRef.current) managerRef.current?.pushUndoSnapshot(segmentSnapshotRef.current);
    segmentSnapshotRef.current = null;
    setSegmentsOpen(false);
  };

  // Bring another saved model into the scene alongside what is already here,
  // so several models can be assembled into one. The saved model is only read.
  const handleImportFromLibrary = useCallback(async (id) => {
    const manager = managerRef.current;
    if (!manager) return;
    let data = null;
    try { data = await loadProject(id); } catch { data = null; }
    if (!data?.meshes?.length) { toast.error('That model could not be opened'); return; }
    const result = manager.importProjectMeshes(data);
    if (!result.added) { toast.error('Nothing could be imported'); return; }
    if (result.skipped) toast.error(`Imported ${result.added} of ${result.added + result.skipped} objects — triangle limit reached`);
    else toast.success(`${data.name || 'Model'} imported`);
  }, []);

  const handleNewProject = useCallback(() => {
    const currentId = managerRef.current?.projectId;
    const createsNew = !listProjects().some((project) => project.id === currentId);
    if (!isPro && createsNew && listProjects().length >= FREE_PROJECT_LIMIT) {
      openUpgrade(`Free accounts can keep up to ${FREE_PROJECT_LIMIT} projects.`);
      return;
    }
    if (managerRef.current) {
      managerRef.current.clearScene();
      theme.resetSceneSettings();
      resetRenderBoostAuto();
      if (managerRef.current.grid) managerRef.current.grid.visible = theme.gridVisible;
      managerRef.current.projectId = generateProjectId();
      managerRef.current.projectName = uniqueProjectName('Untitled', managerRef.current.projectId);
      setProjectName(managerRef.current.projectName);
      setMenuOpen(false);
    }
  }, [isPro, openUpgrade]);

  const handleSaveProject = useCallback(async () => {
    if (!managerRef.current) return;
    const exists = listProjects().some((project) => project.id === managerRef.current.projectId);
    if (!isPro && !exists && listProjects().length >= FREE_PROJECT_LIMIT) {
      openUpgrade(`Free accounts can keep up to ${FREE_PROJECT_LIMIT} projects.`);
      return;
    }
    if (projectNameTaken(projectName, managerRef.current.projectId)) {
      toast.error(`A project named "${projectName.trim()}" already exists. Rename this one in Menu > File to save it.`);
      return;
    }
    managerRef.current.projectName = projectName;
    try {
      await saveProject({ ...managerRef.current.serialize(), thumbnail: managerRef.current.captureThumbnail() });
      toast.success('Model saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save this model');
    }
  }, [projectName, isPro, openUpgrade]);

  const handleExport = useCallback(async (format) => {
    if (!isPro) { openUpgrade('Model export requires AXIS 3D Pro.'); return; }
    if (!managerRef.current) return;
    const data = managerRef.current.serialize();
    const meshes = data.meshes.map(m => EditableMesh.deserialize(m));
    if (meshes.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const filename = (projectName || 'AXIS_Model').replace(/[^a-zA-Z0-9_\-]/g, '_');
    try {
      let content, mimeType;
      if (format === 'obj') { content = exportOBJ(meshes); mimeType = 'text/plain'; }
      else if (format === 'fbx') { content = exportFBX(meshes); mimeType = 'text/plain'; }
      else {
        const { exportSTL, exportGLB, export3MF } = await import('@/lib/exporters3d');
        if (format === 'stl') { content = exportSTL(meshes); mimeType = 'model/stl'; }
        else if (format === 'glb') { content = exportGLB(meshes); mimeType = 'model/gltf-binary'; }
        else if (format === '3mf') { content = export3MF(meshes, unit); mimeType = 'model/3mf'; }
        else throw new Error(`Unsupported export format: ${format}`);
      }
      const result = await downloadFile(content, `${filename}.${format}`, mimeType);
      if (result === 'saved') toast.success(`${format.toUpperCase()} saved`);
      else if (result === 'shared') toast.success(`${format.toUpperCase()} sent to Android save/share sheet`);
      else toast.message(`${format.toUpperCase()} download attempted. Check Downloads.`);
    } catch (error) {
      console.error('Model export failed:', error);
      toast.error(error?.message || `Could not export ${format.toUpperCase()}`);
    }
  }, [projectName, unit, isPro, openUpgrade]);

  const handleAddReference = useCallback(async (file) => {
    setAddingReference(true);
    try {
      if (!file || !file.type.startsWith('image/')) throw new Error('Choose a reference image.');
      const localDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not read reference image.'));
        reader.readAsDataURL(file);
      });
      if (typeof localDataUrl !== 'string' || !managerRef.current) throw new Error('Could not add reference image.');
      // Persist the image with the project in IndexedDB, never on a server.
      managerRef.current.addReferenceImage(localDataUrl);
    } catch (error) {
      toast.error(error?.message || 'Could not add reference image.');
    } finally {
      setAddingReference(false);
    }
  }, []);

  const handleImport = useCallback(async (file) => {
    if (!isPro) { openUpgrade('Model import requires AXIS 3D Pro.'); return; }
    setImporting(true);
    try {
      // Parse and reconstruct imported topology off the UI thread. Older
      // Android shells without module workers retain the direct fallback.
      await new Promise((r) => setTimeout(r, 50));
      const { importModelFileOffThread } = await import('@/lib/importWorkerClient');
      const meshes = await importModelFileOffThread(file);
      if (!meshes || meshes.length === 0) { toast.error('No meshes found in file'); return; }
      managerRef.current?.pushUndo();
      for (const m of meshes) {
        managerRef.current?.addMesh(m);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (meshes[0]) managerRef.current?.setSelection({ meshId: meshes[0].id, type: 'object', indices: [] });
      // Imported files retain their actual coordinates. Fit the camera around
      // the result instead of silently resizing the geometry.
      managerRef.current?.frameScene();
      toast.success(`Imported ${meshes.length} object${meshes.length === 1 ? '' : 's'} from ${file.name}`);
      setLibraryOpen(false);
    } catch (err) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [isPro, openUpgrade]);

  const handleLock = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    if (selectedMeshId) {
      mgr.lockSelection();
    } else if (mgr.hasLockedObjects()) {
      mgr.unlockAll();
    } else {
      showToolPrompt('select objects to be locked');
    }
  }, [selectedMeshId, showToolPrompt]);

  const handleToggleMultiSelect = useCallback(() => {
    if (materialsOpen && surfaceSection === 'texture') { notifyUnavailable('Multi-select isn\'t available in Texture'); return; }
    if (multiSelect) managerRef.current?.exitMultiSelect();
    else managerRef.current?.enterMultiSelect();
    setToolsOpen(false);
  }, [multiSelect, materialsOpen, surfaceSection]);

  // "Display selected": hide everything not selected; when anything is hidden
  // the same button becomes "Display hidden" and unhides all objects.
  const handleDisplaySelected = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const anyHidden = mgr.meshes.some((m) => !m.visible);
    if (anyHidden) {
      mgr.pushUndo();
      for (const m of mgr.meshes) m.visible = true;
      for (const m of mgr.meshes) mgr.rebuildThreeMesh(m.id);
      return;
    }
    const ids = mgr.isGroupMode() ? mgr.selectedMeshIds : (mgr.selection.meshId ? [mgr.selection.meshId] : []);
    if (ids.length === 0) { showToolPrompt('Select object(s) first'); return; }
    mgr.pushUndo();
    for (const m of mgr.meshes) m.visible = ids.includes(m.id);
    for (const m of mgr.meshes) mgr.rebuildThreeMesh(m.id);
    mgr.focusSelection();
  }, [showToolPrompt]);

  const handleToggleAngle = useCallback(() => {
    setAngleMode((v) => {
      const nv = !v;
      if (nv) setSelectionMode('edge');
      else window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: 'Protractor' } }));
      return nv;
    });
  }, []);

  // Measure tool: taps place two snap points; the manager handles tap routing
  // and point storage, MeasureOverlay renders the distance.
  const handleToggleMeasure = useCallback(() => setMeasureMode((v) => {
    if (v) window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: 'Measure' } }));
    return !v;
  }), []);

  useEffect(() => {
    managerRef.current?.setMeasureMode(measureMode);
  }, [measureMode]);

  return (
    <div
      className="axis-modeler fixed left-0 right-0 top-0 overflow-hidden bg-black select-none"
      style={/** @type {import('react').CSSProperties & { '--axis-ui-color': string, '--axis-safe-bottom': string }} */ ({ '--axis-ui-color': uiColor, '--axis-safe-bottom': '0px', height: `${workspaceHeight}px` })}
    >
      <ThreeViewport
        ref={managerRef}
        onHudChange={setHud}
        onTriangleCountChange={setSelectionMetric}
        onMarqueeChange={setMarquee}
        onSelectionChange={() => {
          setFreeTransformPanelOpen(false);
          setSelectedMeshId(managerRef.current?.selection.meshId || null);
          // Deselecting (or picking something else) closes the segments panel.
          if (segmentsOpenRef.current) {
            const sel = managerRef.current?.selection;
            if (!sel?.meshId || sel.type !== 'object' || sel.meshId !== segmentMeshIdRef.current) closeSegmentsKeepingEdits();
          }
          window.dispatchEvent(new CustomEvent('axis-selection-change'));
        }}
        onBeforeSelectionTap={(selection) => {
          if (bevelOpen && (selection?.type === 'edge' || selection?.type === 'vertex')) cancelOpenBevel();
        }}
        onSelectionTap={(selection) => {
          if (selectionPattern && selection?.type === 'edge') setSelectionPattern(null);
          // Once a Boolean result is applied, tapping an object keeps it and
          // closes the panel.
          if (booleanPanel && booleanAppliedRef.current) closeOpenBoolean();
        }}
        onMultiSelectChange={setMultiSelect}
        onDrawChange={(next) => { setDraw(next); if (next?.axis) setDrawAxis(next.axis); }}
        onLockChange={() => setLockTick((t) => t + 1)}
        onSelectionModeChange={setSelectionMode}
        onCutChange={setCut}
        onAddVertexChange={setAddVertex}
        onLightsChange={setLightingState}
        onEmptyTap={() => {
          if (patternClosedByTouchRef.current) { patternClosedByTouchRef.current = false; return true; }
          if (freeTransformPanelOpen) {
            setFreeTransformPanelOpen(false);
            return true;
          }
          // Measure and Protractor are used on the canvas with their panel open:
          // an empty tap only clears the selection.
          if (toolsOpen && (measureMode || angleMode)) return false;
          // Snapping settings close only through their own close controls.
          if (toolsOpen || modeToolsOpen) {
            setToolsOpen(false);
            setModeToolsOpen(false);
            return true;
          }
          return handleBackStep(true);
        }}
        onGraphicsError={setGraphicsError}
        onTriangleLimit={() => openUpgrade(`Free scenes are limited to ${FREE_TRIANGLE_LIMIT.toLocaleString()} triangles.`)}
        onReady={handleViewportReady}
      />

      <GraphicsErrorBanner message={graphicsError} onClose={() => setGraphicsError(null)} />

      <MarqueeOverlay rect={marquee} />
      <DrawOverlay draw={draw} />
      <MeasurementOverlay managerRef={managerRef} unit={unit} option={measurementOption} enabled={measurementsOn} />
      <AngleOverlay managerRef={managerRef} enabled={angleMode} />
      <MeasureOverlay managerRef={managerRef} unit={unit} enabled={measureMode} />

      <TopBar
        clayViewport={clayViewport}
        transparentViewport={transparentViewport}
        orthographic={orthographic}
        onToggleOrthographic={() => setOrthographic((value) => !value)}
        freeTransform={freeTransform}
        snapping={snapToGrid}
        precision={precision}
        onTogglePrecision={() => { dismissActiveTool(); setPrecision(v => { if (v) setPrecisionPanelOpen(false); return !v; }); }}
        onOpenPrecisionPanel={() => { dismissActiveTool(); setPrecision(true); setPrecisionPanelOpen(true); setSnapPanelOpen(false); setFreeTransformPanelOpen(false); }}
        onToggleClayViewport={() => { setSnapPanelOpen(false); setFreeTransformPanelOpen(false); setClayViewport((value) => !value); }}
        onToggleTransparentViewport={() => { setSnapPanelOpen(false); setFreeTransformPanelOpen(false); setTransparentViewport((value) => !value); }}
        onToggleFreeTransform={() => { dismissActiveTool(); handleToggleFreeTransform(); }}
        onToggleSnapping={() => {
          dismissActiveTool();
          const next = !snapToGrid;
          theme.set({ snapToGrid: next });
          if (!next) setSnapPanelOpen(false);
        }}
        onOpenFreeTransformPanel={() => { dismissActiveTool(); setSnapPanelOpen(false); setFreeTransformPanelOpen(true); }}
        onOpenSnapPanel={() => { dismissActiveTool(); theme.set({ snapToGrid: true }); setFreeTransformPanelOpen(false); setSnapPanelOpen(true); }}
        onFocus={() => { if (!managerRef.current?.focusSelection()) showToolPrompt('Select something to focus on'); }}
        onMenu={() => {
          setSnapPanelOpen(false); setFreeTransformPanelOpen(false);
          dismissActiveTool();
          setToolsOpen(false); setModeToolsOpen(false); setLibraryOpen(false); setSegmentsOpen(false);
          closeMaterials(); closeSculpt(); setLightingOpen(false);
          setMenuOpen(!menuOpen);
        }}
        helpOpen={helpOpen}
        counter={!(menuOpen || guideOpen || libraryOpen || transformDrawerOpen) ? <TriangleCounter metric={selectionMetric} /> : null}
        onHelp={() => { if (helpOpen) { setHelpOpen(false); return; } dismissActiveTool(); setHelpOpen(true); }}
        onOrientationReset={handleOrientationReset}
        onOpenOrientationPanel={openOrientationPanel}
        orientationOpen={orientationOpen}
        onUndo={() => { setSnapPanelOpen(false); setFreeTransformPanelOpen(false); handleUndo(); }}
        onRedo={() => { setSnapPanelOpen(false); setFreeTransformPanelOpen(false); handleRedo(); }}
      />

      {/* The HUD and its tips only exist while the canvas is actually visible —
          guides, the library and drawers hide them; the menu hides only what
          it covers. */}
      {!(guideOpen || libraryOpen || transformDrawerOpen) && (<>
      <div className="absolute left-[3.75rem] right-[4.25rem] top-[calc(env(safe-area-inset-top,0px)+0.25rem)] z-[60] flex flex-col items-center gap-1 pointer-events-none">
      {/* On narrow screens the tip moves right just enough to clear the Orthographic button. */}
      <div ref={tipRef} className="w-fit max-w-full overflow-hidden rounded-xl" style={{ background: 'rgba(9,13,22,0.26)', border: '1px solid rgba(255,255,255,0.07)', visibility: tipCovered ? 'hidden' : undefined, marginLeft: 'max(0px, calc(382px - 100vw))' }}>
      <ContextTip
        context={
          cut?.kind === 'loop' ? 'cutLoop'
            : cut?.kind === 'draw' ? 'drawCut'
            : addVertex ? 'addVertex'
            : bevelOpen ? 'bevel'
            : radialArrayOpen ? 'radialArray'
            : selectionPattern ? 'selectionPattern'
            : draw?.active ? 'drawFace'
            : measureMode ? 'measure'
            : angleMode ? 'angle'
            : sculptOpen ? 'sculpt'
            : materialsOpen ? 'surface'
            : multiSelect ? 'multiSelect'
            : !selectedMeshId ? 'empty'
            : selectionMode
        }
      />
      </div>
      <div ref={hudPillRef} data-hint="transform-values" className="w-fit max-w-full overflow-hidden rounded-xl" style={{ background: 'rgba(9,13,22,0.26)', border: '1px solid rgba(255,255,255,0.07)', visibility: hudCovered ? 'hidden' : undefined }}>
      <PositionHud
        hud={hud}
        onOpenTransform={(target) => {
          const meshId = managerRef.current?.selection.meshId || selectedMeshId;
          if (!meshId) { showToolPrompt('Select geometry to edit its transform values'); return; }
          dismissActiveTool();
          setToolsOpen(false);
          setModeToolsOpen(false);
          setTransformDrawerMeshId(meshId);
          setTransformFocus(target || null);
          setTransformDrawerOpen(true);
        }}
      />
      </div>
      {/* Labels and prompts stack in this same column under the HUD, so they can never overlap it or each other. */}
      <div ref={promptsRef} className="w-full flex flex-col items-center gap-1" style={{ visibility: promptsCovered ? 'hidden' : undefined }}>
      <MultiSelectLabel active={multiSelect} />
      <ToolAnnouncement suppressed={multiSelect} toolActive={!!(draw?.active || cut || addVertex || selectionPattern || bevelOpen || booleanPanel || radialArrayOpen || measureMode || angleMode || materialsOpen || sculptOpen || transformDrawerOpen)} />
      <PaintToolFlash suppressed={multiSelect} />
      {toolPrompt && (
        <div
          className="w-full text-center font-mono text-[12px]"
          style={{
            color: highlightColor,
            opacity: toolPrompt.fading ? 0 : 1,
            transition: 'opacity 500ms ease',
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          }}
        >
          {toolPrompt.text}
        </div>
      )}
      {renderBoostNotice && (
        <div
          className="rounded-full border px-4 py-2 font-mono text-[12px] whitespace-nowrap"
          style={{
            color: highlightColor,
            borderColor: `${highlightColor}80`,
            background: 'rgba(10,10,12,0.9)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          Render Boost active
        </div>
      )}
      </div>
      </div>
      <ViewGizmo managerRef={managerRef} coverRef={gizmoRef} hidden={gizmoCovered} />
      </>)}

      <HintsController
        managerRef={managerRef}
        selectionMode={selectionMode}
        modeToolsOpen={modeToolsOpen}
        toolGridOpen={modeToolsOpen || toolsOpen}
        idle={!anyPanelOpen}
        hasSelection={!!selectedMeshId}
        action={hud.action}
        multiSelect={multiSelect}
        settingsOpen={snapPanelOpen || precisionPanelOpen || freeTransformPanelOpen}
        libraryOpen={libraryOpen}
        menuOpen={menuOpen}
      />

      {modeToolsOpen && (
        <ModeToolGrid
          selectionMode={selectionMode}
          clearSelectionToken={toolSelectionClearTick}
          onTool={handleTool}
          onSegments={handleOpenSegments}
          onLock={handleLock}
          lockLabel={!selectedMeshId && (managerRef.current?.hasLockedObjects() ?? false) ? 'Unlock' : 'Lock'}
          softNormalsOn={!!managerRef.current?.getMesh(managerRef.current?.selection.meshId)?.smoothShading}
          isPro={isPro}
          onProLock={openUpgrade}
        />
      )}

      {selectionPattern && (
        <SelectionPatternPanel
          label={selectionPattern.label}
          skip={selectionPattern.skip}
          offset={selectionPattern.offset}
          onChange={(values) => {
            toolMemory.selectionPattern = { ...values };
            setSelectionPattern((current) => ({ ...current, ...values }));
            managerRef.current?.setSelection(selectionPattern.seed);
            managerRef.current?.executeTool(selectionPattern.toolId, values);
          }}
          onClose={() => setSelectionPattern(null)}
          onCancel={() => {
            // Cancel puts back the edges that were selected before the tool opened.
            toolMemory.selectionPattern = { ...selectionPattern.initialValues };
            managerRef.current?.setSelection(selectionPattern.seed);
            setSelectionPattern(null);
          }}
        />
      )}

      {segmentsOpen && (
        <SegmentsModal
          values={segValues}
          onChange={(next) => {
            setSegValues(next);
            // Remember the radial segment count so the next new shape uses it —
            // only from round shapes, so a cube's X count doesn't carry over.
            if (isRadialPrimitive(next.primitiveType)) {
              toolMemory.primitiveSegments = next.x;
              setSegments(next.x);
            }
            scheduleSegmentValues(next);
          }}
          onApply={() => {
            closeSegmentsKeepingEdits();
          }}
          onCancel={() => {
            dropSegmentValues();
            if (segmentSnapshotRef.current) managerRef.current?.restoreSnapshot(segmentSnapshotRef.current);
            segmentSnapshotRef.current = null;
            setSegmentsOpen(false);
          }}
        />
      )}

      {toolsOpen && (
      <GeneralToolGrid
        clearSelectionToken={toolSelectionClearTick}
        onClose={() => setToolsOpen(false)}
        onTool={handleTool}
        onAddReference={handleAddReference}

        onMaterial={() => {
          closePaint(); closeSculpt(); setToolsOpen(false);
          // Material permits object multi-select; Paint permits all modes.
          // Only Texture disables multi-select.
          // Reopen the last Materials/Paint/Texture tab. Only Material and
          // Texture require object mode; Paint preserves the edit mode.
          if (surfaceSection !== 'paint') enterObjectMode();
          setMaterialsOpen(true);
        }}
        onSculpt={() => {
          // Pro check here too, not only in the grid button.
          if (!isPro) { openUpgrade('Sculpt requires AXIS 3D Pro.'); return; }
          closePaint();
          setToolsOpen(false);
          sculptSessionSnapshotRef.current = managerRef.current?.captureSnapshot() || null;
          // Nothing stays selected while sculpting.
          managerRef.current?.clearSelection();
          setSelectedMeshId(null);
          setSculptOpen(true);
          setSculptPanelOpen(true);
        }}
        multiSelect={multiSelect}
        onToggleMultiSelect={handleToggleMultiSelect}
        onExitMultiSelect={() => managerRef.current?.exitMultiSelect()}
        onConvert={(type) => {
          const manager = managerRef.current;
          const requirementNotice = getToolRequirementNotice(manager, `convert_${type}`);
          if (requirementNotice) showToolPrompt(requirementNotice);
          else manager?.convertSelection(type);
        }}
        anyHidden={managerRef.current?.meshes.some((m) => !m.visible) ?? false}
        onDisplaySelected={handleDisplaySelected}
        angleMode={angleMode}
        onToggleAngle={handleToggleAngle}
        measureMode={measureMode}
        onToggleMeasure={handleToggleMeasure}
        freeTransform={freeTransform}
        onToggleFreeTransform={handleToggleFreeTransform}
        isPro={isPro}
        onProLock={openUpgrade}
        onActivateTool={(id) => dismissActiveTool(id)}
      />
      )}

      {!lightingOpen && !modeToolsOpen && !toolsOpen && (
        <BottomToolbar
          soloButton={null}
          selectionMode={selectionMode}
          onModeChange={handleModeChange}
          onToggleTools={handleToggleTools}
          toolsOpen={toolsOpen}
          onLibrary={() => { dismissActiveTool(); closeMaterials(); closeSculpt(); setLightingOpen(false); setToolsOpen(false); setModeToolsOpen(false); setMenuOpen(false); setSegmentsOpen(false); setLibraryOpen(true); }}
          libraryOpen={libraryOpen}
        />
      )}

      <LibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelectShape={handleSelectShape}
        segments={segments}
        onSegmentsChange={(v) => { toolMemory.primitiveSegments = v; setSegments(v); }}
        managerRef={managerRef}
      />

      <MenuDrawer
        open={menuOpen}
        onPanelRect={setMenuRect}
        backRef={menuBackRef}
        onClose={() => setMenuOpen(false)}
        projectName={projectName}
        onRename={setProjectName}
        onNewProject={handleNewProject}
        onSaveProject={handleSaveProject}
        onExport={handleExport}
        onLibrary={() => navigate('/library')}
        onImport={handleImport}
        onImportFromLibrary={handleImportFromLibrary}
        currentProjectId={managerRef.current?.projectId || null}
        onGuide={() => { dismissActiveTool(); setToolsOpen(false); setModeToolsOpen(false); setGuideOpen(true); }}
        onLighting={() => { dismissActiveTool(); setToolsOpen(false); setModeToolsOpen(false); setLightingOpen(true); }}
        isPro={isPro}
        onProLock={openUpgrade}
        display={{
          gridVisible,
          onToggleGrid: (v) => setGridVisible(v),
          measurementsOn,
          onToggleMeasure: (v) => setMeasurementsOn(v),
          measurementOption,
          onSetMeasurementOption: setMeasurementOption,
          managerRef,
        }}
      />

      {lightingOpen && (
        <LightingPanel state={lightingState} managerRef={managerRef} onClose={() => setLightingOpen(false)} />
      )}

      {materialsOpen && (
        <MaterialsPanel
          meshId={selectedMeshId}
          managerRef={managerRef}
          onClose={closeMaterials}
          onBack={() => { closeMaterials(); setToolsOpen(true); }}
          open={surfaceSub}
          onOpenChange={setSurfaceSub}
          section={surfaceSection}
          onSectionChange={(section) => {
            if (section === 'texture') managerRef.current?.exitMultiSelect();
            localStorage.setItem('axis.materials.lastSection', section || 'material');
            setSurfaceSection(section);
          }}
          selectionMode={selectionMode}
          onSelectionMode={enterObjectMode}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPickerOpen}
          paintTool={paintTool}
          lastVertexTool={lastVertexPaintTool}
          paintColor={paintColor}
          paintSize={paintSize}
          onPaintSize={setPaintSize}
          paintSmoothness={paintSmoothness}
          onPaintSmoothness={setPaintSmoothness}
          paintOpacity={paintOpacity}
          onPaintOpacity={setPaintOpacity}
          onPaintTool={(tool) => {
            managerRef.current?.cancelPaintPreview();
            if (tool === 'brush' || tool === 'spray' || tool === 'fill') setLastVertexPaintTool(tool);
            setPaintTool(tool);
          }}
          onPaintColor={(color) => {
            // Choosing a color never changes the object; paint lands only on Apply.
            setPaintColor(color);
          }}
          onFill={(color = paintColor) => {
            if (paintTool === 'brush' || paintTool === 'spray') return;
            // If the picker has a live Fill preview, applyPaintFill commits
            // that exact preview. Do not restore/cancel it first.
            if (!managerRef.current?.applyPaintFill(color, paintOpacity / 100)) showToolPrompt('Select an object, face, edge, or vertex first');
          }}
        />
      )}

      {sculptOpen && sculptPanelOpen && (
        <SculptPanel
          tool={sculptTool} size={sculptSize} intensity={sculptIntensity}
          activeAxes={sculptAxes}
          onTool={setSculptTool} onSize={setSculptSize} onIntensity={setSculptIntensity}
          onAxesChange={setSculptAxes}
          onTuningChange={setSculptTuning}
          onCancel={closeSculpt}
          onApply={collapseSculpt}
        />
      )}
      {sculptOpen && !sculptPanelOpen && (
        <button
          onClick={() => setSculptPanelOpen(true)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full border flex items-center justify-center active:scale-95"
          style={{ borderColor: `${highlightColor}66`, color: uiColor, background: 'rgba(10,10,12,0.8)' }}
          aria-label="Open sculpt"
        >
          <Hand className="w-5 h-5" />
        </button>
      )}
      {sculptOpen && (
        <SculptRingOverlay
          visible={sculptTuning}
          pixelRadius={managerRef.current?.brushSizeToScreenPixels(sculptSize) ?? 60}
          color={highlightColor}
        />
      )}

      {bevelOpen && (
        <BevelPanel
          isPro={isPro}
          onProLock={openUpgrade}
          onPreview={(options) => {
            updateBevelPreview(managerRef.current, options);
            if (managerRef.current?.bevelNotice) showToolPrompt(managerRef.current.bevelNotice);
            if (!isPro && totalTriangles(managerRef.current) > FREE_TRIANGLE_LIMIT) {
              cancelBevelPreview(managerRef.current); setBevelOpen(false);
              openUpgrade(`Free scenes are limited to ${FREE_TRIANGLE_LIMIT.toLocaleString()} triangles.`);
            }
          }}
          onApply={(options) => { updateBevelPreview(managerRef.current, options); commitBevelPreview(managerRef.current); setBevelOpen(false); }}
          onCancel={() => { cancelBevelPreview(managerRef.current); setBevelOpen(false); }}
        />
      )}

      {orientationOpen && (
        <OrientationPanel
          canUndo={!!managerRef.current?.canUndoOrientationReset()}
          onUndo={undoOrientationReset}
          onCancel={cancelOrientationPanel}
          onApply={() => { orientationSaved.current = null; setOrientationOpen(false); }}
        />
      )}

      {booleanPanel && (
        <BooleanPanel
          key={booleanPanel.session}
          operation={booleanPanel.operation}
          managerRef={managerRef}
          onPrompt={showToolPrompt}
          onApply={applyBoolean}
          onUndoApply={undoBooleanApply}
          onAppliedChange={(applied) => { booleanAppliedRef.current = applied; }}
          onDone={closeOpenBoolean}
          onCancel={cancelOpenBoolean}
        />
      )}

      {modelLoading && <ModelLoading />}

      {draw?.active && draw.kind === 'face' && (
        <DrawFacePanel
          axis={drawAxis}
          managerRef={managerRef}
          onAxis={(axis) => managerRef.current?.setDrawPlaneAxis(axis)}
          onCancel={() => managerRef.current?.exitDrawMode()}
          onApply={() => managerRef.current?.confirmDrawFaces()}
        />
      )}

      {radialArrayOpen && (
        <RadialArrayPanel
          onPreview={(options) => managerRef.current?.updateRadialArray(options)}
          onApply={() => { managerRef.current?.commitRadialArray(); setRadialArrayOpen(false); }}
          onCancel={() => { managerRef.current?.cancelRadialArray(); setRadialArrayOpen(false); }}
        />
      )}

      {freeTransformPanelOpen && (
        <FreeTransformPanel
          settings={freeTransformSettings}
          onChange={handleFreeTransformSetting}
          onClose={() => setFreeTransformPanelOpen(false)}
        />
      )}

      {snapPanelOpen && <SnapPanel onClose={() => setSnapPanelOpen(false)} />}
      {precisionPanelOpen && precision && <PrecisionPanel intensity={precisionIntensity} onChange={setPrecisionIntensity} onClose={() => setPrecisionPanelOpen(false)} />}

      {transformDrawerOpen && (
        <TransformDrawer
          meshId={transformDrawerMeshId}
          managerRef={managerRef}
          focus={transformFocus}
          hud={hud}
          onRegisterApply={(fn) => { transformApplyRef.current = fn; }}
          onClose={() => { setTransformDrawerOpen(false); setTransformFocus(null); }}
        />
      )}

      <CutPanel
        cut={cut}
        onCut={() => { if (!managerRef.current?.commitCut()) toast.error('Nothing to cut there'); }}
        onDeleteLast={() => managerRef.current?.removeLastCutPoint()}
        onCenterSnap={(enabled) => managerRef.current?.setCutCenterSnap(enabled)}
        onDrawSnap={(enabled) => managerRef.current?.setDrawCutSnap(enabled)}
        onPathMode={(mode) => managerRef.current?.setCutPathMode(mode)}
        onCancel={() => managerRef.current?.exitCutMode()}
      />

      <AddVertexPanel
        state={addVertex}
        onConfirm={() => managerRef.current?.confirmAddVertex()}
        onCancel={() => managerRef.current?.cancelAddVertex()}
        onDeleteLast={() => managerRef.current?.deleteLastAddVertex()}
        onCenterSnap={(enabled) => managerRef.current?.setAddVertexCenterSnap(enabled)}
      />

      {guideOpen && <GuideSheet onClose={() => setGuideOpen(false)} />}
      {helpOpen && !(menuOpen || guideOpen || libraryOpen || transformDrawerOpen) && <HelpPanel onClose={() => setHelpOpen(false)} />}



      {(importing || addingReference) && (
        <div role="status" className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <LogoLoader label={addingReference ? 'Adding reference…' : 'Importing…'} />
        </div>
      )}

    </div>
  );
}