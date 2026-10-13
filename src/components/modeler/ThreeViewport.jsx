import { useEffect, useRef, useState, forwardRef } from 'react';
import { SceneManager } from '@/lib/SceneManager';
import GraphicsDiagnostics from './GraphicsDiagnostics';
import { collectGlDiagnostics } from '@/lib/glDiagnostics';

const ThreeViewport = forwardRef(({ onStatsChange, onTriangleCountChange, onHudChange, onMarqueeChange, onSelectionChange, onBeforeSelectionTap, onSelectionTap, onMultiSelectChange, onDrawChange, onLockChange, onSelectionModeChange, onCutChange, onAddVertexChange, onEmptyTap, onGraphicsError, onPrecisionPoint, onLightsChange, onReady }, ref) => {
  const containerRef = useRef();
  const managerRef = useRef();
  const recoveryRef = useRef(null);
  const restartTimerRef = useRef(null);
  const cbRef = useRef({});
  const [diagnostics, setDiagnostics] = useState(null);
  const [rendererGeneration, setRendererGeneration] = useState(0);
  cbRef.current = { onStatsChange, onTriangleCountChange, onHudChange, onMarqueeChange, onSelectionChange, onBeforeSelectionTap, onSelectionTap, onMultiSelectChange, onDrawChange, onLockChange, onSelectionModeChange, onCutChange, onAddVertexChange, onEmptyTap, onGraphicsError, onPrecisionPoint, onLightsChange, onReady };

  useEffect(() => {
    let manager;
    try {
      manager = new SceneManager(containerRef.current, {
        onStatsChange: (v) => cbRef.current.onStatsChange?.(v),
        onTriangleCountChange: (v) => cbRef.current.onTriangleCountChange?.(v),
        onHudChange: (v) => cbRef.current.onHudChange?.(v),
        onMarqueeChange: (v) => cbRef.current.onMarqueeChange?.(v),
        onSelectionChange: (v) => cbRef.current.onSelectionChange?.(v),
        onBeforeSelectionTap: (v) => cbRef.current.onBeforeSelectionTap?.(v),
        onSelectionTap: (v) => cbRef.current.onSelectionTap?.(v),
        onMultiSelectChange: (v) => cbRef.current.onMultiSelectChange?.(v),
        onDrawChange: (v) => cbRef.current.onDrawChange?.(v),
        onLockChange: () => cbRef.current.onLockChange?.(),
        onSelectionModeChange: (m) => cbRef.current.onSelectionModeChange?.(m),
        onCutChange: (v) => cbRef.current.onCutChange?.(v),
        onAddVertexChange: (v) => cbRef.current.onAddVertexChange?.(v),
        onEmptyTap: () => cbRef.current.onEmptyTap?.(),
        onGraphicsError: (v) => cbRef.current.onGraphicsError?.(v),
        onPrecisionPoint: (v) => cbRef.current.onPrecisionPoint?.(v),
        onLightsChange: (v) => cbRef.current.onLightsChange?.(v),
        onContextLost: () => {
          recoveryRef.current = manager?.serialize();
          clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => setRendererGeneration((v) => v + 1), 250);
        },
      });
    } catch (err) {
      // WebGL never came up on this device: report the exact hardware/driver
      // details instead of leaving a silent black screen.
      setDiagnostics(collectGlDiagnostics(err));
      return;
    }
    managerRef.current = manager;
    if (ref) ref.current = manager;
    cbRef.current.onGraphicsError?.(null);
    // Restore a populated scene after graphics recovery. A context can fail
    // during the constructor before startup adds its cube; that produces an
    // empty recovery snapshot, which must never erase the new startup scene.
    const recovery = recoveryRef.current;
    recoveryRef.current = null;
    if (recovery?.meshes?.length > 0) {
      manager.loadProject(recovery);
      manager.frameScene();
    } else {
      cbRef.current.onReady?.(manager);
    }
    // Some mobile WebViews report provisional dimensions during construction.
    // Resize and re-frame only after the viewport has its final first-frame size.
    const raf = requestAnimationFrame(() => {
      manager.handleResize();
      manager.frameScene();
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(restartTimerRef.current);
      manager.dispose();
      if (ref) ref.current = null;
    };
  }, [ref, rendererGeneration]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 touch-none" />
      <GraphicsDiagnostics lines={diagnostics} />
    </>
  );
});

ThreeViewport.displayName = 'ThreeViewport';
export default ThreeViewport;