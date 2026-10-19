// Compile-time description of SceneManager methods installed by the existing
// split-out modeling modules. These declarations do not change runtime code.
// In particular, the concrete SceneManager constructor and modeling algorithms
// are deliberately untouched. Tighten legacy JS parameter types incrementally.
import './SceneManager.js';

export interface SceneSelection {
  meshId: number | null;
  type: string;
  indices: number[];
}
export interface SceneSnapshot {
  meshes: import('./EditableMesh.js').EditableMesh[];
  selection: SceneSelection;
  selectedMeshIds: number[];
  multiSelect: boolean;
  selectionMode: string;
  lights?: unknown[];
  selectedLightId?: string | null;
  [key: string]: unknown;
}
export interface SceneLightRecord {
  id: string;
  type: string;
  [key: string]: unknown;
}

declare module './SceneManager.js' {
  interface SceneManager {
    // Optional state populated by attached modules or UI callbacks.
    // Gesture state created by the touch/camera helpers after construction.
    cameraGesture?: boolean;
    _cameraTouchFrozen?: boolean;
    _quickTapCamera?: {
      theta: number;
      phi: number;
      target: import('three').Vector3;
      distance: number;
    } | null;
    _resumeObjectGesture?: boolean;
    measureMode?: boolean;
    _radialArray?: object | null;
    _msPainted?: boolean;
    _msManipulated?: boolean;
    _cameraHandoffGuard?: { x: number; y: number } | null;
    _cameraOrbitVelocity?: object | null;
    _cameraLastMoveAt?: number | null;
    _paintStroke?: object | null;
    _cameraTwoFingerFrame?: number | null;
    triangleLimit?: number;
    _camRaf?: number;
    _cancelCameraOnBlur?: () => void;
    _renderBoostTimer?: ReturnType<typeof setTimeout>;
    activeRotation?: import('three').Vector3 | null;
    activeRotationAxis?: string | null;
    objectAxisArrows?: import('three').Group | null;
    focusRenderBoostEnabled?: boolean;
    _focusMeshId?: number | null;
    _reflectionDirty?: boolean;
    _reflectionRigs?: Map<number, unknown>;
    reflectionEnvironment?: string | null;
    _envTexture?: import('three').Texture | null;
    _envPmrem?: unknown;
    /** Implemented by sceneMouse.js */
    _beginMouseScale(e: any): any;
    /** Implemented by sceneMouse.js */
    _beginWheelStep(): any;
    /** Implemented by sceneReflections.js */
    _buildStudioEnvironment(): any;
    /** Implemented by sceneLights.js */
    _createSceneLight(source: any): any;
    /** Implemented by sceneReflections.js */
    _disposeReflectionRig(meshId: number): any;
    /** Implemented by sceneLights.js */
    _disposeSceneLight(record: any): any;
    /** Implemented by sceneLights.js */
    _emitSceneLights(): any;
    /** Implemented by sceneReflections.js */
    _ensureReflectionRig(meshId: number): any;
    /** Implemented by sceneLights.js */
    _leaveDefaultLighting(): any;
    /** Implemented by sceneReflections.js */
    _reflectionSceneSignature(): any;
    /** Implemented by sceneLights.js */
    _syncSceneLight(record: any): any;
    /** Implemented by sceneMouse.js */
    _updateMouseScale(e: any): any;
    /** Implemented by sceneReference.js */
    addReferenceImage(url: any): any;
    /** Implemented by sceneAddVertex.js */
    addVertexAt(clientX: number, clientY: number): any;
    /** Implemented by sceneExtrude.js */
    adjacentFacesForEdge(mesh: any, v1: any, v2: any): any;
    /** Implemented by sceneDrawFace.js */
    alignDrawCameraToPlane(): any;
    /** Implemented by sceneDrawFace.js */
    appendDrawFacePoint(x: number, y: number): any;
    /** Implemented by sceneGestures.js */
    applyCameraTwoFinger(): any;
    /** Implemented by sceneLights.js */
    applyLighting(): void;
    /** Implemented by sceneGestures.js */
    applyMarquee(): any;
    /** Implemented by sceneTexture.js */
    applyTextureToSelection(file: any): any;
    /** Implemented by sceneTexture.js */
    applyTextureUrl(url: any, objectUrl?: any): any;
    /** Implemented by sceneCut.js */
    beginCutDrag(clientX: number, clientY: number): any;
    /** Implemented by sceneDrawFace.js */
    beginDrawFaceStroke(x: number, y: number): any;
    /** Implemented by sceneExtrude.js */
    beginEdgeExtrudeDrag(): any;
    /** Implemented by sceneExtrude.js */
    beginExtrudeDrag(): any;
    /** Implemented by sceneRadialArray.js */
    beginRadialArray(options: any): any;
    /** Implemented by sceneLights.js */
    beginSceneLightControl(): any;
    /** Implemented by sceneLights.js */
    beginSceneLightGesture(e: any): any;
    /** Implemented by sceneLights.js */
    beginSceneLightMouse(e: any): any;
    /** Implemented by sceneGestures.js */
    beginSculptStroke(x: number, y: number): boolean;
    /** Implemented by sceneAddVertex.js */
    cancelAddVertex(): any;
    /** Implemented by sceneRadialArray.js */
    cancelRadialArray(): any;
    /** Implemented by sceneUndo.js */
    captureSnapshot(): SceneSnapshot;
    /** Implemented by sceneCut.js */
    clearCutPreview(): any;
    /** Implemented by sceneSelection.js */
    clearSelection(): void;
    /** Implemented by sceneTexture.js */
    clearTexture(): any;
    /** Implemented by sceneCut.js */
    commitCut(): boolean;
    /** Implemented by sceneExtrude.js */
    commitExtrudeDrag(): any;
    /** Implemented by sceneRadialArray.js */
    commitRadialArray(): any;
    /** Implemented by sceneDrawFace.js */
    completeDrawFace(): any;
    /** Implemented by sceneAddVertex.js */
    confirmAddVertex(): any;
    /** Implemented by sceneDrawFace.js */
    confirmDrawFaces(): any;
    /** Implemented by sceneConvert.js */
    convertSelection(target: string): any;
    /** Implemented by sceneAddVertex.js */
    deleteLastAddVertex(): any;
    /** Implemented by sceneLights.js */
    deleteSelectedSceneLight(): any;
    /** Implemented by sceneSelection.js */
    deselectAtPoint(clientX: number, clientY: number): any;
    /** Implemented by sceneLights.js */
    disposeSceneLights(): any;
    /** Implemented by sceneReflections.js */
    disposeSceneReflections(): any;
    /** Implemented by sceneCut.js */
    dragCutTo(clientX: number, clientY: number): any;
    /** Implemented by sceneLights.js */
    duplicateSelectedSceneLight(): any;
    /** Implemented by sceneCut.js */
    edgeParamAtScreen(mesh: any, edge: any, ndcX: number, ndcY: number): any;
    /** Implemented by sceneDrawFace.js */
    emitDrawState(nearStart?: boolean): any;
    /** Implemented by sceneCut.js */
    endCutDrag(): any;
    /** Implemented by sceneAddVertex.js */
    enterAddVertexMode(): any;
    /** Implemented by sceneCut.js */
    enterCutMode(kind: string): any;
    /** Implemented by sceneDrawFace.js */
    enterDrawMode(kind: string): any;
    /** Implemented by sceneSelection.js */
    enterMultiSelect(): any;
    /** Implemented by sceneCut.js */
    exitCutMode(): any;
    /** Implemented by sceneDrawFace.js */
    exitDrawMode(): any;
    /** Implemented by sceneSelection.js */
    exitMultiSelect(): void;
    /** Implemented by sceneExtrude.js */
    extrudeOffsetFromDrag(startX: number, startY: number, curX: number, curY: number): any;
    /** Implemented by sceneSelection.js */
    faceIndexFromHit(hit: any): any;
    /** Implemented by sceneSelection.js */
    findClosestEdge(ndcX: number, ndcY: number, threshold?: number): any;
    /** Implemented by sceneSelection.js */
    findClosestVertex(ndcX: number, ndcY: number, threshold?: number): any;
    /** Implemented by sceneSelection.js */
    findMeshIdByObject(object: import('three').Object3D): number | null;
    /** Implemented by sceneDrawFace.js */
    finishDrawFaceStroke(x: number, y: number): any;
    /** Implemented by sceneLights.js */
    finishSceneLightGesture(): any;
    /** Implemented by sceneLights.js */
    finishSceneLightMouse(): any;
    /** Implemented by sceneDrawFace.js */
    getDrawPlane(): any;
    /** Implemented by sceneSelection.js */
    getGroupCenter(): import('three').Vector3 | null;
    /** Implemented by sceneLights.js */
    getLightingState(): unknown[];
    /** Implemented by sceneUndo.js */
    getObjectTransform(meshId: number): any;
    /** Implemented by sceneLights.js */
    getSelectedSceneLight(): SceneLightRecord | null;
    /** Implemented by sceneUndo.js */
    getSelectionTransform(meshId: number): any;
    /** Implemented by sceneAddVertex.js */
    handleAddVertexTap(clientX: number, clientY: number): any;
    /** Implemented by sceneCut.js */
    handleCutTap(clientX: number, clientY: number): any;
    /** Implemented by sceneUndo.js */
    hasLockedObjects(): any;
    /** Implemented by sceneSelection.js */
    isGroupMode(): boolean;
    /** Implemented by sceneMouse.js */
    isMouseOverSelection(x: number, y: number): any;
    /** Implemented by sceneSelection.js */
    isPointNearSelection(clientX: number, clientY: number, buffer?: any): any;
    /** Implemented by sceneLights.js */
    isPointOverSelectedSceneLight(x: number, y: number): any;
    /** Implemented by sceneSelection.js */
    isPointOverSelection(clientX: number, clientY: number): any;
    /** Implemented by sceneSelection.js */
    isWorldPointVisible(point: any): any;
    /** Implemented by sceneUndo.js */
    lockSelection(): void;
    /** Implemented by sceneMeasure.js */
    measureTap(clientX: number, clientY: number): any;
    /** Implemented by sceneGestures.js */
    moveSculptStroke(x: number, y: number): any;
    /** Implemented by sceneCut.js */
    notifyCut(): any;
    /** Implemented by sceneMouse.js */
    onMouseDown(e: any): any;
    /** Implemented by sceneMouse.js */
    onMouseMove(e: any): any;
    /** Implemented by sceneMouse.js */
    onMouseUp(e: any): any;
    /** Implemented by sceneMouse.js */
    onMouseWheel(e: any): any;
    /** Implemented by sceneGestures.js */
    onPointerDown(e: any): any;
    /** Implemented by sceneGestures.js */
    onPointerMove(e: any): any;
    /** Implemented by sceneGestures.js */
    onPointerUp(e: any): any;
    /** Implemented by sceneLights.js */
    pickSceneLight(x: number, y: number): any;
    /** Implemented by sceneUndo.js */
    pushUndo(): void;
    /** Implemented by sceneUndo.js */
    pushUndoSnapshot(snapshot: SceneSnapshot): void;
    /** Implemented by sceneRadialArray.js */
    radialArraySelectPreview(): any;
    /** Implemented by sceneSelection.js */
    raycastMeshes(ndcX: number, ndcY: number): import('three').Intersection[];
    /** Implemented by sceneRadialArray.js */
    recordRadialArrayPreviewAffine(change: any): any;
    /** Implemented by sceneRadialArray.js */
    recordRadialArrayPreviewScale(factors: any, center: any): any;
    /** Implemented by sceneUndo.js */
    redo(): any;
    /** Implemented by focusRenderBoost.js */
    refreshFocusRenderBoost(): any;
    /** Implemented by sceneReflections.js */
    refreshReflectionEnvMaps(): any;
    /** Implemented by sceneCut.js */
    removeLastCutPoint(): any;
    /** Implemented by sceneLights.js */
    resetSceneLights(saved?: unknown): void;
    /** Implemented by sceneTexture.js */
    resetSurfaceAppearance(): any;
    /** Implemented by sceneLights.js */
    restoreSceneLights(saved: any, selectedId: any): any;
    /** Implemented by sceneUndo.js */
    restoreSnapshot(snapshot: SceneSnapshot): void;
    /** Implemented by sceneLights.js */
    rotateSelectedSceneLight(angle: number): any;
    /** Implemented by sceneGestures.js */
    scheduleCameraTwoFinger(): any;
    /** Implemented by sceneSelection.js */
    screenToNDC(clientX: number, clientY: number): { x: number; y: number };
    /** Implemented by sceneSelection.js */
    selectAtPointAdd(clientX: number, clientY: number): any;
    /** Implemented by sceneSelection.js */
    selectAtScreenPoint(clientX: number, clientY: number): any;
    /** Implemented by sceneSelection.js */
    selectInMarquee(screenRect: any): any;
    /** Implemented by sceneLights.js */
    selectSceneLight(id: string): any;
    /** Implemented by sceneUndo.js */
    selectionChanged(before: any): any;
    /** Implemented by sceneLights.js */
    serializeSceneLights(): unknown[];
    /** Implemented by sceneAddVertex.js */
    setAddVertexCenterSnap(enabled: boolean): any;
    /** Implemented by sceneCut.js */
    setCutCenterSnap(enabled: boolean): any;
    /** Implemented by sceneCut.js */
    setCutPathMode(mode: string): any;
    /** Implemented by sceneDrawFace.js */
    setDrawAlign(enabled: boolean): any;
    /** Implemented by sceneCut.js */
    setDrawCutSnap(enabled: boolean): any;
    /** Implemented by sceneDrawFace.js */
    setDrawGridEnabled(enabled: boolean): any;
    /** Implemented by sceneDrawFace.js */
    setDrawPlaneAxis(axis: string): any;
    /** Implemented by sceneDrawFace.js */
    setDrawStraighten(enabled: boolean): any;
    /** Implemented by focusRenderBoost.js */
    setFocusRenderBoost(enabled: boolean): any;
    /** Implemented by sceneLights.js */
    setLightingEdit(active: boolean): any;
    /** Implemented by sceneMeasure.js */
    setMeasureMode(active: boolean): any;
    /** Implemented by sceneUndo.js */
    setObjectTransformLive(meshId: number, transform: { position?: import('three').Vector3; rotation?: import('three').Euler; scale?: import('three').Vector3 }): void;
    /** Implemented by sceneReflections.js */
    setReflection(meshId: number, cfg: any): any;
    /** Implemented by sceneReflections.js */
    setReflectionEnvironment(envId: any): any;
    /** Implemented by sceneSelection.js */
    setSelection(selection: SceneSelection): void;
    /** Implemented by sceneSelection.js */
    setSelectionMode(mode: string): void;
    /** Implemented by sceneUndo.js */
    setSelectionPositionLive(position: any): any;
    /** Implemented by sceneTexture.js */
    setTextureMirror(meshId: number, on: boolean): any;
    /** Implemented by sceneTexture.js */
    setTextureRotation(meshId: number, rad: number): any;
    /** Implemented by sceneTexture.js */
    setTextureScale(meshId: number, scale: any): any;
    /** Implemented by sceneTexture.js */
    setUVMode(mode: string): any;
    /** Implemented by sceneGestures.js */
    setupEvents(): void;
    /** Implemented by sceneMouse.js */
    setupMouseEvents(): void;
    /** Implemented by sceneSelection.js */
    toggleObjectAtScreenPoint(clientX: number, clientY: number): any;
    /** Implemented by sceneSelection.js */
    toggleSelectionAtScreenPoint(clientX: number, clientY: number): any;
    /** Implemented by sceneLights.js */
    translateSelectedSceneLight(delta: any): any;
    /** Implemented by sceneUndo.js */
    undo(): any;
    /** Implemented by sceneUndo.js */
    unlockAll(): any;
    /** Implemented by sceneCut.js */
    updateCutPreview(): any;
    /** Implemented by sceneExtrude.js */
    updateExtrudeFree(worldDelta: any): any;
    /** Implemented by sceneExtrude.js */
    updateExtrudeHeight(offset: number): any;
    /** Implemented by sceneGestures.js */
    updateMarquee(): any;
    /** Implemented by sceneRadialArray.js */
    updateRadialArray(options?: { count?: number; axis?: 'x' | 'y' | 'z'; follow?: boolean; radius?: number }): void;
    /** Implemented by sceneReflections.js */
    updateReflections(): any;
    /** Implemented by sceneLights.js */
    updateSceneLightGesture(e: any): any;
    /** Implemented by sceneLights.js */
    updateSceneLightGizmos(): any;
    /** Implemented by sceneLights.js */
    updateSceneLightMouse(e: any): any;
    /** Implemented by sceneLights.js */
    updateSelectedSceneLight(patch: any, recordUndo?: boolean): any;
  }
}
