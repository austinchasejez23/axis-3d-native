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
 const ys=[0,2,4,6], widths=[3,2.1,1.2,0.5];
 const rings=ys.map((y,i)=>[add(0,y,0),add(widths[i],y,-1),add(-widths[i],y,-1)]);
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){let k=(j+1)%3;m.faces.push([rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]]);}
 m.faces.push([...rings[0]].reverse(),rings[3]);m.invalidateCache();
 const keys=new Set([0,1,2].map(i=>edgeKey(rings[i][0],rings[i+1][0])));
 const indices=m.getEdges().map((e,i)=>keys.has(edgeKey(e.v1,e.v2))?i:-1).filter(i=>i>=0);
 assert.equal(indices.length,3);
 const sm={selection:{meshId:m.id,type:'edge',indices},meshes:[m],getMesh:()=>m,setSelection(s){this.selection=s},clearSelection(){},rebuildThreeMesh(){},updateStats(){},pushUndo(){}};
 const before=new Set(m.vertices.map(v=>v.id));bevelLoopEdges(sm,{radius:0.7,segments:6,smooth:true,sweep:false});
 const rows=ys.map(y=>m.vertices.filter(v=>!before.has(v.id)&&Math.abs(v.y-y)<0.001));
 console.log('taper rows',rows.map(row=>({count:row.length,span:row.length?Math.max(...row.map(v=>v.x))-Math.min(...row.map(v=>v.x)):0})));
 assert.ok(rows.every(row=>row.length>=7),'each crease station generates bevel rings');
 const spans=rows.map(row=>Math.max(...row.map(v=>v.x))-Math.min(...row.map(v=>v.x)));
 assert.ok(spans[0]>spans[1] && spans[1]>spans[2] && spans[2]>spans[3], 'bevel must shrink monotonically toward the narrow tip');
 const counts=new Map();for(const f of m.faces)for(let j=0;j<f.length;j++){const k=edgeKey(f[j],f[(j+1)%f.length]);counts.set(k,(counts.get(k)||0)+1)}
 assert.ok([...counts.values()].every(n=>n===2),'taper bevel must stay watertight and manifold');
 console.log('Tapered bevel rails expand toward the wide end.');
} finally {await server.close()}
