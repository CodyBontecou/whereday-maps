import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { ExportShape, Visit } from '../src/types';
import { loadExports, loadExport } from '../src/data-loader';
import { dayVisits, dialStays, durationLabel, visitKey, emptyJournalState, recallVisits, defaultQuery, tripChapters, fieldNotes } from '../src/journal';
import { JournalRepository, managedMarkdown } from '../src/journal-repository';
import { parseBlockConfig } from '../src/parser';
import { renderJournal, renderReceipt } from '../src/render/journal';
import { Element } from './host/element';

const visit = (extra: Partial<Visit> = {}): Visit => ({ latitude: 10, longitude: 20, arrivedAt: '2026-05-04T10:00:00Z', departedAt: '2026-05-04T11:00:00Z', durationMinutes: 60, locationName: 'Invented Place', ...extra });
const day = (value: string) => { const d=new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function memoryVault() {
  const files = new Map<string,string>(), dirs = new Set<string>(['.obsidian']);
  const properties = new Map<string,Record<string,unknown>>();
  const app = { fileManager: { processFrontMatter: async (file: {path:string}, fn: (m: Record<string,unknown>)=>void) => { const m=properties.get(file.path) ?? {}; fn(m); properties.set(file.path,m); } }, vault: {
    configDir: '.obsidian',
    adapter: { stat: async (p: string) => files.has(p) ? {type:'file'} : dirs.has(p) ? {type:'folder'} : null, exists: async (p: string) => files.has(p)||dirs.has(p), read: async (p: string) => { if (!files.has(p)) throw new Error('missing'); return files.get(p)!; }, write: async (p: string, raw: string) => { files.set(p,raw); } },
    createFolder: async (p: string) => { dirs.add(p); },
    create: async (p: string, raw: string) => { if (files.has(p)) throw new Error('exists'); files.set(p,raw); return {path:p,extension:'md'}; },
    getFileByPath: (p: string) => files.has(p) ? {path:p,extension:'md'} : null,
    process: async (file: {path:string}, fn: (s:string)=>string) => { const next=fn(files.get(file.path)!); files.set(file.path,next); return next; },
  } } as unknown as App;
  return { app, files, properties };
}

test('new options and quoted saved queries round-trip without enabling legacy maps', () => {
  const c=parseBlockConfig('journal: true\nappearance: native\nrecall_revisit: true\nrecall_status: corrected\nrecall_min_minutes: 30\nquery: "a\\nb\\\\c"');
  assert.equal(c.journal,true); assert.equal(c.appearance,'native'); assert.equal(c.recall_revisit,true); assert.equal(c.recall_min_minutes,30); assert.equal(c.query,'a\nb\\c');
  assert.equal(parseBlockConfig('source: old.json').journal,undefined);
});

test('duplicate snapshots and overlapping records cannot inflate counts; latest stable-ID revision wins', async () => {
  const a={ visits:[visit({id:'stable',updatedAt:'2026-05-04T12:00:00Z'})], points:[{latitude:10,longitude:20,timestamp:'2026-05-04T10:00:00Z'}], exportDate:'2026-05-04T12:00:00Z' };
  const b={...a,visits:[visit({id:'stable',updatedAt:'2026-05-04T13:00:00Z',locationName:'Corrected place'})],exportDate:'2026-05-04T13:00:00Z'};
  const raw: Record<string,string>={'a.json':JSON.stringify(a),'duplicate.json':JSON.stringify(a),'b.json':JSON.stringify(b)};
  const app={vault:{adapter:{stat:async()=>({type:'file'}),read:async(p:string)=>raw[p]}}} as unknown as App;
  const d=await loadExports(app,Object.keys(raw));
  assert.equal(d.visits?.length,1); assert.equal(d.points?.length,1); assert.equal(d.visits?.[0].locationName,'Corrected place');
  assert.equal(d.receipt?.duplicateVisits,1); assert.equal(d.receipt?.duplicatePoints,2); assert.equal(d.receipt?.sources[1].duplicateOf,'a.json'); assert.equal(d.exportDate,b.exportDate);
  const e=await loadExports(app,['b.json','a.json']); assert.equal(e.visits?.[0].locationName,'Corrected place');
});

test('native correction evidence survives parser boundaries without inferring absent evidence', async () => {
  const v=visit({updatedAt:'2026-05-05T00:00:00Z',confirmedAt:'2026-05-04T12:00:00Z',originalLatitude:11,detectedLongitude:19,originalLocationName:'<old>',placeSource:'manual',placeDistanceMeters:12});
  for(const [path,raw] of [['v.json',JSON.stringify({visits:[v]})],['v.geojson',JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[20,10]},properties:{...v,kind:'visit'}}]})]]) {
    const app={vault:{adapter:{read:async()=>raw}}} as unknown as App;
    const d=await loadExport(app,path); assert.equal(d.visits?.[0].originalLocationName,'<old>'); assert.equal(d.visits?.[0].detectedLongitude,19); assert.equal(d.visits?.[0].placeDistanceMeters,12);
  }
  assert.equal(visitKey(v),visitKey({...v,locationName:'renamed',latitude:12}));
});

