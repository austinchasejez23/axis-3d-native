import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':process.cwd()+'/src'}},server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]},appType:'custom',logLevel:'silent'});
try {
const { EditableMesh }=await server.ssrLoadModule('/src/lib/EditableMesh.js');
const {localBoolean,lastSkipReason}=await server.ssrLoadModule('/src/lib/booleanLocal.js');
const {closedTopologyProblem}=await server.ssrLoadModule('/src/lib/booleanTopology.js');
const mgr={getWorldMatrix(m){return new THREE.Matrix4().compose(m.position,new THREE.Quaternion().setFromEuler(m.rotation),m.scale)}};
function volume(m){const p=new Map(m.vertices.map(v=>[v.id,new THREE.Vector3(v.x,v.y,v.z).applyMatrix4(mgr.getWorldMatrix(m))]));let sum=0;for(const f of m.faces)for(let j=1;j<f.length-1;j++)sum+=p.get(f[0]).dot(new THREE.Vector3().crossVectors(p.get(f[j]),p.get(f[j+1])))/6;return Math.abs(sum)}
function stats(m){const adjacency=new Map();for(const f of m.faces)for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length],k=a<b?a+','+b:b+','+a;adjacency.set(k,(adjacency.get(k)||0)+1)}let open=0,multi=0;for(const n of adjacency.values()){if(n===1)open++;if(n>2)multi++;}
const geo=m.toBufferGeometry();let flipped=0,deg=0;const points=geo.getAttribute('position'),normals=geo.getAttribute('normal');for(let i=0;i<points.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(points,i),b=new THREE.Vector3().fromBufferAttribute(points,i+1),c=new THREE.Vector3().fromBufferAttribute(points,i+2);const cross=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));if(cross.lengthSq()<1e-18)deg++;else{const n=new THREE.Vector3().fromBufferAttribute(normals,i);if(cross.dot(n)<-1e-9)flipped++;}}geo.dispose();return {faces:m.faces.length,vertices:m.vertices.length,open,multi,deg,flipped,volume:volume(m),hidden:m.hiddenEdges.length,visible:m.visibleEdges.length,topology:closedTopologyProblem(m)}}

function missedCutterRimConnections(mesh,tool,z) {
  const verts=new Map(mesh.vertices.map(v=>[v.id,v]));
  const outline=[];
  for(const v of tool.vertices) if(Math.abs(v.y-1.2)<1e-5 &&
    !outline.some(p=>Math.hypot(p.x-v.x,p.z-v.z)<1e-8))
    outline.push({x:v.x+.1,z:v.z+z});
  outline.sort((a,b)=>Math.atan2(a.z-z,a.x-.1)-Math.atan2(b.z-z,b.x-.1));
  const rimDistance=p=>{
    let min=Infinity;
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
      min=Math.min(min,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz));
    }
    return min;
  };
  const visible=mesh.getEdges(),unjoined=[];
  for(const e of visible) {
    const a=verts.get(e.v1),b=verts.get(e.v2);
    if(Math.abs(a.y-.5)>1e-5||Math.abs(b.y-.5)>1e-5)continue;
    const da=rimDistance(a),db=rimDistance(b);
    if(Math.max(da,db)<.4||Math.min(da,db)>.2)continue;
    const stub=da<db?e.v1:e.v2,p=verts.get(stub),distance=Math.min(da,db);
    if(distance<.012)continue;
    const joined=visible.some(edge=>{
      if(edge.v1!==stub&&edge.v2!==stub)return false;
      const other=verts.get(edge.v1===stub?edge.v2:edge.v1);
      return Math.abs(other.y-.5)<1e-5 && rimDistance(other)<.0003 &&
        Math.hypot(other.x-p.x,other.z-p.z)<.27;
    });
    if(!joined)unjoined.push(stub);
  }
  return [...new Set(unjoined)];
}

