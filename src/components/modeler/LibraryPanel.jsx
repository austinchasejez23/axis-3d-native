import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { ChevronLeft, Plus, Trash2, Boxes, Box } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { EditableMesh } from '@/lib/EditableMesh';
import { listCustomLibrary, saveToCustomLibrary, deleteFromCustomLibrary, genCustomId } from '@/lib/customLibrary';
import { toast } from 'sonner';

// Render actual shaded 3D geometry instead of pretending flat SVG paths are models.
function ShapeWireframe({ type, stroke }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    let renderer;
    let geometry;
    let material;
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(3.4, 2.7, 4.4);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x19283c, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 3);
      key.position.set(-3, 6, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x82b9ff, 1.4);
      rim.position.set(4, 2, -5);
      scene.add(rim);
      const radial = 48;
      switch (type) {
        case 'cube': geometry = new THREE.BoxGeometry(1.35, 1.35, 1.35); break;
        case 'plane': geometry = new THREE.PlaneGeometry(1.8, 1.8); geometry.rotateX(-Math.PI / 2); break;
        case 'sphere': geometry = new THREE.SphereGeometry(.83, radial, 32); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(.67, .67, 1.65, radial); break;
        case 'cone': geometry = new THREE.ConeGeometry(.83, 1.8, radial); break;
        case 'pyramid': geometry = new THREE.ConeGeometry(.92, 1.8, 4); geometry.rotateY(Math.PI / 4); break;
        case 'tube': {
          const outer = new THREE.Shape();
          outer.absarc(0, 0, .84, 0, Math.PI * 2, false);
          const hole = new THREE.Path();
          hole.absarc(0, 0, .47, 0, Math.PI * 2, true);
          outer.holes.push(hole);
          geometry = new THREE.ExtrudeGeometry(outer, { depth: 1.25, bevelEnabled: false, curveSegments: radial });
          // The extrusion starts in XY and extends along +Z. Rotate so
          // its front opening faces UP toward the preview camera.
          geometry.rotateX(Math.PI / 2);
          geometry.translate(0, .625, 0);
          break;
        }
        case 'torus': geometry = new THREE.TorusGeometry(.65, .26, 20, 64); geometry.rotateX(-Math.PI / 2.8); break;
        case 'helix': {
          const points = [];
          for (let i = 0; i <= 128; i++) {
            const t = i / 128;
            const angle = t * Math.PI * 4;
            points.push(new THREE.Vector3(.58 * Math.cos(angle), 1.55 * (t - .5), .58 * Math.sin(angle)));
          }
          geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 160, .13, 10, false);
          break;
        }
        default: return;
      }
      material = new THREE.MeshStandardMaterial({ color: new THREE.Color(stroke), metalness: .28, roughness: .32, side: THREE.DoubleSide });
      const object = new THREE.Mesh(geometry, material);
      scene.add(object);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(180, 180);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
      setImage(renderer.domElement.toDataURL('image/png'));
    } catch (error) {
      console.warn('Primitive preview unavailable:', type, error);
    } finally {
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    }
  }, [type, stroke]);
  return image
    ? <img src={image} alt="" draggable={false} className="w-full h-full object-contain" />
    : <div className="w-full h-full" aria-hidden="true" />;
}