test('overnight/open stays clip to local day and snapshot, duration labels handle real export extremes', () => {
  const start=new Date(2026,4,4,23), end=new Date(2026,4,5,2), selected=day(end.toISOString());
  const v=visit({arrivedAt:start.toISOString(),departedAt:end.toISOString()});
  const open=visit({arrivedAt:new Date(2026,4,5,3).toISOString(),departedAt:null});
  const d={visits:[v,open],points:[],exportDate:new Date(2026,4,5,5).toISOString()};
  assert.equal(dayVisits(d,selected).length,2);
  const arcs=dialStays(d,selected); assert.equal(arcs[0].start,0); assert.ok(Math.abs(arcs[0].end-2/24)<.001); assert.ok(Math.abs(arcs[1].end-5/24)<.001);
  assert.equal(dayVisits(d,'2026-05-06').length,0);
  assert.equal(durationLabel(.2),'<1 min'); assert.equal(durationLabel(2881),'2d 1m'); assert.equal(durationLabel(null),'Duration unavailable');
});

test('managed writing preserves prose and rejects local edits and broken markers', () => {
  const next=managedMarkdown('# Personal writing\n','field-day','Generated');
  assert.ok(next.startsWith('# Personal writing')); assert.equal(managedMarkdown(next,'field-day','Updated','Generated').includes('Updated'),true);
  assert.throws(()=>managedMarkdown(next.replace('Generated','Edited'),'field-day','Updated','Generated'),/local edits/);
  assert.throws(()=>managedMarkdown(next.replace(':end',':broken'),'field-day','Updated','Generated'),/markers/);
});

test('journal notes, passports, merge/split, local reviews and saved queries persist across repository reloads', async () => {
  const {app,files}=memoryVault(), store=new JournalRepository(app);
  const a=visit(), b=visit({arrivedAt:'2026-05-05T10:00:00Z',departedAt:'2026-05-05T11:00:00Z'}), d:ExportShape={visits:[a,b],points:[],exportDate:'2026-05-05T12:00:00Z',sourcePaths:['exports/private.json']};
  const path=await store.writeDay(d,day(a.arrivedAt),{}); files.set(path,files.get(path)!+'\nUser reflection\n'); await store.writeDay(d,day(a.arrivedAt),{}); assert.ok(files.get(path)!.endsWith('User reflection\n'));
  const p=await store.createPassport('Cafe',['Alias'],[a,b],d,{}); assert.ok(files.get(p)!.includes('whereday_type: place')); assert.ok(files.get(p)!.includes('Whereday/Daily/'));
  const id=store.snapshot.places[0].id; await store.updatePassport(id,'Renamed',['Alias'],[visitKey(a)],d,{});
  const second=await store.createPassport('Other',[],[b],d,{}); const id2=store.snapshot.places[1].id;
  await store.updatePassport(id,'Renamed',[],[visitKey(a),visitKey(b)],d,{}); assert.equal(store.snapshot.places[1].visitKeys.length,0); assert.ok(files.has(second));
  await store.review(a,'User checked this',true); const reloaded=new JournalRepository(app); await reloaded.load(); assert.equal(reloaded.snapshot.reviews[visitKey(a)].note,'User checked this'); assert.equal(reloaded.snapshot.places[0].id,id);
  const query={...defaultQuery(),revisit:true}; assert.equal(recallVisits(d,query,reloaded.snapshot).length,2);
  const saved=await store.writeRecall('Revisits',query,d,{}); assert.ok(files.get(saved)!.includes('recall_revisit: true')); assert.ok(files.get(saved)!.includes('exports/private.json'));
  assert.notEqual(id,id2);
});

