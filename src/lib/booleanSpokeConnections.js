import * as THREE from 'three';

import { closedTopologyProblem } from './booleanTopology';

// When an original base grid line continues to the cutter rim through
// multiple collinear short edges, remove that WHOLE intermediate chain.
// Never move the cutter rim vertex, and never merge only part of the chain.
// A single partial weld breaks adjoining faces; the complete chain preserves
// their shared boundary and gives a direct, editable edge into the rim.
export function snapCollinearSpokesToRim({
  faces,colors,changed,world,bridgeEdges,contactPlanes,originalBaseLine,
  closestCutterDistance,cutterMinEdge,baseDiagonal,protectedIds=new Set(),
}) {
  if(!faces.length||!changed.size||!Number.isFinite(cutterMinEdge))return 0;
  const maxGap=Math.min(cutterMinEdge*.83,baseDiagonal*.06);
  const distanceCache=new Map(),planeCache=new Map();
  const distance=id=>{
    if(!distanceCache.has(id))distanceCache.set(id,closestCutterDistance(world.get(id)));
    return distanceCache.get(id);
  };
  const nearRim=id=>distance(id)<1e-5;
  const onPlane=id=>{
    if(!planeCache.has(id))planeCache.set(id,contactPlanes.some(({normal,constant})=>
      Math.abs(normal.dot(world.get(id))-constant)<1e-5));
    return planeCache.get(id);
  };
  let changes=0;
  const getEdges=()=>{
    const edges=new Map(),adjacent=new Map();
    for(const f of faces) for(let i=0;i<f.length;i++){
      const a=f[i],b=f[(i+1)%f.length],key=keyOf(a,b);
      if(!edges.has(key))edges.set(key,{a,b});
      if(!adjacent.has(a))adjacent.set(a,new Set());
      if(!adjacent.has(b))adjacent.set(b,new Set());
      adjacent.get(a).add(b);adjacent.get(b).add(a);
    }
    return {edges,adjacent};
  };
  const initialVolume=()=>{
    let volume=0;
    for(const f of faces){
      const a=world.get(f[0]);
      for(let i=1;i<f.length-1;i++)
        volume+=a.dot(new THREE.Vector3().crossVectors(world.get(f[i]),world.get(f[i+1])))/6;
    }
    return volume;
  };
  for(let pass=0;pass<30;pass++){
    const {edges,adjacent}=getEdges();
    let performed=false;
    const usedPositions=new Set(faces.flat());
    const signedVolume=initialVolume();
    const grid=new Map();
    for(let fi=0;fi<faces.length;fi++){
      for(const id of faces[fi]){
        if(!grid.has(id))grid.set(id,[]);
        grid.get(id).push(fi);
      }
    }
    for(const {a,b} of edges.values()){
      if(performed)break;
      if(!onPlane(a)||!onPlane(b)||!originalBaseLine(world.get(a),world.get(b)))continue;
      const pa=world.get(a),pb=world.get(b);
      if(pa.distanceTo(pb)<maxGap*1.3)continue;
      for(const [stub,far] of [[a,b],[b,a]]){
        if(protectedIds.has(stub)||nearRim(stub))continue;
        const d=distance(stub);
        if(d<1e-5||d>maxGap||distance(far)<d+maxGap*.35)continue;
        const direction=world.get(stub).clone().sub(world.get(far)).normalize();
        const trail=[stub];
        let previous=far,current=stub,rim=null,length=0;
        // A geometric straight continuation of the EXISTING base edge.
        // This is not the previous arbitrary nearest-neighbor weld.
        for(let step=0;step<12;step++){
          const options=[];
          for(const neighbor of adjacent.get(current)||[]){
            if(neighbor===previous || trail.includes(neighbor) || !onPlane(neighbor))continue;
            const delta=world.get(neighbor).clone().sub(world.get(current));
            const distance=delta.length();
            if(distance<1e-8||distance>maxGap*1.5)continue;
            const forward=delta.dot(direction)/distance;
            if(forward<.9998)continue;
            const relative=world.get(neighbor).clone().sub(world.get(stub));
            const offset=relative.addScaledVector(direction,-relative.dot(direction)).length();
            if(offset>1e-5)continue;
            options.push({neighbor,distance,atRim:nearRim(neighbor)});
          }
          options.sort((x,y)=>(y.atRim?1:0)-(x.atRim?1:0)||x.distance-y.distance);
          if(!options.length)break;
          const next=options[0];
          length+=next.distance;
          if(length>maxGap*1.35)break;
          if(next.atRim){rim=next.neighbor;break;}
          trail.push(next.neighbor);
          previous=current;current=next.neighbor;
        }
        if(rim==null)continue;
        const drop=new Set(trail);
        // Source vertices of a base surface can be merged only while wholly
        // on the cutter's contact plane. Never change a bevel or vertical wall.
        let planar=true;
        for(const id of drop){
          if(protectedIds.has(id)||nearRim(id)) {planar=false;break;}
          for(const fi of grid.get(id)||[]){
            const f=faces[fi],n=normalOf(f,world);
            if(!n){planar=false;break;}
            n.normalize();
            if(!contactPlanes.some(p=>
              Math.abs(n.dot(p.normal))>.99999 &&
              f.every(v=>Math.abs(p.normal.dot(world.get(v))-p.constant)<1e-5))) {
              planar=false;break;
            }
          }
          if(!planar)break;
        }
        if(!planar)continue;

        const nextFaces=[],nextColors=[],nextChanged=new Set();
        let invalid=false;
        for(let fi=0;fi<faces.length;fi++){
          const f=faces[fi];
          const mapped=f.map(id=>drop.has(id)?rim:id);
          const clean=mapped.filter((id,i)=>id!==mapped[(i+1)%mapped.length]);
          if(clean.length<3){
            if(!f.some(id=>drop.has(id))){invalid=true;break;}
            // A collapsed tiny triangle contributes zero planar area.
            continue;
          }
          if(new Set(clean).size!==clean.length){invalid=true;break;}
          if(f.some(id=>drop.has(id))){
            const aN=normalOf(f,world),bN=normalOf(clean,world);
            if(!aN||!bN||aN.dot(bN)<=0 || bN.lengthSq()<1e-16){
              invalid=true;break;
            }
          }
          const newIndex=nextFaces.length;
          if(changed.has(fi)||f.some(id=>drop.has(id)))nextChanged.add(newIndex);
          nextFaces.push(clean);nextColors.push(colors[fi]);
        }
        if(invalid||closedTopologyProblem({vertices:[...usedPositions].map(id=>({id})),faces:nextFaces})) continue;
        let volume=0;
        for(const f of nextFaces){
          const p=world.get(f[0]);
          for(let i=1;i<f.length-1;i++)
            volume+=p.dot(new THREE.Vector3().crossVectors(world.get(f[i]),world.get(f[i+1])))/6;
        }
        if(Math.abs(volume-signedVolume)>Math.max(1e-8,Math.abs(signedVolume)*1e-7))continue;
        faces.splice(0,faces.length,...nextFaces);
        colors.splice(0,colors.length,...nextColors);
        changed.clear();for(const fi of nextChanged)changed.add(fi);
        const newBridges=new Set();
        for(const key of bridgeEdges){
          const [x,y]=key.split(',').map(Number);
          const p=drop.has(x)?rim:x,q=drop.has(y)?rim:y;
          if(p!==q)newBridges.add(keyOf(p,q));
        }
        // The original base line must visibly continue into the existing
        // cutter rim without a dangling intermediate vertex.
        newBridges.add(keyOf(far,rim));
        bridgeEdges.clear();for(const key of newBridges)bridgeEdges.add(key);
        performed=true;changes++;break;
      }
    }
    if(!performed)break;
  }
  return changes;
}