export default function LibraryPanel({ open, onClose, onSelectShape, managerRef }) {
  const { uiColor, highlightColor, backgroundColor } = useTheme();
  const [view, setView] = useState('basic');
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (open) setItems(listCustomLibrary());
  }, [open]);

  if (!open) return null;

  const shapes = [
    { type: 'cube', label: 'Cube' },
    { type: 'plane', label: 'Plane' },
    { type: 'sphere', label: 'Sphere' },
    { type: 'cylinder', label: 'Cylinder' },
    { type: 'cone', label: 'Cone' },
    { type: 'pyramid', label: 'Pyramid' },
    { type: 'tube', label: 'Tube' },
    { type: 'torus', label: 'Torus' },
    { type: 'helix', label: 'Helix' },
  ];

  const cardBg = 'rgba(255,255,255,0.05)';
  const borderCol = `${highlightColor}33`;

  const handleAdd = () => {
    const mgr = managerRef?.current;
    const mesh = mgr?.getMesh(mgr.selection.meshId);
    if (!mesh) { toast.error('Select a single object first'); return; }
    if (mesh.vertices.length < 4) { toast.error('Mesh is too simple to save'); return; }
    saveToCustomLibrary({
      id: genCustomId(),
      name: mesh.name || 'Custom',
      mesh: mesh.serialize(),
      verts: mesh.vertices.length,
      createdAt: Date.now(),
    });
    setItems(listCustomLibrary());
    toast.success('Saved to custom library');
  };

  const handleAddCustom = (entry) => {
    const mgr = managerRef?.current;
    if (!mgr) return;
    const m = EditableMesh.deserialize(entry.mesh);
    // A library item supplies geometry only: every newly added object starts
    // with a clean surface and hard normals, independent of the saved source.
    m.resetSurfaceAppearance();
    // Fresh id so re-instantiated copies never collide with an in-scene mesh.
    m.id = Date.now() + Math.floor(Math.random() * 100000);
    mgr.pushUndo?.();
    mgr.addMesh(m);
    mgr.setSelection({ meshId: m.id, type: 'object', indices: [] });
    toast.success(`${entry.name} added`);
    onClose?.();
  };

  const handleDelete = (id) => {
    deleteFromCustomLibrary(id);
    setItems(listCustomLibrary());
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: backgroundColor }}>
      <div className="flex items-center justify-between px-3 pb-3 pt-[calc(max(env(safe-area-inset-top,0px),1.75rem)+0.75rem)] border-b" style={{ borderColor: borderCol }}>
        {view === 'custom' ? (
          <button onClick={() => setView('basic')} className="w-9 h-9 flex items-center justify-center active:scale-95" style={{ color: uiColor }}>
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center active:scale-95" style={{ color: uiColor }}>
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <h2 className="text-base font-bold" style={{ color: uiColor }}>{view === 'custom' ? 'Custom library' : 'Basic shapes'}</h2>
        <button onClick={() => (view === 'custom' ? setView('basic') : onClose())} className="px-3 h-9 rounded-lg border text-sm font-semibold active:scale-95" style={{ color: uiColor, borderColor: borderCol }}>
          Exit
        </button>
      </div>

      {view === 'basic' && (
        <>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-3">
              {shapes.map((shape) => (
                <button
                  key={shape.type}
                  onClick={() => onSelectShape(shape.type)}
                  className="rounded-xl border aspect-square flex flex-col items-center justify-center p-2 active:scale-95 transition-transform"
                  style={{ background: cardBg, borderColor: borderCol }}
                >
                  <div className="flex-1 flex items-center justify-center w-full">
                    <ShapeWireframe type={shape.type} stroke={highlightColor} />
                  </div>
                  <span className="text-xs font-semibold mt-1" style={{ color: uiColor }}>{shape.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4 pt-2 space-y-2 border-t" style={{ borderColor: borderCol }}>
            <button
              onClick={handleAdd}
              className="w-full h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold active:scale-95"
              style={{ borderColor: highlightColor, color: highlightColor, background: `${highlightColor}1a` }}
            >
              <Plus className="w-4 h-4" /> Add to custom library
            </button>
            <button
              onClick={() => { setItems(listCustomLibrary()); setView('custom'); }}
              className="w-full h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold active:scale-95"
              style={{ color: uiColor, borderColor: borderCol }}
            >
              <Boxes className="w-4 h-4" /> Custom library
            </button>
          </div>
        </>
      )}

      {view === 'custom' && (
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <Box className="w-10 h-10" style={{ color: `${uiColor}55` }} />
              <p className="text-sm" style={{ color: `${uiColor}99` }}>No custom models yet</p>
              <p className="text-xs" style={{ color: `${uiColor}66` }}>Tap "Add to custom library" while an object is selected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl border p-2.5" style={{ borderColor: borderCol, background: cardBg }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.05)', color: highlightColor }}>
                    <Box className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: uiColor }}>{entry.name}</p>
                    <p className="text-[11px]" style={{ color: `${uiColor}99` }}>{entry.verts} verts</p>
                  </div>
                  <button onClick={() => handleAddCustom(entry)} className="w-9 h-9 rounded-lg border flex items-center justify-center active:scale-95" style={{ borderColor: highlightColor, color: highlightColor }}>
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="w-9 h-9 rounded-lg border flex items-center justify-center active:scale-95" style={{ borderColor: borderCol, color: '#ff6b6b' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}