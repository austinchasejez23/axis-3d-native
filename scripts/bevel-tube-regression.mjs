// Bevel across a bent tube: the default bevel keeps the tube's cross-section,
// and Sweep never folds back over a loop close to the bend (cut loops near a
// bend used to open holes and fold faces through the tube).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
const server = await createServer({ configFile:false, root:process.cwd(), resolve:{alias:{'@':process.cwd()+'/src'}}, server:{middlewareMode:true,hmr:false}, optimizeDeps:{noDiscovery:true,entries:[]}, appType:'custom', logLevel:'silent' });
globalThis.window = { self:{}, top:{} };
const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
const { bevelLoopEdges } = await server.ssrLoadModule('/src/lib/bevelLoop.js');
const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');
let SIDES = 40, R = 0.75, ANG = 40*Math.PI/180, NEAR_D = 0, TRI = false;
function makeTube(){
  const m = new EditableMesh('tube'); let id = 500000;
  const dA = new THREE.Vector3(0,1,0), dB = new THREE.Vector3(Math.sin(ANG),Math.cos(ANG),0);
  const u = new THREE.Vector3(0,0,1), wA = new THREE.Vector3().crossVectors(dA,u);
  const mN = dA.clone().add(dB).normalize();
  const NEAR = NEAR_D;
  // stations: list of [axisPoint, axisDir] ; rings projected along leg dirs
  const ringsPts = [];
  const base = []; for (let k=0;k<SIDES;k++){ const t=2*Math.PI*k/SIDES; base.push(u.clone().multiplyScalar(R*Math.cos(t)).addScaledVector(wA,R*Math.sin(t))); }
  const miter = base.map(o=>{ const p0=new THREE.Vector3(0,-8,0).add(o); const lam=-(p0.dot(mN))/dA.dot(mN); return p0.addScaledVector(dA,lam); });
  const along = (pts,dir,center)=>pts.map(p=>p.clone().addScaledVector(dir,(center.clone().sub(p)).dot(dir)));
  ringsPts.push(along(miter,dA,new THREE.Vector3(0,-8,0)));
  if (NEAR) ringsPts.push(along(miter,dA,new THREE.Vector3(0,-NEAR,0)));
  ringsPts.push(miter); const L = ringsPts.length-1;
  if (NEAR) ringsPts.push(along(miter,dB,dB.clone().multiplyScalar(NEAR)));
  ringsPts.push(along(miter,dB,dB.clone().multiplyScalar(8)));
  const rings = ringsPts.map(pts=>pts.map(p=>{ const v={id:id++,x:p.x,y:p.y,z:p.z}; m.vertices.push(v); return v.id; }));
  for (let r=0;r<rings.length-1;r++) for (let k=0;k<SIDES;k++){ const k2=(k+1)%SIDES; if(TRI){ m.faces.push([rings[r][k],rings[r][k2],rings[r+1][k2]]); m.faces.push([rings[r][k],rings[r+1][k2],rings[r+1][k]]);} else m.faces.push([rings[r][k],rings[r][k2],rings[r+1][k2],rings[r+1][k]]); }
  m.faces.push([...rings[0]].reverse()); m.faces.push([...rings[rings.length-1]]);
  m.invalidateCache?.(); return { m, loop: rings[L] };
}
function run(label, opts){
  const { m, loop } = makeTube(); const set = new Set(loop);
  const edges = m.getEdges(); const idx = edges.map((e,i)=> set.has(e.v1)&&set.has(e.v2)?i:-1).filter(i=>i>=0);
  const sm = { selection:{meshId:m.id,type:'edge',indices:idx}, meshes:[m], getMesh(){return m;}, setSelection(s){this.selection=s;}, clearSelection(){this.selection={meshId:null,type:'object',indices:[]};}, rebuildThreeMesh(){}, updateStats(){}, pushUndo(){} };
  const before = new Set(m.vertices.map(v=>v.id));
  bevelLoopEdges(sm, opts);
  const nv = m.vertices.filter(v=>!before.has(v.id));
  const segs = opts.segments; const ringsN = segs+1; // vertices pushed per loop vertex: segs+1 consecutive
  const byRing = Array.from({length:ringsN},()=>[]); nv.forEach((v,i)=>byRing[i%ringsN].push(v));
  const out = byRing.map(rv=>{ const c=new THREE.Vector3(); rv.forEach(v=>c.add(new THREE.Vector3(v.x,v.y,v.z))); c.divideScalar(rv.length);
    const ds=rv.map(v=>new THREE.Vector3(v.x,v.y,v.z).distanceTo(c)); return `${Math.min(...ds).toFixed(2)}-${Math.max(...ds).toFixed(2)}`; });
  const ec=new Map(); for(const f of m.faces) for(let j=0;j<f.length;j++){const k=edgeKey(f[j],f[(j+1)%f.length]); ec.set(k,(ec.get(k)||0)+1);}
  let open=0, nonman=0; for(const c of ec.values()){ if(c===1) open++; if(c>2) nonman++; }
  const V=(id)=>{const v=m.getVertex(id);return new THREE.Vector3(v.x,v.y,v.z);};
  const dB2=new THREE.Vector3(Math.sin(ANG),Math.cos(ANG),0);
  const axisPt=(p)=>{ const a=new THREE.Vector3(0,Math.min(p.y,0),0); const tB=Math.max(0,p.dot(dB2)); const b=dB2.clone().multiplyScalar(tB); return p.distanceTo(a)<p.distanceTo(b)?a:b; };
  const fn=(f)=>{const ps=f.map(V);const n=new THREE.Vector3();for(let j=0;j<ps.length;j++){const a=ps[j],b=ps[(j+1)%ps.length];n.x+=(a.y-b.y)*(a.z+b.z);n.y+=(a.z-b.z)*(a.x+b.x);n.z+=(a.x-b.x)*(a.y+b.y);}return n.lengthSq()>1e-16?n.normalize():null;};
  const em=new Map(); m.faces.forEach((f,fi)=>{for(let j=0;j<f.length;j++){const k=edgeKey(f[j],f[(j+1)%f.length]); if(!em.has(k)) em.set(k,[]); em.get(k).push(fi);}});
  const norms=m.faces.map(fn); let inward=0; for(const fs of em.values()){ if(fs.length!==2) continue; const a=norms[fs[0]],b=norms[fs[1]]; if(a&&b&&a.dot(b)<-0.3) inward++; }
  const midRing = byRing[Math.floor(byRing.length / 2)]; const mid = new THREE.Vector3(); midRing.forEach(v => mid.add(new THREE.Vector3(v.x, v.y, v.z))); mid.divideScalar(midRing.length);
  return { mid, folds: inward, open, nonman, radii: byRing.map(rv=>{ const c=new THREE.Vector3(); rv.forEach(v=>c.add(new THREE.Vector3(v.x,v.y,v.z))); c.divideScalar(rv.length); const ds=rv.map(v=>new THREE.Vector3(v.x,v.y,v.z).distanceTo(c)); return [Math.min(...ds), Math.max(...ds)]; }) };
}
const cases = [
  { near: 0, tri: false, ang: 40 }, { near: 0.3, tri: false, ang: 40 },
  { near: 0.3, tri: true, ang: 40 }, { near: 0.6, tri: true, ang: 70 },
];
try {
  for (const c of cases) {
    NEAR_D = c.near; TRI = c.tri; ANG = c.ang * Math.PI / 180;
      for (const [label, opts] of [
      ['default', { radius: 1.7, segments: 3, smooth: true, sweep: false }],
      ['sweep r1.7', { radius: 1.7, segments: 3, sweep: true }],
      ['sweep r1', { radius: 1, segments: 3, sweep: true }],
      ['sweep r4', { radius: 4, segments: 7, sweep: true }],
    ]) {
      const res = run(label, opts);
      const name = `${label} near=${c.near} tri=${c.tri} angle=${c.ang}`;
      assert.equal(res.open, 0, name + ': no holes');
      assert.equal(res.nonman, 0, name + ': manifold');
      assert.equal(res.folds, 0, name + ': no folded faces');
      for (const [lo, hi] of res.radii) {
        assert.ok(lo > R * 0.98, name + ': section not pinched');
        assert.ok(hi < R * 1.02, name + ': section not swollen');
      }
      // Rounded, not just widened: the middle of the bend cuts inside the
      // sharp corner, toward the inside of the turn.
      const legA = new THREE.Vector3(0, -1, 0), legB = new THREE.Vector3(Math.sin(ANG), Math.cos(ANG), 0);
      const inside = legA.clone().add(legB).normalize();
      assert.ok(res.mid.dot(inside) > 0.05, name + ': bend is rounded');
    }
  }
  console.log('Tube bevel keeps its section; Sweep absorbs loops inside the bend without folds.');
} finally {
  await server.close();
}