// A Boolean can leave an original base edge ending inside the face adjacent
// to the cutter rim. Instead of moving either vertex, split THAT face to
// connect the existing base vertex to an existing rim vertex.
// No surface points move, no cutter wall changes, and no invisible extra fan
// triangulation is introduced.
const keyOf = (a,b)=>a<b?a+','+b:b+','+a;
const normalOf = (ids,world)=>{
  const n=new THREE.Vector3();
  for(let i=0;i<ids.length;i++){
    const a=world.get(ids[i]),b=world.get(ids[(i+1)%ids.length]);
    if(!a||!b)return null;
    n.x+=(a.y-b.y)*(a.z+b.z);
    n.y+=(a.z-b.z)*(a.x+b.x);
    n.z+=(a.x-b.x)*(a.y+b.y);
  }
  return n.lengthSq()>1e-22?n:null;
};
const walk=(f,start,end)=>{
  const result=[f[start]];
  let i=start;
  while(i!==end && result.length<=f.length) {
    i=(i+1)%f.length;
    result.push(f[i]);
  }
  return result;
};
const flat=(p,n)=>{
  const x=Math.abs(n.x),y=Math.abs(n.y),z=Math.abs(n.z);
  return x>=y&&x>=z?new THREE.Vector2(p.y,p.z):
    y>=z?new THREE.Vector2(p.z,p.x):new THREE.Vector2(p.x,p.y);
};
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=points=>{
  let sum=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    sum+=a.x*b.y-a.y*b.x;
  }
  return sum*.5;
};
const inPoly=(p,poly)=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a.y>p.y)!==(b.y>p.y) &&
      p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
};
function validChord(face,ia,ib,world) {
  const n=normalOf(face,world);
  if(!n)return false;
  const unit=n.clone().normalize(),level=unit.dot(world.get(face[0]));
  if(face.some(id=>Math.abs(unit.dot(world.get(id))-level)>1e-5))return false;
  const outline=face.map(id=>flat(world.get(id),n));
  const a=outline[ia],b=outline[ib];
  if(a.distanceToSquared(b)<1e-12)return false;
  // Endpoints must be nonadjacent, with the connecting chord inside
  // the face. Particularly important for concave planar Boolean polygons.
  if((ia+1)%face.length===ib||(ib+1)%face.length===ia)return false;
  for(const t of [.12,.3,.5,.7,.88]) {
    const p=a.clone().lerp(b,t);
    if(!inPoly(p,outline))return false;
  }
  for(let i=0;i<outline.length;i++){
    const j=(i+1)%outline.length;
    if(i===ia||j===ia||i===ib||j===ib)continue;
    const c=outline[i],d=outline[j];
    const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),x=cross(c,d,b);
    if(((u>1e-9&&v< -1e-9)||(u< -1e-9&&v>1e-9)) &&
       ((w>1e-9&&x< -1e-9)||(w< -1e-9&&x>1e-9))) return false;
  }
  const f1=walk(face,ia,ib),f2=walk(face,ib,ia);
  if(f1.length<3||f2.length<3)return false;
  const p1=f1.map(id=>flat(world.get(id),n));
  const p2=f2.map(id=>flat(world.get(id),n));
  const original=Math.abs(area(outline)),first=Math.abs(area(p1)),second=Math.abs(area(p2));
  if(first<1e-8||second<1e-8||Math.abs(first+second-original)>Math.max(1e-8,original*1e-5))return false;
  const n1=normalOf(f1,world),n2=normalOf(f2,world);
  return !!n1&&!!n2&&n1.dot(n)>0&&n2.dot(n)>0;
}

