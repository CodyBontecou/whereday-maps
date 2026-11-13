import * as L from "leaflet";
import { BlockConfig, ExportShape, LocationPoint } from "../types";
import { IsoMeSettings, resolveTileLayer } from "../settings";
import { addBasemap } from "./basemap";
import { durationLabel, dayWindow } from "../journal";
import { localDay, parseDay } from "../atlas";
import { staySegments, StaySegment, daySamples, routeSummary, arrivalCounts, rhythmCounts, moveDay } from "../visualizations";

const labels={"stay-strip":"Stays", "day-dial":"Day dial", "route-card":"Recorded route", "return-calendar":"Returns", "weekly-rhythm":"Weekly rhythm"};
const weekday=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const fmtTime=(value:number)=>new Date(value).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const dayLabel=(day:string)=>parseDay(day)!.toLocaleDateString([],{month:"short",day:"numeric"});
function btn(parent: HTMLElement,text:string,label:string,callback:()=>void): HTMLButtonElement {
	const b=parent.createEl("button",{text});b.type="button";b.setAttribute("aria-label",label);b.addEventListener("click",callback);return b;
}
function stayLabel(s: StaySegment): string {
	return `${s.visit.locationName?.trim()||"Unnamed stop"} · ${fmtTime(s.from)}–${fmtTime(s.until)} · ${durationLabel(s.minutes)}${!s.visit.departedAt ? " · open at snapshot" : ""}`;
}
function details(parent:HTMLElement,text:string):void {
	const d=parent.createEl("details",{cls:"wd-viz-info"});d.createEl("summary",{text:"About this view"});d.createEl("p",{text});
}
function svgEl<K extends keyof SVGElementTagNameMap>(parent:SVGElement|HTMLElement,tag:K,attrs:Record<string,string>):SVGElementTagNameMap[K] {
	const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);parent.appendChild(el);return el;
}

