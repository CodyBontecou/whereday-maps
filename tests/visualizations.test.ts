import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {App} from 'obsidian';
import {parseBlockConfig} from '../src/parser';
import {VISUALIZATION_VIEWS,staySegments,arrivalCounts,rhythmCounts,moveDay,routeSummary,daySamples} from '../src/visualizations';
import {renderVisualization} from '../src/render/visualizations';
import {MapRenderChild} from '../src/render/map-block';
import {DEFAULT_SETTINGS} from '../src/settings';
import {Element} from './host/element';
import {maps,tileRequests,markers} from './host/leaflet';
import type {ExportShape,Visit} from '../src/types';
const date=(day:number,hour:number,min=0)=>new Date(2026,4,day,hour,min).toISOString();
const visit=(day:number,hour:number,extra:Partial<Visit>={}):Visit=>({latitude:10,longitude:20,arrivedAt:date(day,hour),departedAt:date(day,hour+1),locationName:'Invented Park',...extra});
const data:ExportShape={visits:[visit(4,8),visit(4,10,{locationName:'Invented Cafe'}),visit(5,12)],points:[],exportDate:date(5,20)};
const host=(el:Element)=>el as unknown as HTMLElement;
const settle=()=>new Promise<void>(r=>setImmediate(r));
function windowHost(){const old=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}}});return()=>{if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window');};}

test('all standalone views parse explicitly; invalid views fail clearly instead of rendering a report',()=>{
  for(const view of VISUALIZATION_VIEWS)assert.equal(parseBlockConfig(`view: ${view}\nplace: Invented Park`).view,view);
  assert.throws(()=>parseBlockConfig('view: unknown'),/Unknown Whereday view/);
  assert.equal(parseBlockConfig('source: old.json').view,undefined);
});
test('stay geometry clips midnight and snapshots, exposes gaps and overlaps, and hides short records explicitly',()=>{
  const d={...data,visits:[visit(3,23,{departedAt:date(4,1)}),visit(4,0,{departedAt:date(4,2)}),visit(4,3,{departedAt:date(4,3,0),durationMinutes:0}),visit(4,20,{departedAt:null})],exportDate:date(4,21)};
  const result=staySegments(d,'2026-05-04');
  assert.equal(result.stays.length,3);assert.equal(result.hidden,1);assert.equal(result.stays[0].start,0);assert.equal(result.stays[0].minutes,60);assert.deepEqual(result.stays.map(s=>s.lane),[0,1,0]);assert.equal(result.stays[2].until,Date.parse(date(4,21)));
  const [first]=staySegments({visits:[visit(3,23,{departedAt:date(4,0)})],points:[]},'2026-05-04').stays;assert.equal(first,undefined);
});
test('local-day geometry uses actual elapsed day length, including DST changes',()=>{
  const start=new Date(2026,10,1),end=new Date(2026,10,2);
  const d={visits:[{...visit(4,0),arrivedAt:start.toISOString(),departedAt:end.toISOString()}],points:[]};
  const result=staySegments(d,'2026-11-01');assert.equal(result.hours,(end.getTime()-start.getTime())/3600000);assert.equal(result.stays[0].end,1);assert.equal(result.stays[0].minutes,result.hours*60);
});
test('calendar and rhythm count arrivals, not multi-day occupancy; exact name filtering does not match substrings',()=>{
  const counts=arrivalCounts(data,'2026-05','invented park');assert.equal(counts.get('2026-05-04'),1);assert.equal(counts.get('2026-05-05'),1);assert.equal(arrivalCounts(data,'2026-05','park').size,0);
  const rhythm=rhythmCounts(data);assert.equal(rhythm.reduce((a,row)=>a+row.reduce((b,c)=>b+c,0),0),3);assert.equal(rhythm[0][8],1);assert.equal(rhythm[1][12],1);
  assert.equal(moveDay('2026-01-31',1,true),'2026-02-28');assert.equal(moveDay('2026-01-01',-1),'2025-12-31');
});
test('route data ignores outliers and never computes distance across recording gaps or other days',()=>{
  const points=[{latitude:10,longitude:20,timestamp:date(4,8)},{latitude:10.001,longitude:20,timestamp:date(4,8,1)},{latitude:11,longitude:21,timestamp:date(4,12)},{latitude:50,longitude:50,timestamp:date(4,9),isOutlier:true},{latitude:20,longitude:30,timestamp:date(5,8)}];
  const samples=daySamples({visits:[],points},'2026-05-04'),summary=routeSummary(samples);assert.equal(samples.length,3);assert.equal(summary.gaps,1);assert.ok(summary.meters>100&&summary.meters<120);assert.deepEqual(summary.segments.map(s=>s.length),[2,1]);
});
for(const view of ['stay-strip','day-dial','return-calendar','weekly-rhythm'] as const)test(`${view} is independent, keyboard-labeled, and never creates a Leaflet map or note action`,()=>{
  const parent=new Element('div');maps.length=0;
  const dispose=renderVisualization(host(parent),data,{view},new Date(2026,4,4),DEFAULT_SETTINGS);
  const text=parent.all().map(e=>e.textContent).join('\n');assert.ok(!text.includes('Field Journal'));assert.ok(!text.includes('Create or refresh'));assert.equal(maps.length,0);
  assert.ok(parent.all().some(e=>e.attributes['aria-label']));
  if(view==='stay-strip'||view==='day-dial'){
    const selected=parent.all().find(e=>e.attributes['aria-label']==='Select a stay')!;selected.value='1';selected.dispatch('change');assert.ok(parent.all().some(e=>e.textContent==='Invented Cafe'));
  }
  dispose();
});
test('empty visualizations retain date controls and honest empty states without constructing a map',()=>{
  const parent=new Element('div');maps.length=0;const dispose=renderVisualization(host(parent),{visits:[],points:[]},{view:'route-card'},new Date(2026,4,4),DEFAULT_SETTINGS);
  assert.equal(maps.length,0);assert.ok(parent.all().some(e=>e.textContent.includes('No recorded GPS')));assert.ok(parent.all().some(e=>e.attributes['aria-label']==='Next day'));dispose();
});
test('route scrubber follows actual samples, skips long gaps and disposes scheduled playback on unload',()=>{
  const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;const pending=new Map<number,()=>void>();let id=0;
  globalThis.setTimeout=((cb:()=>void)=>{pending.set(++id,cb);return id;}) as unknown as typeof setTimeout;
  globalThis.clearTimeout=((n:number)=>{pending.delete(n);}) as unknown as typeof clearTimeout;
  const points=[8,10,12].map(hour=>({latitude:10+hour/100,longitude:20,timestamp:date(4,hour)}));
  maps.length=0;tileRequests.length=0;markers.length=0;
  try{
    const parent=new Element('div'),dispose=renderVisualization(host(parent),{visits:[],points},{view:'route-card',tile_provider:'none'},new Date(2026,4,4),DEFAULT_SETTINGS);
    assert.equal(maps.length,1);assert.equal(tileRequests.length,0);
    const slider=parent.all().find(e=>e.attributes['aria-label']==='Recorded GPS position')!;slider.value='2';slider.dispatch('input');assert.deepEqual(markers[0].coordinate,[10.12,20]);assert.ok(slider.attributes['aria-valuetext'].includes('recording gap'));
    const play=parent.all().find(e=>e.attributes['aria-label']==='Play recorded route')!;play.dispatch('click');assert.equal(pending.size,1);const callback=[...pending.values()][0];dispose();assert.equal(pending.size,0);assert.equal(maps[0].removed,true);callback();assert.equal(pending.size,0);
  }finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
});
test('public renderer gives view precedence over journal flags, does not load journal state, and retains date across refresh',async()=>{
  const restore=windowHost(),parent=new Element('div'),reads:string[]=[];
  const app={vault:{adapter:{stat:async()=>({type:'file'}),read:async(path:string)=>{reads.push(path);return JSON.stringify(data);}}}} as unknown as App;
  const child=new MapRenderChild(host(parent),app,DEFAULT_SETTINGS,{view:'stay-strip',source:'export.json',date:'2026-05-04',journal:true,show_receipt:true},{sourcePath:'QA.md'} as never);
  try{
    child.onload();await settle();assert.deepEqual(reads,['export.json']);assert.ok(!parent.all().some(e=>e.textContent==='A day worth remembering'));
    parent.all().find(e=>e.attributes['aria-label']==='Next day')!.dispatch('click');assert.equal(parent.all().find(e=>e.attributes['aria-label']==='Visualization date')!.value,'2026-05-05');
    parent.all().find(e=>e.textContent==='Refresh exports')!.dispatch('click');await settle();assert.equal(parent.all().find(e=>e.attributes['aria-label']==='Visualization date')!.value,'2026-05-05');
  }finally{child.onunload();restore();}assert.equal(parent.children.length,0);
});
