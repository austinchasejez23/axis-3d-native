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
 const ys=[0,2,4], widths=[3,2.1,1.2];
 const rings=ys.map((y,i)=>[add(0,y,0),add(widths[i],y,-1),add(-widths[i],y,-1)]);
 for(let i=0;i<2;i++)for(let j=0;j<3;j++){let k=(j+1)%3;m.faces.push([rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]]);}
 m.faces.push([...rings[0]].reverse(),rings[2]);m.invalidateCache();
 const keys=new Set([0,1,2].map(i=>edgeKey(rings[1][i],rings[1][(i+1)%3])));
 const indices=m.getEdges().map((e,i)=>keys.has(edgeKey(e.v1,e.v2))?i:-1).filter(i=>i>=0);
 assert.equal(indices.length,3);
 const sm={selection:{meshId:m.id,type:'edge',indices},meshes:[m],getMesh:()=>m,setSelection(s){this.selection=s},clearSelection(){},rebuildThreeMesh(){},updateStats(){},pushUndo(){}};
 const before=new Set(m.vertices.map(v=>v.id));bevelLoopEdges(sm,{radius:0.7,segments:6,smooth:true,sweep:false});
 const counts=new Map();for(const f of m.faces)for(let j=0;j<f.length;j++){const k=edgeKey(f[j],f[(j+1)%f.length]);counts.set(k,(counts.get(k)||0)+1)}
 assert.ok([...counts.values()].every(n=>n===2),'closed tapered bevel must stay manifold');
 const newVerts=m.vertices.filter(v=>!before.has(v.id));
 assert.equal(newVerts.length,21,'three corners each get seven bevel vertices');
 for(const v of newVerts)assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z));
 console.log('Tapered bevel rails expand toward the wide end.');
} finally {await server.close()}