test('trip editions redact private fields while preserving dates and disclose missing evidence', async () => {
  const {app,files}=memoryVault(), store=new JournalRepository(app), a=visit({locationName:'Secret location',notes:'Private words'});
  const d={visits:[a],points:[],sourcePaths:['secret-path.json']};
  const chapters=tripChapters(d,'2026-05-04','2026-05-05'); assert.equal(chapters.length,2);
  const p=await store.writeTrip('Journey','2026-05-04','2026-05-05',d,{},true), raw=files.get(p)!;
  for(const secret of ['Secret location','Private words','secret-path.json','coordinates:','Places/']) assert.ok(!raw.includes(secret),secret);
  assert.ok(raw.includes('No visit records')); assert.throws(()=>tripChapters(d,'2026-05-05','2026-05-04'),/From/);
});

test('journal render exposes all six capabilities and never writes until an action is activated', async () => {
  const {app,files}=memoryVault(), store=new JournalRepository(app); await store.load();
  const parent=new Element('div'), v=visit(), d={visits:[v],points:[],sourcePaths:['export.json']};
  renderJournal(parent as unknown as HTMLElement,d,{journal:true},day(v.arrivedAt),store,{focus(){},day(){},open:async()=>{},refresh(){}});
  const text=parent.all().map(e=>e.textContent).join('\n');
  for(const phrase of ['Your day','Place Passports','Evidence Review','Trip Chapters','Recall Queries','Create or refresh daily Field Notes']) assert.ok(text.includes(phrase),phrase);
  assert.equal(files.size,0);
  const receipt=new Element('div'); renderReceipt(receipt as unknown as HTMLElement,d,()=>{}); assert.ok(receipt.all().some(e=>e.textContent==='Snapshot date unavailable'));
});