for(const z of [0,0.5,0.65,0.75,1,1.15]){
for(const y of [-.3,.3,.65,.9,1.2]){
const base=EditableMesh.fromGeometry(new THREE.BoxGeometry(6,1,2,6,1,2),'base');
const tool=EditableMesh.fromGeometry(new THREE.CylinderGeometry(.62,.62,2.4,12),'tool');tool.position.set(.1,y,z);
const before=volume(base);
const result=base.clone();let ok=false,error='';try{ok=localBoolean(mgr,result,tool,'subtract')}catch(e){error=e.stack||String(e)}
const s=stats(result);
if (s.flipped) {
  let renderTriangleIndex = 0;
  for (let fi = 0; fi < result.faces.length; fi++) {
    const face = result.faces[fi];
    const normal = result.getFaceNormal(fi);
    for (const tri of result.getFaceTriangleIndices(fi)) {
      const points = tri.map(vi => result.getVertex(face[vi]));
      const a = new THREE.Vector3(Math.fround(points[0].x), Math.fround(points[0].y), Math.fround(points[0].z));
      const b = new THREE.Vector3(Math.fround(points[1].x), Math.fround(points[1].y), Math.fround(points[1].z));
      const cc = new THREE.Vector3(Math.fround(points[2].x), Math.fround(points[2].y), Math.fround(points[2].z));
      const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a));
      if (cross.lengthSq() >= 1e-18 && cross.dot(normal) < -1e-9) {
        console.log('FLIPPED_TRIANGLE', JSON.stringify({
          z, y, fi, renderTriangleIndex, face, tri,
          normal: normal.toArray(), cross: cross.toArray(),
          points: points.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
          boundary: face.map(id => result.getVertex(id)),
        }));
      }
      renderTriangleIndex++;
    }
  }
}
if (s.deg) {
  // Diagnostic only: preserve the failing assertion and identify the original
  // editable face producing each zero-area rendered triangle.
  let renderTriangleIndex = 0;
  for (let fi = 0; fi < result.faces.length; fi++) {
    const face = result.faces[fi];
    for (const tri of result.getFaceTriangleIndices(fi)) {
      const points = tri.map(vi => result.getVertex(face[vi]));
      const a = new THREE.Vector3(points[0].x, points[0].y, points[0].z);
      const b = new THREE.Vector3(points[1].x, points[1].y, points[1].z);
      const cc = new THREE.Vector3(points[2].x, points[2].y, points[2].z);
      const areaSquared = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a)).lengthSq();
      if (areaSquared < 1e-18) {
        console.log('DEGENERATE_TRIANGLE', JSON.stringify({
          z, y, fi, renderTriangleIndex, face, tri,
          points: points.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
          boundary: face.map(id => result.getVertex(id)),
          areaSquared
        }));
      }
      renderTriangleIndex++;
    }
  }
}
const vm=new Map(result.vertices.map(v=>[v.id,v]));let longOblique=0;
for(const e of result.getEdges()){const a=vm.get(e.v1),b=vm.get(e.v2);if(Math.abs(a.y-.5)>1e-5||Math.abs(b.y-.5)>1e-5)continue;
const dx=Math.abs(a.x-b.x),dz=Math.abs(a.z-b.z);if(dx>.2&&dz>.2&&Math.hypot(dx,dz)>1.1){longOblique++;if(process.env.AXIS_BOOLEAN_DEBUG&&z===1.15&&y===.3){let efaces=[];result.faces.forEach((f,fi)=>{for(let j=0;j<f.length;j++)if((f[j]===e.v1&&f[(j+1)%f.length]===e.v2)||(f[j]===e.v2&&f[(j+1)%f.length]===e.v1))efaces.push({fi,face:f.map(id=>[id,vm.get(id)?.x,vm.get(id)?.y,vm.get(id)?.z])});});console.log('LONG_OBLIQUE',e.v1,e.v2,a,b,JSON.stringify(efaces));}}
}
const bottom=y-1.2;let floorSpokes=0;
for(const e of result.getEdges()){const a=vm.get(e.v1),b=vm.get(e.v2);if(Math.abs(a.y-bottom)>1e-5||Math.abs(b.y-bottom)>1e-5)continue;
const ra=Math.hypot(a.x-.1,a.z-z),rb=Math.hypot(b.x-.1,b.z-z);
if((ra<1e-5&&rb>.1)||(rb<1e-5&&ra>.1))floorSpokes++;
}
console.log(JSON.stringify({z,y,ok,error,skip:lastSkipReason,...s,delta:before-s.volume,longOblique,floorSpokes}));
assert.ok(ok,`Edge-cut failed at z=${z}, y=${y}: ${error || lastSkipReason}`);
assert.equal(s.topology,null,`Disconnected topology at z=${z}, y=${y}`);
assert.equal(s.deg,0,`Degenerate render triangles at z=${z}, y=${y}`);
assert.equal(s.flipped,0,`Reversed render triangles at z=${z}, y=${y}`);
assert.ok(s.volume<before,`No material removed at z=${z}, y=${y}`);
if (z>=.5) assert.equal(longOblique,0,`Unnecessary long diagonal at z=${z}, y=${y}`);
// The cutter rim and base line must be directly connected with editable
// edges, rather than just occupying the same flat face with a small gap.
if ((z===.5 || z===.65) && y===-.3)
  assert.deepEqual(missedCutterRimConnections(result,tool,z),[],
    `Base grid vertices remain disconnected from cutter rim at z=${z}`);
if (y===.9) assert.equal(floorSpokes,0,`Cutter cap fan remains at z=${z}, y=${y}`);
}
}
// Joined-base regression: cutter crosses a seam between two rectangular arms.
const armA=EditableMesh.fromGeometry(new THREE.BoxGeometry(5,1,1.6,5,1,2),'armA');
const armB=EditableMesh.fromGeometry(new THREE.BoxGeometry(1.6,1,5,2,1,5),'armB');
const joined=armA.clone();
assert.ok(localBoolean(mgr,joined,armB,'union'),'Joined base union failed');
assert.equal(stats(joined).topology,null,'Joined base is not closed');
for (const [x,z] of [[0,0],[.5,.55],[.7,.7]]) {
  const tool=EditableMesh.fromGeometry(new THREE.CylinderGeometry(.6,.6,2.4,12),'tool');
  tool.position.set(x,.9,z);
  const work=joined.clone();
  const ok=localBoolean(mgr,work,tool,'subtract');
  const s=stats(work);
  console.log(JSON.stringify({scenario:'joined-cross-cut',x,z,ok,...s}));
  assert.ok(ok && !s.topology, 'Joined base Boolean is invalid');
  assert.equal(s.flipped,0,'Joined base has reversed render triangles');
  assert.equal(s.deg,0,'Joined base has degenerate render triangles');
}
}finally{await server.close()}
