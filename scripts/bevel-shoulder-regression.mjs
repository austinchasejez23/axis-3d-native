import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':process.cwd()+'/src'}},server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]},appType:'custom',logLevel:'silent'});
try {
 globalThis.window={self:{},top:{}};
 const {EditableMesh}=await server.ssrLoadModule('/src/lib/EditableMesh.js');
 const {bevelLoopEdges}=await server.ssrLoadModule('/src/lib/bevelLoop.js');
 const {edgeKey}=await server.ssrLoadModule('/src/lib/meshTopology.js');
 const m=new EditableMesh('taper');let id=970000;
 const add=(x,y,z)=>{m.vertices.push({id:id,x,y,z});return id++};
 // A triangular-prism crease with a narrow top and wide base, divided into
 // two edges. Side walls taper together while the crease stays at x=0.
 const ys=[0,1,2,3,4,5,6,7,8], widths=[0.5,0.8,1.2,2.2,3.2,3.5,3.3,2.8,2.3];
 const crest=[0,0,0.1,0.4,0.9,1.2,1.0,0.6,0.2];
 const rings=ys.map((y,i)=>[add(0,y,crest[i]),add(widths[i],y,-1),add(-widths[i],y,-1)]);
 for(let i=0;i<ys.length-1;i++)for(let j=0;j<3;j++){let k=(j+1)%3;m.faces.push([rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]]);}
 m.faces.push([...rings[0]].reverse(),rings[rings.length-1]);m.invalidateCache();
 const keys=new Set(ys.slice(0,-1).map((_,i)=>edgeKey(rings[i][0],rings[i+1][0])));
 const indices=m.getEdges().map((e,i)=>keys.has(edgeKey(e.v1,e.v2))?i:-1).filter(i=>i>=0);
 assert.equal(indices.length,ys.length-1);
 const sm={selection:{meshId:m.id,type:'edge',indices},meshes:[m],getMesh:()=>m,setSelection(s){this.selection=s},clearSelection(){},rebuildThreeMesh(){},updateStats(){},pushUndo(){}};
 const before=new Set(m.vertices.map(v=>v.id));bevelLoopEdges(sm,{radius:2.55,segments:6,smooth:true,sweep:false});
 const vertexGroups=Array.from({length:ys.length},(_,i)=>m.vertices.filter(v=>!before.has(v.id)).slice(i*7,(i+1)*7));
 console.log('rail offset by station', JSON.stringify(vertexGroups.map((group,i)=>({station:i,width:widths[i],coords:group.filter((_,j)=>j===0||j===6).map(v=>[+v.x.toFixed(3),+v.y.toFixed(3),+v.z.toFixed(3)])}))));
 const rows=vertexGroups;
 assert.ok(rows.every(row=>row.length===7),'all crease stations generate 7 bevel vertices');
 const spans=rows.map(row=>Math.max(...row.map(v=>v.x))-Math.min(...row.map(v=>v.x)));
 assert.ok(spans[5]>spans[0] && spans[5]>spans[8],'shoulder bevel follows changing width');
 assert.ok(rows.every((row,i)=>row.every(v=>Math.abs(v.y-ys[i])<1e-5)),
   'bevel rail points must remain on the real radial surface edge at each station');
 const counts=new Map();for(const f of m.faces)for(let j=0;j<f.length;j++){const k=edgeKey(f[j],f[(j+1)%f.length]);counts.set(k,(counts.get(k)||0)+1)}
 assert.ok([...counts.values()].every(n=>n===2),'taper bevel must stay watertight and manifold');
 console.log('Tapered bevel rails expand toward the wide end.');
} finally {await server.close()}
