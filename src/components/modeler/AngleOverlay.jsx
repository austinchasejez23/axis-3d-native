import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

// Angle finder: when active and an edge is selected, show that edge's angle
// from world vertical (0deg = vertical, 90deg = horizontal) as a floating
// label at the edge midpoint.
export default function AngleOverlay({ managerRef, enabled }) {
  const [label, setLabel] = useState(null);
  const raf = useRef(0);
  const lastKey = useRef('');
  const labelRef = useRef(null);
  labelRef.current = label;

  useEffect(() => {
    if (!enabled) { setLabel(null); lastKey.current = ''; return; }
    const tick = () => {
      const mgr = managerRef.current;
      if (mgr) {
        const sel = mgr.selection;
        let next = null;
        if (sel && sel.type === 'edge' && sel.indices.length > 0) {
          const mesh = mgr.getMesh(sel.meshId);
          const edges = mesh?.getEdges();
          const e = edges?.[sel.indices[sel.indices.length - 1]];
          if (mesh && e) {
            const va = mesh.getVertex(e.v1);
            const vb = mesh.getVertex(e.v2);
            const wm = mgr.getWorldMatrix(mesh);
            const wa = new THREE.Vector3(va.x, va.y, va.z).applyMatrix4(wm);
            const wb = new THREE.Vector3(vb.x, vb.y, vb.z).applyMatrix4(wm);
            const dir = wb.clone().sub(wa).normalize();
            const ang = Math.acos(Math.min(1, Math.max(0, Math.abs(dir.y)))) * 180 / Math.PI;
            const mid = wa.clone().add(wb).multiplyScalar(0.5);
            const sp = mid.clone().project(mgr.camera);
            const rect = mgr.renderer.domElement.getBoundingClientRect();
            const x = (sp.x * 0.5 + 0.5) * rect.width;
            const y = (-sp.y * 0.5 + 0.5) * rect.height;
            const text = `${Math.round(ang * 10) / 10}\u00B0`;
            const key = `${text}|${Math.round(x)}|${Math.round(y)}`;
            if (key !== lastKey.current) {
              lastKey.current = key;
              setLabel({ x, y, text });
            }
            next = labelRef.current;
          }
        }
        if (!next && labelRef.current) setLabel(null);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [enabled]);

  if (!enabled || !label) return null;
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <span
        className="absolute font-mono text-[13px] font-bold"
        style={{
          left: label.x,
          top: label.y,
          transform: 'translate(-50%, -150%)',
          color: '#ffffff',
          textShadow: '1px 1px 1px #000, -1px -1px 1px #000, 1px -1px 1px #000, -1px 1px 1px #000, 0 0 5px #000, 0 0 8px rgba(0,0,0,0.9)',
        }}
      >
        {label.text}
      </span>
    </div>
  );
}