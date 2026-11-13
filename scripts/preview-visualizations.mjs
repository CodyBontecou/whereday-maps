// Local, read-only preview of the production renderers and export loader.
// node scripts/preview-visualizations.mjs [port] [explicit JSON export path]
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(join(tmpdir(),'whereday-viz-'));
const fixture=resolve(process.argv[3]||join(root,'examples/synthetic-atlas.json'));
await build({stdin:{resolveDir:root,loader:'ts',contents:`
import {renderVisualization} from './src/render/visualizations';
import {VISUALIZATION_VIEWS} from './src/visualizations';
import {loadExports} from './src/data-loader';
import {DEFAULT_SETTINGS} from './src/settings';
import {parseDay} from './src/atlas';
const proto=HTMLElement.prototype;
proto.createEl=function(tag,options={}){const child=document.createElement(tag);if(options.cls)child.className=options.cls;if(options.text!=null)child.textContent=options.text;this.append(child);return child};
proto.createDiv=function(options={}){return this.createEl('div',options)};
proto.createSpan=function(options={}){return this.createEl('span',options)};
proto.empty=function(){this.replaceChildren()};proto.addClass=function(cls){this.classList.add(cls)};
const options=new URLSearchParams(location.search);
document.body.classList.toggle('theme-dark',options.get('theme')==='dark');
document.body.style.fontSize=(Number(options.get('size'))||16)+'px';
const raw=await fetch('/fixture.json').then(r=>r.text());
const data=await loadExports({vault:{adapter:{stat:async()=>({type:'file'}),read:async()=>raw}}},['preview.json']);
const disposers=[];
for(const view of VISUALIZATION_VIEWS){
 if(options.get('view')&&options.get('view')!==view)continue;
 const block=document.getElementById('visualizations').createDiv({cls:'iso-me-block'});
 block.style.width=(Number(options.get('width'))||340)+'px';
 disposers.push(renderVisualization(block,data,{view,tile_provider:options.get('tiles')||'none'},parseDay(options.get('date')||'2026-05-04'),DEFAULT_SETTINGS));
}
window.disposeVisualizations=()=>disposers.forEach(d=>d());
window.visualizationsReady=true;
window.exportCounts={visits:data.visits.length,points:data.points.length};
`},bundle:true,format:'esm',platform:'browser',outfile:join(dir,'preview.js'),alias:{obsidian:join(root,'tests/host/obsidian.ts')}});
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Whereday visualizations</title><link rel="stylesheet" href="/styles.css"><style>*{box-sizing:border-box}body{font:16px system-ui;margin:20px;background:#e9e6e0;color:#343530}.theme-dark{background:#242820;color:#e4e4d9}button,input,select{font:inherit}#visualizations{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px}.iso-me-block{max-width:100%;container-type:inline-size}h3{margin:0}</style><main id="visualizations"></main><script type="module" src="/preview.js"></script>';
const routes={'/preview.js':[join(dir,'preview.js'),'text/javascript'],'/styles.css':[join(root,'styles.css'),'text/css'],'/fixture.json':[fixture,'application/json']};
const port=Number(process.argv[2])||4319;
createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const route=routes[path];if(!route){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',route[1]);res.end(await readFile(route[0]));
}catch{res.writeHead(500);res.end('Preview read failed');}}).listen(port,'127.0.0.1',()=>console.log('Read-only visualizations: http://127.0.0.1:'+port));
