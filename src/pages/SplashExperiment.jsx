import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';

// Standalone concept. The active splash is intentionally unchanged.
export default function SplashExperiment() {
  const mount = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020407);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.25, 18);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0x8da4c9, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-3, 6, 9); scene.add(key);
    const rim = new THREE.DirectionalLight(0x288aff, 2.4);
    rim.position.set(5, -2, -3); scene.add(rim);

    const metal = new THREE.MeshStandardMaterial({ color: 0xb9c5d4, metalness: 0.82, roughness: 0.22 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x087eff, metalness: 0.65, roughness: 0.18, emissive: 0x0046c7, emissiveIntensity: 0.4 });
    const parts = [];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const letter = (x) => { const g = new THREE.Group(); g.position.x = x; scene.add(g); return g; };
    const A = letter(-4.05), X = letter(-1.55), I = letter(0.8), S = letter(3.0);
    function beam(group, x1, y1, x2, y2, thickness, start, duration, mode = 'grow', material = metal) {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const mesh = new THREE.Mesh(box, material);
      mesh.rotation.z = -Math.atan2(dx, dy);
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
      group.add(mesh);
      parts.push({ mesh, x1, y1, x2, y2, len, thickness, start, duration, mode, group });
      return mesh;
    }
    // A: primitive stretches into the left leg, a crossbar cuts in,
    // then the right leg extrudes down from the apex.
    beam(A, -0.95, -1.35, 0, 1.4, 0.35, 0.25, 0.95);
    beam(A, 0, 1.4, 0.95, -1.35, 0.35, 1.12, 0.72);
    beam(A, -0.53, -0.22, 0.53, -0.22, 0.27, 1.65, 0.48);
    // X: two independently arriving diagonal beams cross and lock.
    beam(X, -0.94, 1.3, 0.94, -1.3, 0.36, 0.65, 0.85, 'slide');
    beam(X, 0.94, 1.3, -0.94, -1.3, 0.36, 1.25, 0.85, 'slide');
    // I: a block is drawn vertically, then top and bottom caps extrude sideways.
    beam(I, 0, -1.3, 0, 1.3, 0.39, 0.9, 0.9);
    beam(I, -0.64, 1.3, 0.64, 1.3, 0.3, 1.85, 0.42);
    beam(I, -0.64, -1.3, 0.64, -1.3, 0.3, 2.03, 0.42);
    // S: short box primitives progressively form a continuous angular S.
    const sPoints = [[0.88,1.22],[-0.66,1.22],[-0.9,0.96],[-0.83,0.24],[-0.52,0.02],[0.62,-0.2],[0.87,-0.49],[0.8,-1.02],[0.55,-1.28],[-0.9,-1.28]];
    for (let i = 0; i < sPoints.length - 1; i++) {
      beam(S, ...sPoints[i], ...sPoints[i+1], 0.32, 0.9 + i * 0.16, 0.34);
    }

    // Blue twin arrowheads sweep into position behind the finished letters.
    const arrows = new THREE.Group();
    arrows.position.z = -0.35;
    scene.add(arrows);
    const arrowParts = [];
    function arrowSegment(x1,y1,x2,y2) {
      const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
      const m=new THREE.Mesh(box,blue);
      m.position.set((x1+x2)/2,(y1+y2)/2,0);
      m.rotation.z=-Math.atan2(dx,dy);
      m.scale.set(0.24,len,0.19);
      arrows.add(m);arrowParts.push(m);
    }
    // Two long directional chevrons, kept behind the lettering.
    for (const offset of [-0.45,0.5]) {
      arrowSegment(-5.65+offset,0.35,-4.9+offset,1.14);
      arrowSegment(-4.9+offset,1.14,-5.65+offset,1.9);
      arrowSegment(-5.6+offset,1.14,5.65+offset,1.14);
    }
    arrows.position.x = -15;
    arrows.visible = false;

    const clamp = (x) => Math.max(0, Math.min(1, x));
    const ease = (x) => 1 - Math.pow(1-clamp(x), 3);
    const startTime = performance.now();
    let frame = 0;
    let done = false;
    function resize() {
      const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w/h;
      // Fit the entire word comfortably on narrow phone screens.
      camera.position.z = Math.max(18, 11 / (Math.tan(THREE.MathUtils.degToRad(17.5)) * camera.aspect));
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);resize();
    function tick(now) {
      const t = (now-startTime)/1000;
      for (const p of parts) {
        const progress = ease((t-p.start)/p.duration);
        const {mesh, len, thickness} = p;
        mesh.visible = progress > 0;
        mesh.scale.set(thickness, Math.max(0.001,len*progress),0.34);
        if (p.mode === 'slide') {
          mesh.position.x = (p.x1+p.x2)/2 + (1-progress)*(p.x1 < 0 ? -1.6 : 1.6);
          mesh.rotation.y = (1-progress)*0.65;
        } else {
          mesh.position.set(p.x1+(p.x2-p.x1)*progress/2,p.y1+(p.y2-p.y1)*progress/2,0);
        }
      }
      // Reveal arrows only once the modeling operations have finished.
      if (t > 3.05) {
        arrows.visible = true;
        const p = ease((t-3.05)/0.9);
        arrows.position.x = -15*(1-p);
        blue.emissiveIntensity = 0.35 + 0.55*Math.sin(p*Math.PI);
      }
      // Hold on the completed logo, then return to Library.
      if (t > 5.65 && !done) { done = true; navigate('/library', { replace: true, state: { fromSplash: true } }); }
      renderer.render(scene,camera);
      if (!done) frame = requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);observer.disconnect();
      scene.traverse(o => { if (o.isMesh && o.geometry !== box) o.geometry.dispose(); });
      box.dispose();metal.dispose();blue.dispose();renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [navigate]);
  return <div ref={mount} className="fixed inset-0 overflow-hidden bg-black" aria-label="Experimental AXIS 3D logo construction animation" />;
}