export function connectBooleanSpokes({
  faces,colors,changed,world,bridgeEdges,contactPlanes,originalBaseLine,
  closestCutterDistance,cutterMinEdge,baseDiagonal,
}) {
  if(!faces.length||!changed.size||!contactPlanes.length ||
     !Number.isFinite(cutterMinEdge)||cutterMinEdge<1e-5)return 0;
  const maxGap=Math.min(cutterMinEdge*.83,baseDiagonal*.06);
  if(maxGap<.0001)return 0;
  let bridged=0;
  const cutterDist=new Map();
  const distance=id=>{
    if(!cutterDist.has(id)) cutterDist.set(id,closestCutterDistance(world.get(id)));
    return cutterDist.get(id);
  };
  const planeCache=new Map();
  const onPlane=id=>{
    if(!planeCache.has(id))planeCache.set(id,contactPlanes.some(({normal,constant})=>
      Math.abs(normal.dot(world.get(id))-constant)<1e-5));
    return planeCache.get(id);
  };
  // Contact rim vertices are already shared by the cutter wall and the
  // base surface. Never replace or shift any of these IDs.
  const rim=new Set();
  const allIds=new Set(faces.flat());
  for(const id of allIds) if(onPlane(id) && distance(id)<1e-5) rim.add(id);
  if(!rim.size)return 0;

  for(let pass=0;pass<3 && bridged<64;pass++){
    const edges=new Map();
    for(let fi=0;fi<faces.length;fi++){
      const f=faces[fi];
      for(let i=0;i<f.length;i++){
        const a=f[i],b=f[(i+1)%f.length],key=keyOf(a,b);
        if(!edges.has(key))edges.set(key,{a,b,facelist:[]});
        edges.get(key).facelist.push(fi);
      }
    }
    const candidates=[];
    const saw=new Set();
    for(const {a,b,facelist} of edges.values()){
      if(!facelist.some(fi=>changed.has(fi)) ||
         !onPlane(a)||!onPlane(b) ||
         !originalBaseLine(world.get(a),world.get(b)))continue;
      const pa=world.get(a),pb=world.get(b);
      const segment=pa.distanceTo(pb);
      if(segment<maxGap*1.3)continue;
      for(const [stub,far] of [[a,b],[b,a]]){
        if(saw.has(stub)||rim.has(stub))continue;
        const d=distance(stub),other=distance(far);
        if(d<.012*cutterMinEdge || d>maxGap ||
           other<d+maxGap*.35)continue;
        const direction=world.get(stub).clone().sub(world.get(far)).normalize();
        let best=null;
        for(let fi=0;fi<faces.length;fi++){
          if(!changed.has(fi))continue;
          const f=faces[fi],at=f.indexOf(stub);
          if(at<0 || f.length<4)continue;
          for(let j=0;j<f.length;j++){
            const target=f[j];
            if(!rim.has(target)||target===stub)continue;
            const delta=world.get(target).clone().sub(world.get(stub));
            const length=delta.length();
            if(length<1e-6||length>maxGap*1.35)continue;
            const forward=direction.dot(delta)/length;
            if(forward<.35)continue;
            // A real face must contain this segment. Otherwise splitting
            // would put edges through the hole or across a different face.
            if(!validChord(f,at,j,world))continue;
            const score=length*(1+.25*(1-forward));
            if(!best||score<best.score)best={fi,stub,target,score,length};
          }
        }
        if(best) candidates.push(best);
        saw.add(stub);
      }
    }
    if(!candidates.length)break;
    candidates.sort((a,b)=>a.score-b.score);
    let changedThisPass=0;
    const paired=new Set();
    for(const c of candidates){
      if(bridged>=64||paired.has(c.stub)||paired.has(c.target))continue;
      const f=faces[c.fi],ia=f.indexOf(c.stub),ib=f.indexOf(c.target);
      if(ia<0||ib<0||!validChord(f,ia,ib,world))continue;
      const f1=walk(f,ia,ib),f2=walk(f,ib,ia);
      faces[c.fi]=f1;
      faces.push(f2);
      colors.push(colors[c.fi]);
      changed.add(c.fi);changed.add(faces.length-1);
      bridgeEdges.add(keyOf(c.stub,c.target));
      paired.add(c.stub);paired.add(c.target);
      changedThisPass++;bridged++;
    }
    if(!changedThisPass)break;
  }
  return bridged;
}