/** A single visualization owns only its DOM/map/timers. It never reads or writes journal state. */
export function renderVisualization(parent:HTMLElement,data:ExportShape,cfg:BlockConfig,anchor:Date,settings:IsoMeSettings,onDateChange?:(day:string)=>void):()=>void {
	const view=cfg.view!;parent.addClass("wd-viz-block");parent.addClass(`wd-viz-${view}-block`);
	if(cfg.appearance!=="native")parent.addClass("wd-appearance");
	const card=parent.createDiv({cls:`wd-viz wd-viz-${view}`});
	const header=card.createDiv({cls:"wd-viz-header"});header.createEl("h3",{text:cfg.title||labels[view]});
	let day=localDay(anchor),disposed=false,stopBody:(()=>void)|undefined;
	const body=card.createDiv({cls:"wd-viz-body"});
	let date:HTMLInputElement|undefined;
	const draw=()=>{
		if(disposed)return;stopBody?.();stopBody=undefined;body.empty();
		if(date)date.value=day;
		if(view==="stay-strip"||view==="day-dial")renderStays(body,data,cfg,day);
		else if(view==="route-card")stopBody=renderRouteCard(body,data,cfg,day,settings);
		else if(view==="return-calendar")renderCalendar(body,data,cfg,day);
		else renderRhythm(body,data,cfg);
	};
	if(view!=="weekly-rhythm") {
		const navigation=header.createDiv({cls:"wd-viz-date"}),month=view==="return-calendar";
		btn(navigation,"‹",month?"Previous month":"Previous day",()=>{day=moveDay(day,-1,month);onDateChange?.(day);draw();});
		date=navigation.createEl("input");date.type="date";date.value=day;date.setAttribute("aria-label","Visualization date");
		date.addEventListener("change",()=>{if(parseDay(date!.value)){day=date!.value;onDateChange?.(day);draw();}});
		btn(navigation,"›",month?"Next month":"Next day",()=>{day=moveDay(day,1,month);onDateChange?.(day);draw();});
	}
	draw();
	return ()=>{disposed=true;stopBody?.();};
}
function renderStays(parent:HTMLElement,data:ExportShape,cfg:BlockConfig,day:string):void {
	const {stays,hidden,hours}=staySegments(data,day,cfg.min_stop_minutes??1);
	const detail=parent.createDiv({cls:"wd-viz-selection"});detail.setAttribute("role","status");detail.setAttribute("aria-live","polite");
	const selection=parent.createEl("select",{cls:"wd-viz-stay-select"});selection.setAttribute("aria-label","Select a stay");
	const choose=(index:number)=>{
		const s=stays[index];if(!s)return;
		selection.value=String(index);detail.empty();const name=detail.createEl("strong",{text:s.visit.locationName?.trim()||"Unnamed stop"});name.title=name.textContent||"";
		detail.createEl("span",{text:`${fmtTime(s.from)}–${fmtTime(s.until)} · ${durationLabel(s.minutes)} · ${s.visit.confirmationStatus||"Status unavailable"}${!s.visit.departedAt?" · open at snapshot":""}`});
	};
	stays.forEach((s,i)=>{const o=selection.createEl("option",{text:stayLabel(s)});o.value=String(i);});
	if(cfg.view==="stay-strip")selection.addClass("wd-viz-sr-only");
	selection.disabled=!stays.length;selection.addEventListener("change",()=>choose(Number(selection.value)));
	if(!stays.length){selection.createEl("option",{text:"No recorded stays"});detail.createEl("span",{text:`No stays on ${dayLabel(day)} match this view.`});}
	const chart=parent.createDiv({cls:cfg.view==="day-dial"?"wd-viz-dial":"wd-viz-strip"});
	// Chart precedes the fixed-size detail region; the native select is its keyboard equivalent.
	detail.before(chart);
	if(cfg.view==="stay-strip") {
		const scroll=chart.createDiv({cls:"wd-viz-strip-scroll"}),track=scroll.createDiv({cls:"wd-viz-strip-track"});
		track.style.height=`${Math.max(1,...stays.map(s=>s.lane+1))*20}px`;
		stays.forEach((s,i)=>{
			const b=btn(track,"",stayLabel(s),()=>choose(i));b.className=`wd-viz-stay wd-ink-${s.ink}`;b.title=stayLabel(s);
			b.style.left=`${s.start*100}%`;b.style.width=`${Math.max(0.1,(s.end-s.start)*100)}%`;b.style.top=`${s.lane*20+3}px`;
			b.addEventListener("pointerenter",()=>choose(i));b.addEventListener("focus",()=>choose(i));
		});
		const axis=chart.createDiv({cls:"wd-viz-axis"});for(const hour of [0,6,12,18,24])axis.createEl("span",{text:String(hour).padStart(2,"0")});
	} else if(typeof document!=="undefined") {
		const svg=svgEl(chart,"svg",{viewBox:"0 0 240 240","aria-hidden":"true",class:"wd-viz-clock"});
		svgEl(svg,"circle",{cx:"120",cy:"120",r:"88",class:"wd-viz-dial-track"});
		for(let hour=0;hour<24;hour++) {
			const angle=hour*Math.PI/12;
			svgEl(svg,"line",{x1:String(120+101*Math.sin(angle)),y1:String(120-101*Math.cos(angle)),x2:String(120+(hour%6===0?108:105)*Math.sin(angle)),y2:String(120-(hour%6===0?108:105)*Math.cos(angle)),class:"wd-viz-clock-tick"});
		}
		stays.forEach((s,i)=>{
			const radius=88-Math.min(s.lane,7)*8,circumference=2*Math.PI*radius,length=Math.max(.25,(s.end-s.start)*circumference);
			const arc=svgEl(svg,"circle",{cx:"120",cy:"120",r:String(radius),class:`wd-viz-dial-stay wd-ink-${s.ink}`,"stroke-dasharray":`${length} ${Math.max(0,circumference-length)}`,"stroke-dashoffset":String(-s.start*circumference),transform:"rotate(-90 120 120)"});
			const title=svgEl(arc,"title",{});title.textContent=stayLabel(s);arc.addEventListener("pointerenter",()=>choose(i));arc.addEventListener("click",()=>choose(i));
		});
		const label=svgEl(svg,"text",{x:"120",y:"119","text-anchor":"middle",class:"wd-viz-clock-date"});label.textContent=dayLabel(day);
		const count=svgEl(svg,"text",{x:"120",y:"136","text-anchor":"middle",class:"wd-viz-clock-count"});count.textContent=`${stays.length} stays`;
	}
	if(stays.length)choose(0);
	parent.createEl("p",{text:`${stays.length} stays${hidden?` · ${hidden} short stops hidden`:""} · ${hours}h local day`,cls:"wd-viz-caption"});
	details(parent,"Loaded visits only. Blank areas are recording gaps, not confirmed absence. Overnight stays are clipped to the selected local day; open visits end at the export snapshot. Use the stay selector to explore with a keyboard. Overlaps use separate strip rows or inner dial rings; more than eight overlapping dial lanes share the innermost ring. On DST days arcs use elapsed fractions of the 23/25-hour local day.");
}
function renderCalendar(parent:HTMLElement,data:ExportShape,cfg:BlockConfig,day:string):void {
	const picker=parent.createEl("select",{cls:"wd-viz-place-select"});picker.setAttribute("aria-label","Filter by exported place name");
	const names=[...new Set((data.visits??[]).map(v=>v.locationName?.trim()).filter((v):v is string=>!!v))].sort((a,b)=>a.localeCompare(b));
	picker.createEl("option",{text:"All stops"}).value="";
	if(cfg.place&&!names.includes(cfg.place))names.unshift(cfg.place);
	for(const name of names)picker.createEl("option",{text:name}).value=name;
	picker.value=cfg.place??"";
	const calendar=parent.createDiv({cls:"wd-viz-calendar"}),selection=parent.createEl("p",{cls:"wd-viz-selection"});selection.setAttribute("role","status");
	const draw=()=>{
		calendar.empty();const month=day.slice(0,7),counts=arrivalCounts(data,month,picker.value);
		const first=parseDay(`${month}-01`)!,last=new Date(first.getFullYear(),first.getMonth()+1,0).getDate(),offset=(first.getDay()+6)%7;
		const max=Math.max(1,...counts.values());
		for(const name of ["M","T","W","T","F","S","S"])calendar.createEl("span",{text:name,cls:"wd-viz-weekday"});
		for(let i=0;i<offset;i++)calendar.createEl("span");
		for(let i=1;i<=last;i++){
			const key=`${month}-${String(i).padStart(2,"0")}`,count=counts.get(key)??0;
			const b=btn(calendar,String(i),`${dayLabel(key)} · ${count} recorded arrivals`,()=>{selection.textContent=`${dayLabel(key)} · ${count} recorded arrivals`;});
			b.title=b.getAttribute("aria-label")!;b.className="wd-viz-calendar-day";b.style.setProperty("--wd-density",String(count? .12+.28*count/max : 0));
			if(key===day)b.setAttribute("aria-current","date");
		}
		selection.textContent=`${first.toLocaleDateString([],{month:"long",year:"numeric"})} · ${[...counts.values()].reduce((a,b)=>a+b,0)} arrivals`;
	};picker.addEventListener("change",()=>{cfg.place=picker.value;draw();});draw();
	details(parent,"Counts are recorded arrivals in loaded sources, using this computer's timezone. Place filtering matches an exported name exactly, ignoring case. Equal names may represent different venues. Empty days mean no matching records, not proof of no visit.");
}
function renderRhythm(parent:HTMLElement,data:ExportShape,cfg:BlockConfig):void {
	const counts=rhythmCounts(data,cfg.place),max=Math.max(1,...counts.reduce((all,row)=>all.concat(row),[]));
	const key=parent.createDiv({cls:"wd-viz-rhythm-key"});for(const hour of ["00","06","12","18","24"])key.createEl("span",{text:hour});
	const grid=parent.createDiv({cls:"wd-viz-rhythm"});grid.setAttribute("role","grid");grid.setAttribute("aria-label","Recorded arrivals by weekday and hour");
	const detail=parent.createEl("p",{text:cfg.place?`Arrivals · ${cfg.place}`:"Select an hour to inspect arrivals",cls:"wd-viz-selection"});detail.setAttribute("role","status");
	const cells:HTMLButtonElement[]=[];
	counts.forEach((row,d)=>{
		const line=grid.createDiv({cls:"wd-viz-rhythm-row"});line.setAttribute("role","row");line.createEl("span",{text:weekday[d].slice(0,1),cls:"wd-viz-weekday"}).setAttribute("aria-label",weekday[d]);
		row.forEach((count,h)=>{
			const text=`${weekday[d]}, ${String(h).padStart(2,"0")}:00–${String(h+1).padStart(2,"0")}:00 · ${count} recorded arrivals`;
			const b=btn(line,"",text,()=>{detail.textContent=text;});b.title=text;b.className="wd-viz-rhythm-cell";b.setAttribute("role","gridcell");b.tabIndex=cells.length===0?0:-1;
			b.style.setProperty("--wd-density",String(count ? .18+.72*count/max : 0));
			b.addEventListener("focus",()=>{for(const cell of cells)cell.tabIndex=cell===b?0:-1;detail.textContent=text;});
			b.addEventListener("keydown",event=>{
				const offset=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:event.key==="ArrowDown"?24:event.key==="ArrowUp"?-24:0;
				if(offset){event.preventDefault();cells[Math.max(0,Math.min(167,cells.indexOf(b)+offset))].focus();}
			});cells.push(b);
		});
	});
	parent.createEl("p",{text:`${counts.reduce((sum,row)=>sum+row.reduce((a,b)=>a+b,0),0)} recorded arrivals · local time`,cls:"wd-viz-caption"});
	details(parent,"Each cell counts visit arrivals in one weekday/hour across loaded sources. Intensity is relative frequency, not dwell time or continuous coverage. Use arrow keys within the grid. No activity type is inferred.");
}
function renderRouteCard(parent:HTMLElement,data:ExportShape,cfg:BlockConfig,day:string,settings:IsoMeSettings):()=>void {
	const points=daySamples(data,day),summary=routeSummary(points);
	if(!points.length){parent.createEl("p",{text:`No recorded GPS samples on ${dayLabel(day)}.`,cls:"wd-viz-empty"});return ()=>{};}
	parent.createEl("p",{text:`${summary.meters<1000?`${Math.round(summary.meters)} m`:`${(summary.meters/1000).toFixed(1)} km`} · ${points.length.toLocaleString()} samples${summary.gaps?` · ${summary.gaps} breaks`:""}`,cls:"wd-viz-caption"});
	const canvas=parent.createDiv({cls:"wd-viz-route-map"});canvas.style.height=`${Math.max(120,Math.min(480,cfg.height??200))}px`;
	const map=L.map(canvas,{zoomControl:true,attributionControl:true,scrollWheelZoom:false});
	const tiles=resolveTileLayer(settings,cfg);if(!addBasemap(map,tiles))canvas.addClass("wd-viz-map-local");
	const layer=L.layerGroup().addTo(map),color=typeof document!=="undefined"&&document.body.classList.contains("theme-dark")?"#E0B565":"#1E2B45";
	const stride=Math.max(1,Math.ceil(points.length/4000));
	for(const segment of summary.segments)if(segment.length>1){const sampled=segment.filter((_,i)=>i===0||i===segment.length-1||i%stride===0);L.polyline(sampled.map(p=>[p.latitude,p.longitude] as L.LatLngTuple),{color,weight:3,opacity:.9}).addTo(layer);}
	const coordinate=(p:LocationPoint):L.LatLngTuple=>[p.latitude,p.longitude];
	const cursor=L.circleMarker(coordinate(points[0]),{radius:6,color,weight:2,fillColor:color,fillOpacity:1}).addTo(layer);
	let fitted=false,disposed=false,index=0,running=false,timer:ReturnType<typeof setTimeout>|undefined;
	const fit=()=>{if(disposed)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;map.invalidateSize({pan:false});if(!fitted){if(points.length===1)map.setView(coordinate(points[0]),cfg.zoom??14);else map.fitBounds(L.latLngBounds(points.map(coordinate)),{padding:[16,16],maxZoom:16,animate:false});fitted=true;}};
	const row=parent.createDiv({cls:"wd-viz-route-controls"});
	const play=btn(row,"Play","Play recorded route",()=>{if(disposed)return;if(running)pause();else if(points.length>1){if(index===points.length-1)index=0;running=true;play.textContent="Pause";play.setAttribute("aria-label","Pause recorded route");update();timer=setTimeout(tick,500);}});
	play.disabled=points.length<2;
	const slider=row.createEl("input");slider.type="range";slider.min="0";slider.max=String(points.length-1);slider.step="1";slider.setAttribute("aria-label","Recorded GPS position");
	btn(row,"Fit","Fit full recorded route",()=>{fitted=false;fit();});
	const label=parent.createEl("p",{cls:"wd-viz-route-position"});label.setAttribute("role","status");
	const pause=()=>{running=false;if(timer!==undefined)clearTimeout(timer);timer=undefined;play.textContent="Play";play.setAttribute("aria-label","Play recorded route");};
	const update=()=>{
		slider.value=String(index);const point=points[index],gap=index?Date.parse(point.timestamp)-Date.parse(points[index-1].timestamp):0;
		const text=`${fmtTime(Date.parse(point.timestamp))} · ${index+1} / ${points.length}${gap>30*60000?` · recording gap ${durationLabel(gap/60000)}`:""}`;
		label.textContent=text;slider.setAttribute("aria-valuetext",text);cursor.setLatLng(coordinate(point));if(index)map.panTo(coordinate(point),{animate:false});
	};
	const tick=()=>{timer=undefined;if(disposed||!running)return;if(index<points.length-1){index++;update();}if(index===points.length-1)pause();else timer=setTimeout(tick,500);};
	slider.addEventListener("input",()=>{if(disposed)return;pause();const value=Number(slider.value);index=Number.isFinite(value)?Math.max(0,Math.min(points.length-1,Math.round(value))):0;update();});
	const visibility=()=>{if(document.hidden)pause();};if(typeof document!=="undefined")document.addEventListener("visibilitychange",visibility);
	const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(fit):null;observer?.observe(canvas);fit();update();
	details(parent,`Recorded points replay at two samples per second. Gaps over 30 minutes break the line and are skipped during playback; no intermediate positions are invented. Outliers are excluded. ${tiles.enabled?"Basemap uses your configured tile provider.":"Local track only; no basemap tile requests."}`);
	return ()=>{disposed=true;pause();observer?.disconnect();if(typeof document!=="undefined")document.removeEventListener("visibilitychange",visibility);map.remove();};
}