test('native table metadata preserves numeric evidence and malformed metadata cannot break visits', async () => {
  const metadata = JSON.stringify({originalLatitude:'11.1',placeDistanceMeters:'12.5',confirmedAt:'2026-05-04T12:00:00Z'});
  const csv = 'arrived_at,latitude,longitude,visit_metadata\n2026-05-04T10:00:00Z,10,20,"'+metadata.replace(/"/g,'""')+'"\n';
  const app={vault:{adapter:{read:async()=>csv}}} as unknown as App;
  const d=await loadExport(app,'v.csv'); assert.equal(d.visits?.[0].originalLatitude,11.1); assert.equal(d.visits?.[0].placeDistanceMeters,12.5);
});

test('invalid ranges reject and shared segments never bridge midnight, equal times or long gaps', async () => {
  const {trackSegments,rangeData}=await import('../src/journal');
  const points=['2026-05-04T12:00:00Z','2026-05-04T12:01:00Z','2026-05-04T13:01:00Z','2026-05-04T13:01:00Z'].map((timestamp,i)=>({timestamp,latitude:10+i/100,longitude:20}));
  assert.deepEqual(trackSegments(points).map(s=>s.length),[2,1,1]);
  assert.equal(rangeData({visits:[],points},'2026-05-06','2026-05-06').points?.length,0);
  assert.throws(()=>rangeData({visits:[],points},'2026-05-06','2026-05-05'),/From/);
});

test('generated live daily/trip views keep explicit source scope, while public edition has no source block', async () => {
  const {app,files}=memoryVault(), store=new JournalRepository(app), d={visits:[visit()],points:[],sourcePaths:['exports/actual.json']};
  const daily=await store.writeDay(d,day(visit().arrivedAt),{});
  assert.ok(files.get(daily)!.includes('journal: true')); assert.ok(files.get(daily)!.includes('## My reflections'));
  const trip=await store.writeTrip('Private','2026-05-04','2026-05-04',d,{},false);
  assert.ok(files.get(trip)!.includes('from: "2026-05-04"')); assert.ok(files.get(trip)!.includes('exports/actual.json'));
});

test('completed midnight stays do not bleed into the following journal day; overlaps occupy distinct lanes', () => {
  const midnight=new Date(2026,4,5,0), v=visit({arrivedAt:new Date(2026,4,4,23).toISOString(),departedAt:midnight.toISOString()});
  assert.equal(dayVisits({visits:[v],points:[]},'2026-05-05').length,0);
  const a=visit({arrivedAt:new Date(2026,4,5,1).toISOString(),departedAt:new Date(2026,4,5,3).toISOString()}), b={...a,latitude:11};
  assert.deepEqual(dialStays({visits:[a,b],points:[]},'2026-05-05').map(s=>s.lane),[0,1]);
});

test('passport properties refresh counts and aliases while preserving manually added aliases', async () => {
  const {app,files,properties}=memoryVault(), store=new JournalRepository(app), a=visit(), d={visits:[a],points:[]};
  const path=await store.createPassport('First',['Old'],[a],d,{}), id=store.snapshot.places[0].id;
  properties.get(path)!.aliases=['First','Old','User alias'];
  await store.updatePassport(id,'Renamed',['New'],[visitKey(a)],d,{});
  assert.deepEqual(properties.get(path)!.aliases,['User alias','Renamed','New']);
  assert.equal(properties.get(path)!.whereday_visits,1);
  const body=files.get(path)!; files.set(path,body.replace('# Renamed','# User-edited'));
  await assert.rejects(store.updatePassport(id,'Overwritten',[],[visitKey(a)],d,{}),/local edits/);
  assert.equal(store.snapshot.places[0].title,'Renamed'); assert.ok(files.get(path)!.includes('# User-edited'));
});

test('a failed refresh retains the last rendered map and successful recovery replaces it', async () => {
  const {MapRenderChild}=await import('../src/render/map-block');
  const {DEFAULT_SETTINGS}=await import('../src/settings');
  const {maps}=await import('./host/leaflet');
  const parent=new Element('div'); let raw=JSON.stringify({visits:[visit()]});
  const app={vault:{adapter:{stat:async()=>({type:'file'}),read:async()=>raw}}} as unknown as App;
  const old=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}}});
  const renderer=new MapRenderChild(parent as unknown as HTMLElement,app,DEFAULT_SETTINGS,{source:'export.json',show_receipt:true},{} as never);
  const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
  maps.length=0;
  try {
    renderer.onload(); await settle(); assert.equal(maps.length,1);
    raw='{'; parent.all().find(e=>e.tag==='button' && e.textContent==='Refresh exports')!.dispatch('click'); await settle();
    assert.equal(maps.length,1); assert.equal(maps[0].removed,false); assert.ok(parent.all().some(e=>e.textContent.includes('last successful snapshot')));
    raw=JSON.stringify({visits:[visit(),visit({latitude:11})]}); parent.all().find(e=>e.tag==='button' && e.textContent==='Refresh exports')!.dispatch('click'); await settle();
    assert.equal(maps.length,2); assert.equal(maps[0].removed,true);
  } finally { renderer.onunload(); if(old) Object.defineProperty(globalThis,'window',old); else Reflect.deleteProperty(globalThis,'window'); }
});

test('the Places Base is scoped to passports and preserves a user-customized existing Base', async () => {
  const {app,files}=memoryVault(), store=new JournalRepository(app);
  const path=await store.createPlacesBase({places_folder:'Trips/Places'});
  assert.ok(path.endsWith('.base')); assert.ok(files.get(path)!.includes('note.whereday_type')); assert.ok(files.get(path)!.includes('Trips/Places'));
  files.set(path,'User customized YAML'); await store.createPlacesBase({places_folder:'Trips/Places'}); assert.equal(files.get(path),'User customized YAML');
  await assert.rejects(store.createPlacesBase({places_folder:'../outside'}),/vault-relative/);
});

test('the Field Journal command inserts a ready-to-parse block using the configured source folder', async () => {
  const {default:Plugin}=await import('../src/main');
  const {commands,setPluginData}=await import('./host/obsidian');
  setPluginData({exportsFolder:'Location exports'});
  const plugin=new Plugin({} as App,{} as never); await plugin.onload();
  let inserted=''; commands.get('insert-field-journal')!.editorCallback({replaceSelection:(text:string)=>{inserted=text;}});
  const cfg=parseBlockConfig(inserted.replace(/^```whereday\n/,'').replace(/```\n$/,''));
  assert.equal(cfg.source,'Location exports'); assert.equal(cfg.journal,true); assert.equal(cfg.tile_provider,'none'); assert.equal(cfg.auto_refresh,true);
});
