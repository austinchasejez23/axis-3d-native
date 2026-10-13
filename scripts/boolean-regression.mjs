import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile:false, root:process.cwd(), resolve:{alias:{'@':process.cwd()+'/src'}}, server:{ middlewareMode:true, hmr:false }, optimizeDeps:{ noDiscovery:true, entries:[] }, appType:'custom', logLevel:'silent' });
try {
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { localBoolean, lastSkipReason } = await server.ssrLoadModule('/src/lib/booleanLocal.js');
  const manager = {getWorldMatrix(mesh){return new THREE.Matrix4().compose(mesh.position, new THREE.Quaternion().setFromEuler(mesh.rotation), mesh.scale);}};
  const volumeOf=(mesh)=>{const coords=new Map(mesh.vertices.map(v=>[v.id,new THREE.Vector3(v.x,v.y,v.z).applyMatrix4(manager.getWorldMatrix(mesh))]));let sum=0;for(const f of mesh.faces){const a=coords.get(f[0]);for(let i=1;i<f.length-1;i++)sum+=a.dot(new THREE.Vector3().crossVectors(coords.get(f[i]),coords.get(f[i+1])))/6;}return Math.abs(sum)};
  const { bridgeContactRing } = await server.ssrLoadModule('/src/lib/booleanRing.js');
  const ringWorld = new Map(), ringOuter = [], ringHole = [];
  for (let i = 0; i < 24; i++) {
    const id = i + 1, a = i * Math.PI * 2 / 24;
    ringOuter.push(id);
    ringWorld.set(id, new THREE.Vector3(3 * Math.cos(a), 0, 3 * Math.sin(a)));
  }
  for (let i = 0; i < 12; i++) {
    const id = 100 + i, a = i * Math.PI * 2 / 12;
    ringHole.push(id);
    ringWorld.set(id, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const directRing = bridgeContactRing(ringOuter, ringHole, ringWorld, (p) => new THREE.Vector2(p.x, p.z));
  console.log(JSON.stringify({name:'direct-annular-bridge',ok:!!directRing,faces:directRing?.faces.length,spokes:directRing?.bridges.size}));
  assert.ok(directRing && directRing.faces.length === 12 && directRing.bridges.size === 12,
    'A simple annulus must build one real face per cutter segment');
  const sparseIds = ringOuter.filter((_, i) => i % 3 === 0);
  let generatedId = 5000;
  const sparseRing = bridgeContactRing(sparseIds, ringHole, ringWorld,
    (p) => new THREE.Vector2(p.x, p.z), (p) => {
      const id = generatedId++;
      ringWorld.set(id, p.clone());
      return id;
    });
  assert.ok(sparseRing && sparseRing.faces.length === 12 && sparseRing.splits.length > 0,
    'A cutter with more rim corners than base vertices must still form a real face strip');
  console.log(JSON.stringify({ name: 'sparse-base-annular-bridge', faces: sparseRing.faces.length,
    spokes: sparseRing.bridges.size, baseEdgeInserts: sparseRing.splits.length }));
  const scenarios = [
    ['through-hole', new THREE.BoxGeometry(6,1,4,1,1,1), new THREE.CylinderGeometry(.65,.65,3,12), [0,0,0]],
    ['offset-hole', new THREE.BoxGeometry(6,1,4,1,1,1), new THREE.CylinderGeometry(.65,.65,3,12), [1.2,0,.3]],
    ['shallow-pocket',new THREE.BoxGeometry(6,1,4,1,1,1),new THREE.CylinderGeometry(.65,.65,1.5,12),[0,.5,0]],
    ['rim-cut',new THREE.BoxGeometry(6,1,4,1,1,1),new THREE.CylinderGeometry(.65,.65,3,12),[0,0,1.8]],
    ['segmented-through-hole',new THREE.BoxGeometry(6,1,4,12,1,8),new THREE.CylinderGeometry(.65,.65,3,16),[0,0,0]],
    ['segmented-edge-cut',new THREE.BoxGeometry(6,1,4,12,1,8),new THREE.CylinderGeometry(.65,.65,3,16),[0,0,1.8]],
    ['dense-segmented-hole',new THREE.BoxGeometry(6,1,4,30,1,20),new THREE.CylinderGeometry(.65,.65,3,32),[0,0,0]],
  ];
  for (const [name,baseGeo,cutterGeo,p] of scenarios) {
    const base = EditableMesh.fromGeometry(baseGeo,'base');
    const cutter = EditableMesh.fromGeometry(cutterGeo,'cutter');
    cutter.position.set(...p);
    const work=base.clone();
    // Historical painted models can carry a baked wireframe that overrides
    // every new Boolean edge unless it is invalidated on geometry changes.
    if (name === 'through-hole') work.paintWireEdges = [{
      v1: base.vertices[0].id, v2: base.vertices[1].id,
    }];
    let ok=false,error='';
    try {ok=localBoolean(manager,work,cutter,'subtract')}catch(e){error=e.stack}
    const counts=new Map();for(const f of work.faces){for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length];const k=a<b?`${a},${b}`:`${b},${a}`;counts.set(k,(counts.get(k)||0)+1)}}
    const bad=[...counts].filter(([k,n])=>n!==2);
    const winding = new Map(); for (const f of work.faces) for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length],k=a<b?`${a},${b}`:`${b},${a}`;winding.set(k,(winding.get(k)||0)+(a<b?1:-1));}
    const wrongWinding=[...winding].filter(([k,v])=>counts.get(k)===2 && v!==0).length;
    const verts=new Map(work.vertices.map(v=>[v.id,v]));let tj=0;
    for(const [k,n] of counts){const [a,b]=k.split(',').map(Number);const A=verts.get(a),B=verts.get(b);if(!A||!B)continue;for(const v of work.vertices){if(v.id===a||v.id===b)continue;const ab=[B.x-A.x,B.y-A.y,B.z-A.z], ap=[v.x-A.x,v.y-A.y,v.z-A.z];const len=ab.reduce((s,x)=>s+x*x,0);const t=ab.reduce((s,x,i)=>s+x*ap[i],0)/len;if(t>1e-6&&t<1-1e-6&&Math.hypot(...ap.map((x,i)=>x-ab[i]*t))<1e-5){if(!counts.has(v.id<a?`${v.id},${a}`:`${a},${v.id}`))tj++;break;}}}
    const topBridgeCount = work.visibleEdges.filter(({v1,v2}) => {
      const a=verts.get(v1), b=verts.get(v2);
      if(!a||!b||Math.abs(a.y-0.5)>1e-5||Math.abs(b.y-0.5)>1e-5)return false;
      const r1=Math.hypot(a.x-p[0],a.z-p[2]),r2=Math.hypot(b.x-p[0],b.z-p[2]);
      return (Math.abs(r1-.65)<.02 && r2>.7)||(Math.abs(r2-.65)<.02 && r1>.7);
    }).length;
    const farBaseFaces=base.faces.filter(f=>{
      const verts=f.map(id=>base.getVertex(id));
      return verts.every(v=>v.x < p[0]-2) || verts.every(v=>v.x > p[0]+2) ||
        verts.every(v=>v.z < p[2]-1.5) || verts.every(v=>v.z > p[2]+1.5);
    }).map(f=>f.join(','));
    const containsOriginalOutline = (original, output) => {
      const ids=original.split(',').map(Number);
      let pos=output.indexOf(ids[0]);
      if(pos<0)return false;
      for(let j=1;j<ids.length;j++) {
        let steps=0;
        do {pos=(pos+1)%output.length;steps++;} while(output[pos]!==ids[j]&&steps<output.length);
        if(output[pos]!==ids[j])return false;
      }
      return true;
    };
    const missingFar=farBaseFaces.filter(f=>
      !work.faces.some(output=>containsOriginalOutline(f,output)));
    const farFacesPreserved=missingFar.length===0;
    if (missingFar.length && process.env.AXIS_BOOLEAN_DEBUG) console.log('MISSING_FAR_FACES',name,missingFar.slice(0,5), missingFar[0].split(',').map(id=>base.getVertex(Number(id))), work.faces.filter(f=>missingFar[0].split(',').some(id=>f.includes(Number(id)))).slice(0,6));
    const result={name,ok,error,skip:lastSkipReason,faces:work.faces.length,vertices:work.vertices.length,triangles:work.getTriangleCount(),boundary:bad.filter(([k,n])=>n===1).length,nonmanifold:bad.filter(([k,n])=>n>2).length,tjunctionEdges:tj,edgeCount:counts.size,wrongWinding,volume:volumeOf(work),topBridgeCount,farFacesPreserved};
    console.log(JSON.stringify(result));
    assert.ok(ok,`${name}: solver failed ${error || lastSkipReason}`);
    assert.equal(bad.length,0,`${name}: open/nonmanifold edges`);
    assert.equal(wrongWinding,0,`${name}: inconsistent face winding`);
    assert.equal(tj,0,`${name}: unconnected vertices on edges`);
    assert.equal(work.paintWireEdges, null, `${name}: outdated paint wireframe overrides new edges`);
    const wireframe = work.toEdgesGeometry();
    const displayedEdges = wireframe.getAttribute('position').count / 2;
    wireframe.dispose();
    const selectableEdges = work.getEdges();
    assert.equal(displayedEdges, selectableEdges.length, `${name}: wireframe differs from editable face edges`);
    const hiddenSet = new Set(work.hiddenEdges.map(e=>[e.v1,e.v2].sort((a,b)=>a-b).join(',')));
    const userHiddenSet = new Set(work.hiddenEdges.filter(e=>e.user).map(e=>[e.v1,e.v2].sort((a,b)=>a-b).join(',')));
    const edgeFaceIndex = new Map();
    for(let fi=0;fi<work.faces.length;fi++) {
      const f=work.faces[fi];
      for(let i=0;i<f.length;i++) {
        const k=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b).join(',');
        if(!edgeFaceIndex.has(k))edgeFaceIndex.set(k,[]);
        edgeFaceIndex.get(k).push(fi);
      }
    }
    const hiddenPolygonEdges=[...edgeFaceIndex].filter(([k,idx])=>hiddenSet.has(k)&&!userHiddenSet.has(k)&&idx.some(fi=>work.faces[fi].length>3));
    const original=base.clone();original.lockTriangulationDiagonals();
    const originalCutter=cutter.clone();originalCutter.lockTriangulationDiagonals();
    const sourceHidden=[...original.hiddenEdges.filter(e=>!e.user).map(e=>[original.getVertex(e.v1),original.getVertex(e.v2),original]),
      ...originalCutter.hiddenEdges.filter(e=>!e.user).map(e=>[originalCutter.getVertex(e.v1),originalCutter.getVertex(e.v2),originalCutter])]
      .map(([a,b,m])=>[new THREE.Vector3(a.x,a.y,a.z).applyMatrix4(manager.getWorldMatrix(m)),new THREE.Vector3(b.x,b.y,b.z).applyMatrix4(manager.getWorldMatrix(m))]);
    const onSegment=(p,a,b)=>{const d=b.clone().sub(a),len=d.lengthSq();if(len<1e-16)return false;const t=p.clone().sub(a).dot(d)/len;return t>=-1e-5&&t<=1+1e-5&&p.distanceTo(a.clone().addScaledVector(d,t))<1e-4;};
    const inherited=(key)=>{const [a,b]=key.split(',').map(Number),p=verts.get(a),q=verts.get(b);if(!p||!q)return false;const P=new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(manager.getWorldMatrix(base)),Q=new THREE.Vector3(q.x,q.y,q.z).applyMatrix4(manager.getWorldMatrix(base));return sourceHidden.some(([u,v])=>onSegment(P,u,v)&&onSegment(Q,u,v));};
    const inventedHidden=hiddenPolygonEdges.filter(([k])=>!inherited(k));
    if(process.env.AXIS_BOOLEAN_DEBUG)console.log('POLYGON_EDGES',name,{hidden: hiddenPolygonEdges.length,originalHidden: hiddenPolygonEdges.length-inventedHidden.length,newHidden: inventedHidden.length,first:inventedHidden.slice(0,5).map(([k])=>k),total:edgeFaceIndex.size});
    assert.equal(inventedHidden.length,0, `${name}: new polygon boundaries were hidden without original triangulation`);
    const selectableSpokes = selectableEdges.filter(({v1,v2}) => {
      const a=verts.get(v1), b=verts.get(v2);
      if (!a || !b || Math.abs(a.y - 0.5) > 1e-5 || Math.abs(b.y - 0.5) > 1e-5) return false;
      const ra=Math.hypot(a.x-p[0],a.z-p[2]), rb=Math.hypot(b.x-p[0],b.z-p[2]);
      return (Math.abs(ra-.65)<.02 && rb>.7) || (Math.abs(rb-.65)<.02 && ra>.7);
    }).length;
    assert.equal(selectableSpokes, topBridgeCount, `${name}: new connecting edges are hidden or not selectable`);
    if (name === 'through-hole' || name === 'segmented-through-hole') {
      assert.ok(displayedEdges > topBridgeCount, `${name}: wireframe is missing reconstructed rim and base edges`);
    }
    const rendered=work.toBufferGeometry();
    const positions=rendered.getAttribute('position');
    const normals=rendered.getAttribute('normal');
    let degenerate=0, flipped=0;
    for(let i=0;i<positions.count;i+=3) {
      const a=new THREE.Vector3().fromBufferAttribute(positions,i);
      const b=new THREE.Vector3().fromBufferAttribute(positions,i+1);
      const c=new THREE.Vector3().fromBufferAttribute(positions,i+2);
      const cross=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
      if(cross.lengthSq()<1e-18)degenerate++;
      const n=new THREE.Vector3().fromBufferAttribute(normals,i);
      if(!Number.isFinite(n.x+n.y+n.z))flipped++;
      else if(cross.lengthSq()>1e-18 && cross.dot(n)<-1e-9)flipped++;
    }
    rendered.dispose();
    if (process.env.AXIS_BOOLEAN_DEBUG) console.info('TRIANGULATION',name,degenerate,flipped,positions.count/3);
    assert.equal(flipped,0,`${name}: incorrect rendered triangle normals`);
    assert.ok(degenerate<20,`${name}: excessive degenerate triangulation`);
    assert.ok(farFacesPreserved, `${name}: geometry outside the contact area was changed`);
    if (name==='through-hole' || name==='segmented-through-hole' || name==='dense-segmented-hole')
      assert.ok(topBridgeCount >= 8, `${name}: expected visible structural bridges between rim and base`);
    if (name==='through-hole' || name==='offset-hole' || name==='segmented-through-hole') {
      const segments=name==='segmented-through-hole'?16:12;
      const removed=segments*.5*.65*.65*Math.sin(2*Math.PI/segments);
      assert.ok(Math.abs(volumeOf(work)-(24-removed)) < .01,`${name}: unexpected solid volume`);
    }
  }

  // A line the user deliberately removed must stay hidden even when the
  // solver now exposes real polygon boundaries automatically.
  const userBase = EditableMesh.fromGeometry(new THREE.BoxGeometry(6,1,4), 'user-edges');
  const userEdge = userBase.getEdges().find(({v1,v2}) => {
    const a=userBase.getVertex(v1), b=userBase.getVertex(v2);
    return a.x > 2.9 && b.x > 2.9;
  });
  assert.ok(userEdge,'Expected an outside perimeter edge to test');
  userBase.hiddenEdges.push({...userEdge,user:true});
  userBase.invalidateCache();
  const userCutter = EditableMesh.fromGeometry(new THREE.CylinderGeometry(.65,.65,3,12),'user-cutter');
  assert.equal(localBoolean(manager,userBase,userCutter,'subtract'),true);
  const userKey=[userEdge.v1,userEdge.v2].sort((a,b)=>a-b).join(',');
  assert.ok(userBase.hiddenEdges.some(e=>e.user && [e.v1,e.v2].sort((a,b)=>a-b).join(',')===userKey),
    'Explicitly user-hidden edge must remain hidden after Boolean');
  assert.ok(!userBase.getEdges().some(e=>[e.v1,e.v2].sort((a,b)=>a-b).join(',')===userKey),
    'Explicitly user-hidden edge must not appear in output wireframe');
  console.log(JSON.stringify({name:'preserve-user-deleted-edge',ok:true}));
  const { closedTopologyProblem } = await server.ssrLoadModule('/src/lib/booleanTopology.js');
  const cylArea = (s) => .5 * s * .65 * .65 * Math.sin(2 * Math.PI / s);
  const original = EditableMesh.fromGeometry(new THREE.BoxGeometry(6,1,4,12,1,8), 'multi-base');
  const farFaces = original.faces.filter((f) => f.every((id) => {
    const v = original.getVertex(id);
    return v.x < -2.25 || v.x > 2.25;
  })).map((f) => f.join(','));
  const cutResult = original.clone();
  for (const x of [-1.2, 1.2]) {
    const cutter = EditableMesh.fromGeometry(new THREE.CylinderGeometry(.65,.65,3,16), 'cutter');
    cutter.position.set(x, 0, 0);
    assert.equal(localBoolean(manager, cutResult, cutter, 'subtract'), true, 'successive cut should run');
    assert.equal(closedTopologyProblem(cutResult), null, 'successive cut must remain closed');
  }
  assert.ok(Math.abs(volumeOf(cutResult) - (24 - 2 * cylArea(16))) < .01, 'two separated holes must remove expected volume');
  const finalFaces = new Set(cutResult.faces.map((f) => f.join(',')));
  assert.ok(farFaces.every((face) => finalFaces.has(face)), 'untouched far-away base topology must remain unchanged');
  console.log(JSON.stringify({name:'successive-through-holes',faces:cutResult.faces.length,vertices:cutResult.vertices.length,volume:volumeOf(cutResult),preservedFarFaces:farFaces.length}));

  for (const operation of ['union','intersect']) {
    const base = EditableMesh.fromGeometry(new THREE.BoxGeometry(6,1,4), 'base');
    const cutter = EditableMesh.fromGeometry(new THREE.CylinderGeometry(.65,.65,3,12),'cutter');
    const result = base.clone();
    assert.equal(localBoolean(manager,result,cutter,operation),true, operation + ' should run');
    assert.equal(closedTopologyProblem(result), null, operation + ' must remain manifold');
    const target=operation==='union'?24+2*cylArea(12):cylArea(12);
    assert.ok(Math.abs(volumeOf(result)-target)<.01,operation + ' has incorrect volume');
    console.log(JSON.stringify({name:operation,faces:result.faces.length,vertices:result.vertices.length,volume:volumeOf(result)}));
  }

}finally{await server.close();}
