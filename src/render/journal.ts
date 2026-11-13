import { BlockConfig, ExportShape, Visit } from "../types";
import { localDay, sortedVisits } from "../atlas";
import { JournalRepository } from "../journal-repository";
import { dayVisits, dialStays, durationLabel, reviewReasons, visitKey, nearbyVisits, reviewedPlace, defaultQuery, recallVisits, tripChapters, RecallQuery, placeInk, dayStayMinutes, dayArrival } from "../journal";

interface Actions { focus: (visit: Visit) => void; day: (day: string) => void; open: (path: string) => Promise<void>; refresh: () => void; minimum?: (minutes: number) => void }
function button(parent: HTMLElement, text: string, fn: () => void): HTMLButtonElement {
	const b = parent.createEl("button", { text }); b.type = "button"; b.addEventListener("click",fn); return b;
}
function input(parent: HTMLElement, label: string, value = "", type = "text"): HTMLInputElement {
	const wrapper = parent.createEl("label", { cls: "wd-field" }); wrapper.createEl("span",{text:label});
	const field = wrapper.createEl("input"); field.type = type; field.value = value; field.setAttribute("aria-label",label); return field;
}
function select(parent: HTMLElement, label: string, options: [string,string][], value: string): HTMLSelectElement {
	const wrapper = parent.createEl("label",{cls:"wd-field"}); wrapper.createEl("span",{text:label});
	const field = wrapper.createEl("select"); field.setAttribute("aria-label",label);
	for (const [key,text] of options) { const option = field.createEl("option",{text}); option.value = key; }
	field.value = value; return field;
}
function disclosure(parent: HTMLElement, title: string, text: string, open = false): HTMLElement {
	const details = parent.createEl("details",{cls:"wd-disclosure"}); details.open = open; details.createEl("summary",{text:title});
	details.createEl("p",{text,cls:"wd-muted"}); return details.createDiv({cls:"wd-disclosure-body"});
}
function status(parent: HTMLElement): HTMLElement { const el = parent.createEl("p",{cls:"wd-status"}); el.setAttribute("role","status"); return el; }
function action(parent: HTMLElement, label: string, work: () => Promise<unknown>, success: string): void {
	const feedback = status(parent);
	const b = button(parent,label,() => {
		b.disabled = true; feedback.textContent = "Saving…";
		void work().then(() => { feedback.textContent = success; }).catch(e => { feedback.textContent = e instanceof Error ? e.message : "Could not save. Try again."; }).finally(() => { b.disabled = false; });
	});
}
function time(iso: string): string { return new Date(iso).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function visitTitle(v: Visit): string { return v.locationName?.trim() || "Unnamed stop"; }
function visitRows(parent: HTMLElement, visits: Visit[], actions: Actions, store: JournalRepository, day?: string, snapshot?: string): void {
	let page = 0;
	const list = parent.createEl("ol",{cls:"wd-stops"}), nav = parent.createDiv({cls:"wd-row"});
	const update = () => {
		list.empty(); nav.empty();
		for (const v of visits.slice(page*20,(page+1)*20)) {
			const row = list.createEl("li",{cls:`wd-stop wd-ink-${placeInk(v,store.snapshot.places)}`});
			const p = reviewedPlace(v,store.snapshot);
			button(row,`${day ? time(dayArrival(v,day)) : new Date(v.arrivedAt).toLocaleDateString() + " · " + time(v.arrivedAt)} · ${p?.title ?? visitTitle(v)}`,() => actions.focus(v));
			row.createEl("span",{text: day ? `${durationLabel(dayStayMinutes(v,day,snapshot))} in this day` : durationLabel(v.durationMinutes),cls:"wd-mono"});
			row.createEl("small",{text:`${v.source ?? "Source unavailable"} · ${v.confirmationStatus ?? "Status unavailable"}${!v.departedAt ? " · open at export" : ""}`,cls:"wd-muted"});
			if (p) button(row,"Open passport",() => { void actions.open(`${p.path}.md`); });
		}
		if (!visits.length) list.createEl("li",{text:"No stops match these filters."});
		if (page) button(nav,"Previous stops",() => { page--; update(); });
		nav.createEl("span",{text:visits.length ? `${page*20+1}–${Math.min((page+1)*20,visits.length)} of ${visits.length}` : "0 stops",cls:"wd-mono"});
		if ((page+1)*20 < visits.length) button(nav,"More stops",() => { page++; update(); });
	}; update();
}
export function renderReceipt(parent: HTMLElement, data: ExportShape, refresh: () => void, previous?: ExportShape): void {
	parent.empty(); parent.addClass("wd-receipt");
	const newest = [...(data.points ?? []).map(p => p.timestamp), ...(data.visits ?? []).map(v => v.arrivedAt)].filter(t => Number.isFinite(Date.parse(t))).sort((a,b) => Date.parse(b)-Date.parse(a))[0];
	const date = Date.parse(data.exportDate ?? ""), age = Date.now()-date;
	const stale = !Number.isFinite(date) || age > 86400000;
	parent.createEl("p",{text:!Number.isFinite(date) ? "Snapshot date unavailable" : age < -300000 ? "Snapshot is dated in the future · check device clocks" : stale ? "Snapshot older than 24 hours" : "Recent export snapshot",cls:"wd-mono"});
	parent.createEl("p",{text:`Exported ${Number.isFinite(date) ? new Date(date).toLocaleString() : "unknown"} · latest record ${newest ? new Date(newest).toLocaleString() : "unavailable"}`,cls:"wd-muted"});
	if (previous) parent.createEl("p",{text:`Since last successful load: ${(data.visits?.length ?? 0)-(previous.visits?.length ?? 0)} net visits, ${(data.points?.length ?? 0)-(previous.points?.length ?? 0)} net GPS samples.`,cls:"wd-muted"});
	button(parent,"Refresh exports",refresh);
	const details = parent.createEl("details"); details.createEl("summary",{text:"Sources and coverage"});
	details.createEl("p",{text:"A recent snapshot does not prove continuous phone delivery or continuous tracking. Dates use this computer's timezone. Only explicitly configured sources are read."});
	for (const s of data.receipt?.sources ?? []) details.createEl("p",{text:`${s.path} · ${s.visits} visits · ${s.points} samples · ${s.outings} outings${s.duplicateOf ? ` · duplicate snapshot of ${s.duplicateOf}` : ""}`});
	const r = data.receipt;
	if (r) details.createEl("p",{text:`Excluded duplicates: ${r.duplicateVisits} visits, ${r.duplicatePoints} points, ${r.duplicateOutings} outings. Resolved visit revisions: ${r.revisedVisits}. Unresolved ID conflicts: ${r.conflictingVisits}. Legacy records without IDs are deduplicated only when all normalized fields match.`});
}
export function renderJournal(parent: HTMLElement, data: ExportShape, cfg: BlockConfig, selected: string, store: JournalRepository, actions: Actions): void {
	parent.empty(); parent.addClass("wd-journal");
	const header = parent.createDiv({cls:"wd-journal-header"}); header.createEl("p",{text:"WHEREDAY / FIELD JOURNAL",cls:"wd-eyebrow"});
	header.createEl("h3",{text: cfg.journal ? "A day worth remembering" : cfg.show_recall ? "Recall your visits" : cfg.show_chapters ? "Trip chapters" : "Your field journal"});
	if (cfg.journal) {
		const controls = parent.createDiv({cls:"wd-row"}), day = input(controls,"Journal date",selected,"date");
		day.addEventListener("change",() => { if (day.value) actions.day(day.value); });
		const minimum = input(controls,"Hide stops shorter than (minutes)",String(cfg.min_stop_minutes ?? 1),"number"); minimum.min = "0"; minimum.max = "1440";
		const body = parent.createDiv({cls:"wd-day-body"});
		const draw = () => {
			body.empty(); const min = Math.max(0,Math.min(1440,Number(minimum.value)||0));
			const visits = dayVisits(data,selected), visible = visits.filter(v => dayStayMinutes(v,selected,data.exportDate) == null || dayStayMinutes(v,selected,data.exportDate)! >= min);
			body.createEl("p",{text:`${visits.length} observed stops · ${visits.length-visible.length} short stops hidden · ${visits.filter(v => !v.departedAt).length} open at export`,cls:"wd-mono"});
			const dial = body.createDiv({cls:"wd-dial"}); dial.setAttribute("aria-hidden","true");
			for (let i = 0; i < 24; i++) { const tick = dial.createDiv({cls:"wd-dial-tick"}); tick.style.transform = `rotate(${i*15}deg)`; }
			for (const arc of dialStays(data,selected,store.snapshot.places).filter(s => visible.includes(s.visit))) {
				const ring = dial.createDiv({cls:`wd-dial-arc wd-ink-${arc.color}`}); ring.style.inset = `${8+Math.min(arc.lane,5)*7}%`;
				ring.style.background = `conic-gradient(transparent 0% ${arc.start*100}%, var(--wd-place-ink) ${arc.start*100}% ${Math.max(arc.start*100+0.15,arc.end*100)}%, transparent ${Math.max(arc.start*100+0.15,arc.end*100)}% 100%)`;
			}
			const center = dial.createDiv({cls:"wd-dial-center"}); center.createEl("span",{text:selected.slice(5),cls:"wd-mono"}); center.createEl("strong",{text:"Your day"});
			body.createEl("p",{text:"24-hour dial · midnight at top. Overlapping stays use inner rings (crowded lanes share the innermost ring). The list below contains every visible stay. Blank arcs mean no exported stay evidence.",cls:"wd-muted"});
			visitRows(body,visible,actions,store,selected,data.exportDate);
			body.createEl("p",{text:"Overnight stays are clipped to this day. Open visits stop at the export snapshot. Missing data is not a confirmed absence.",cls:"wd-muted"});
			action(body,"Create or refresh daily Field Notes",async () => {
				const path = await store.writeDay(data,selected,{...cfg,min_stop_minutes:min}); await actions.open(path);
			},"Daily note saved. Reflections outside its markers are preserved.");
		}; minimum.addEventListener("change",() => { if (actions.minimum) actions.minimum(Math.max(0,Math.min(1440,Number(minimum.value)||0))); else draw(); }); draw();
	}
	if (cfg.show_passports ?? cfg.journal) renderPassports(parent,data,cfg,store,actions);
	if (cfg.show_review ?? cfg.journal) renderReview(parent,data,store,actions);
	if (cfg.show_chapters ?? cfg.journal) renderChapters(parent,data,cfg,selected,store,actions);
	if (cfg.show_recall ?? cfg.journal) renderRecall(parent,data,cfg,store,actions);
}
function renderReview(parent: HTMLElement, data: ExportShape, store: JournalRepository, actions: Actions): void {
	const section = disclosure(parent,"Evidence Review","Local review never changes confirmation in Whereday. Original and detected fields are export evidence; unconfirmed does not mean incorrect.");
	const mode = select(section,"Review queue",[["pending","Needs local review"],["reviewed","Locally reviewed"],["all","All evidence"]],"pending");
	const list = section.createDiv({cls:"wd-review-list"}); let page = 0;
	const draw = () => {
		list.empty(); const visits = sortedVisits(data.visits ?? []).filter(v => mode.value === "all" || (mode.value === "reviewed" ? !!store.snapshot.reviews[visitKey(v)] : !store.snapshot.reviews[visitKey(v)] && reviewReasons(v).length > 0));
		list.createEl("p",{text:`${visits.length} stops · local annotations are stored in this vault's plugin data`,cls:"wd-mono"});
		for (const v of visits.slice(page*10,(page+1)*10)) {
			const card = list.createEl("details",{cls:"wd-evidence"}); card.createEl("summary",{text:`${new Date(v.arrivedAt).toLocaleString()} · ${visitTitle(v)} · ${reviewReasons(v).join(", ") || "No review flags"}`});
			const dl = card.createEl("dl");
			for (const [key,value] of Object.entries(v)) { dl.createEl("dt",{text:key}); dl.createEl("dd",{text:value == null ? "Not exported" : String(value)}); }
			button(card,"Show evidence on map",() => actions.focus(v));
			const saved = store.snapshot.reviews[visitKey(v)], note = input(card,"Local review note",saved?.note ?? "");
			if (saved) card.createEl("p",{text:`Locally reviewed ${new Date(saved.reviewedAt).toLocaleString()}`});
			action(card,"Save local review",async () => { await store.review(v,note.value,true); draw(); },"Local review saved.");
			if (saved) action(card,"Reopen local review",async () => { await store.review(v,"",false); draw(); },"Returned to pending review.");
		}
		const nav = list.createDiv({cls:"wd-row"});
		if (page) button(nav,"Previous evidence",() => { page--; draw(); });
		if ((page+1)*10 < visits.length) button(nav,"More evidence",() => { page++; draw(); });
	}; mode.addEventListener("change",() => { page=0; draw(); }); draw();
}
function renderPassports(parent: HTMLElement, data: ExportShape, cfg: BlockConfig, store: JournalRepository, actions: Actions): void {
	const section = disclosure(parent,"Place Passports","Assign visits deliberately. Equal names and nearby coordinates are suggestions, not proof of a shared place. Passports are ordinary Markdown notes with properties for Bases.", cfg.show_passports === true);
	action(section,"Open Places Base",async () => { const path = await store.createPlacesBase(cfg); await actions.open(path); },"Places Base opened; existing customizations preserved.");
	const existing = section.createDiv({cls:"wd-passports"});
	const drawExisting = () => {
		existing.empty();
		for (const p of store.snapshot.places) {
			const details = existing.createEl("details"); details.createEl("summary",{text:`${p.title} · ${p.visitKeys.length} assigned identities`});
			const title = input(details,"Passport title",p.title), aliases = input(details,"Passport aliases (comma separated)",p.aliases.join(", "));
			const membership = details.createDiv({cls:"wd-membership"}), selected = new Set(p.visitKeys);
			for (const v of sortedVisits(data.visits ?? []).filter(v => p.visitKeys.includes(visitKey(v)))) {
				const check = input(membership,`${new Date(v.arrivedAt).toLocaleString()} · ${visitTitle(v)}`,"","checkbox"); check.checked = true;
				check.addEventListener("change",() => check.checked ? selected.add(visitKey(v)) : selected.delete(visitKey(v)));
			}
			button(details,"Open passport note",() => { void actions.open(`${p.path}.md`); });
			action(details,"Save passport and membership",async () => { await store.updatePassport(p.id,title.value,aliases.value.split(",").map(a=>a.trim()).filter(Boolean),[...selected],data,cfg); drawExisting(); },"Passport refreshed. Unchecked visits are unassigned.");
			const target = select(details,"Merge into passport",[["","Choose a destination"],...store.snapshot.places.filter(o=>o.id!==p.id).map(o=>[o.id,o.title] as [string,string])],"");
			action(details,"Merge these assignments",async () => {
				const destination = store.snapshot.places.find(o=>o.id===target.value); if (!destination) throw new Error("Choose a different destination passport.");
				await store.updatePassport(destination.id,destination.title,[...new Set([...destination.aliases,p.title,...p.aliases])],[...destination.visitKeys,...p.visitKeys],data,cfg); drawExisting();
			},"Assignments merged. Original note retained.");
		}
		if (!store.snapshot.places.length) existing.createEl("p",{text:"No reviewed passports yet. Create one from a stop below."});
	}; drawExisting();
	const search = input(section,"Find a stop to assign"), candidates = section.createDiv({cls:"wd-candidates"});
	const drawCandidates = () => {
		candidates.empty(); const all = sortedVisits(data.visits ?? []).filter(v => !reviewedPlace(v,store.snapshot));
		const matches = all.filter(v => [v.locationName,v.address,v.arrivedAt].join(" ").toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
		candidates.createEl("p",{text:`${matches.length} unassigned stops match. Showing up to 20; search narrows the list.`,cls:"wd-muted"});
		for (const v of matches.slice(-20).reverse()) {
			const card = candidates.createEl("details"); card.createEl("summary",{text:`${new Date(v.arrivedAt).toLocaleString()} · ${visitTitle(v)}`});
			const name = input(card,"New passport title",v.locationName ?? ""), alias = input(card,"New aliases (comma separated)");
			const nearby = nearbyVisits(v,all), include = input(card,`Include ${nearby.length} unassigned stops within 100 m (review on map first)`,"","checkbox");
			button(card,"Show candidate on map",() => actions.focus(v));
			const assign = select(card,"Assign to existing passport",[["","Create a new passport"],...store.snapshot.places.map(p=>[p.id,p.title] as [string,string])],"");
			action(card,"Save reviewed assignment",async () => {
				const visits = include.checked ? nearby : [v], destination = store.snapshot.places.find(p=>p.id===assign.value);
				if (destination) { await store.updatePassport(destination.id,destination.title,destination.aliases,[...destination.visitKeys,...visits.map(visitKey)],data,cfg); await actions.open(`${destination.path}.md`); }
				else { const path = await store.createPassport(name.value,alias.value.split(","),visits,data,cfg); await actions.open(path); }
				drawExisting(); drawCandidates();
			},"Reviewed assignment saved.");
		}
	}; search.addEventListener("input",drawCandidates); drawCandidates();
}
function renderChapters(parent: HTMLElement, data: ExportShape, cfg: BlockConfig, selected: string, store: JournalRepository, actions: Actions): void {
	const section = disclosure(parent,"Trip Chapters","Choose a date range, review the observed chapters, then save an itinerary. Location-free editions omit place names, coordinates, notes and source paths; dates and times remain.");
	const title = input(section,"Trip title"), row = section.createDiv({cls:"wd-row"}), from = input(row,"Trip from",cfg.from ?? selected,"date"), until = input(row,"Trip until",cfg.until ?? selected,"date");
	const redact = input(section,"Create location-free edition","","checkbox"), preview = section.createDiv();
	button(section,"Preview trip chapters",() => {
		preview.empty(); try { for (const c of tripChapters(data,from.value,until.value)) preview.createEl("p",{text:`${c.day} · ${c.visits.length} stops · ${c.points} clean samples · ${c.gaps} gaps over 30 minutes`}); }
		catch (e) { preview.createEl("p",{text:e instanceof Error ? e.message : "Invalid trip dates"}); }
	});
	action(section,"Save trip chapters",async () => { const path = await store.writeTrip(title.value,from.value,until.value,data,cfg,redact.checked); await actions.open(path); },"Trip note saved. Review before sharing.");
}
function renderRecall(parent: HTMLElement, data: ExportShape, cfg: BlockConfig, store: JournalRepository, actions: Actions): void {
	const section = disclosure(parent,"Recall Queries","Search only loaded sources. Revisit means two or more assigned visits to the same reviewed passport. No cloud service or language model is used.", cfg.show_recall === true);
	const text = input(section,"Search places, aliases, addresses and notes",cfg.query ?? ""), row = section.createDiv({cls:"wd-row"});
	const statusFilter = select(row,"App confirmation",[["any","Any status"],["confirmed","Confirmed"],["corrected","Corrected"],["unconfirmed","Unconfirmed"]],cfg.recall_status ?? "any");
	const minimum = input(row,"Minimum duration (minutes)",String(cfg.recall_min_minutes ?? 0),"number"); minimum.min="0";
	const from = input(row,"Recall from",cfg.from ?? "","date"), until = input(row,"Recall until",cfg.until ?? "","date");
	const revisit = input(section,"Revisited reviewed places only","","checkbox"); revisit.checked = cfg.recall_revisit ?? false;
	const title = input(section,"Saved query name");
	let results: HTMLElement;
	const query = (): RecallQuery => ({ ...defaultQuery(), text:text.value, status:statusFilter.value, minimum:Math.max(0,Number(minimum.value)||0), from:from.value, until:until.value, revisit:revisit.checked });
	const run = () => { results.empty(); try { const matches=recallVisits(data,query(),store.snapshot); results.createEl("p",{text:`${matches.length} matching visits · ${(data.sourcePaths ?? []).length} loaded sources`,cls:"wd-mono"}); visitRows(results,matches,actions,store); } catch(e) { results.createEl("p",{text:e instanceof Error ? e.message : "Invalid query"}); } };
	button(section,"Run local query",run);
	action(section,"Save reproducible query",async () => { const path = await store.writeRecall(title.value,query(),data,cfg); await actions.open(path); },"Query and result snapshot saved.");
	results = section.createDiv({cls:"wd-recall-results"}); run();
}
