// Read-only layout preview of the actual journal renderer. Synthetic data only.
// node scripts/preview-journal.mjs [port]
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(join(tmpdir(),'whereday-layout-'));
await build({stdin:{resolveDir:root,contents:`
import { renderJournal, renderReceipt } from './src/render/journal';
import { emptyJournalState } from './src/journal';
const proto=HTMLElement.prototype;
proto.createEl=function(tag,options={}) { const child=document.createElement(tag); if(options.cls) child.className=options.cls; if(options.text!=null) child.textContent=options.text; this.append(child); return child; };
proto.createDiv=function(options={}) {return this.createEl('div',options)};
proto.createSpan=function(options={}) {return this.createEl('span',options)};
proto.empty=function(){this.replaceChildren()}; proto.addClass=function(cls){this.classList.add(cls)};
const options=new URLSearchParams(location.search), width=Number(options.get('width'))||320;
document.body.classList.toggle('theme-dark',options.get('theme')==='dark');
document.body.style.fontSize=(Number(options.get('size'))||16)+'px';
const data=await fetch('/fixture.json').then(r=>r.json());
data.sourcePaths=['synthetic-atlas.json'];
data.visits[0].locationName='A long invented venue name for narrow-panel verification '.repeat(6);
const state=emptyJournalState(), store={snapshot:state};
const block=document.getElementById('journal'); block.style.width=width+'px';
const receipt=block.createDiv({}), journal=block.createDiv({});
renderReceipt(receipt,data,()=>{});
renderJournal(journal,data,{journal:true,show_recall:true},'2026-05-04',store,{focus(){},day(){},open:async()=>{},refresh(){}});
for (const b of block.querySelectorAll('button')) if (!['Run local query','More stops','Previous stops','Preview trip chapters'].includes(b.textContent)) b.disabled=true;
window.layoutReady=true;
`,loader:'ts'},bundle:true,format:'esm',platform:'browser',outfile:join(dir,'preview.js')});
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Whereday read-only layout QA</title><link rel="stylesheet" href="/styles.css"><style>body{font:16px system-ui;margin:20px;background:#ddd}*{box-sizing:border-box}button,input,select{font:inherit}#journal{max-width:100%;container-type:inline-size}label{display:block}h3{margin:0}</style><p>Read-only renderer preview · synthetic data · writing actions disabled</p><main id="journal" class="iso-me-block wd-appearance"></main><script type="module" src="/preview.js"></script>';
const routes={ '/preview.js': [join(dir,'preview.js'),'text/javascript'], '/styles.css':[join(root,'styles.css'),'text/css'], '/fixture.json':[join(root,'examples/synthetic-atlas.json'),'application/json'] };
const port=Number(process.argv[2])||4318;
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const route=routes[path]; if(!route){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',route[1]);res.end(await readFile(route[0]));
}).listen(port,'127.0.0.1',()=>console.log('Read-only journal preview: http://127.0.0.1:'+port+'/?width=320&theme=light'));
