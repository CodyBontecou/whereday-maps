import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { JournalState, emptyJournalState, PlacePassport, visitKey, markdownText, wikiLink, visitLine, fieldNotes, RecallQuery, recallVisits, tripChapters } from "./journal";
import { localDay, placeTarget } from "./atlas";
import { ExportShape, Visit, BlockConfig } from "./types";

interface SavedState extends JournalState { sections: Record<string, string> }
const initial = (): SavedState => ({ ...emptyJournalState(), sections: {} });
const stores = new WeakMap<App, JournalRepository>();
export function journalRepository(app: App): JournalRepository {
	let store = stores.get(app); if (!store) { store = new JournalRepository(app); stores.set(app,store); } return store;
}
function safeFolder(folder: string): string {
	if (!folder.trim() || folder.startsWith("/") || folder.split(/[\\/]/).some(p => p === ".." || p.startsWith("."))) throw new Error("Choose a visible vault-relative folder without traversal.");
	return normalizePath(folder);
}
function notePath(folder: string, title: string): string {
	const target = placeTarget(title,safeFolder(folder));
	if (!target) throw new Error("Give the note a title.");
	return `${target}.md`;
}
function sectionKey(path: string, key: string): string { return JSON.stringify([path,key]); }
/** Exact baseline comparison protects manually edited generated sections. */
export function managedMarkdown(markdown: string, key: string, body: string, baseline?: string): string {
	if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Invalid section identity.");
	const begin = `<!-- whereday:${key}:start -->`, end = `<!-- whereday:${key}:end -->`;
	const a = markdown.indexOf(begin), b = markdown.indexOf(end);
	const replacement = `${begin}\n${body}\n${end}`;
	if (a < 0 && b < 0) return `${markdown.replace(/\s*$/, "")}\n\n${replacement}\n`;
	if (a < 0 || b < a || markdown.indexOf(begin,a+begin.length) >= 0 || markdown.indexOf(end,b+end.length) >= 0) throw new Error("Managed section markers were edited. Restore them or use another note.");
	const current = markdown.slice(a+begin.length+1,b).replace(/\n$/, "");
	if (current !== body && current !== baseline) throw new Error("This generated section has local edits. Preserve them outside its markers before refreshing.");
	return markdown.slice(0,a) + replacement + markdown.slice(b+end.length);
}
function parseState(raw: string): SavedState {
	const s = JSON.parse(raw) as SavedState;
	if (s.version !== 1 || !Array.isArray(s.places) || !s.reviews || !s.sections) throw new Error("Unsupported journal state. Restore its backup before continuing.");
	for (const [key, value] of Object.entries(s.sections)) if (typeof key !== "string" || typeof value !== "string") throw new Error("Invalid managed-section state.");
	for (const value of Object.values(s.reviews)) if (!value || typeof value.note !== "string" || typeof value.reviewedAt !== "string") throw new Error("Invalid review state.");
	for (const p of s.places) if (!p.id || typeof p.title !== "string" || typeof p.path !== "string" || p.path.startsWith("/") || p.path.split(/[\\/]/).some(part => part.startsWith(".")) || /[\[\]|#^\r\n]/.test(p.path) || !Array.isArray(p.visitKeys) || !Array.isArray(p.aliases) || !p.visitKeys.every(k => typeof k === "string") || !p.aliases.every(k => typeof k === "string")) throw new Error("Invalid passport state. Restore its backup before continuing.");
	return s;
}
function liveBlock(data: ExportShape, options: Record<string, string | number | boolean>): string {
	if (!data.sourcePaths?.length) return "";
	return ["", "### Live Whereday view", "", "```whereday", "sources:", ...data.sourcePaths.map(p => `  - ${JSON.stringify(p)}`),
		...Object.entries(options).map(([key,value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`),
		"tile_provider: none", "```"].join("\n");
}
export class JournalRepository {
	private state = initial();
	private loaded = false;
	private queue: Promise<unknown> = Promise.resolve();
	private listeners = new Set<() => void>();
	constructor(private app: App) {}
	get snapshot(): JournalState { return this.state; }
	private get statePath(): string { return `${this.app.vault.configDir ?? ".obsidian"}/plugins/iso-me-maps/journal-state.json`; }
	async load(): Promise<void> {
		if (this.loaded) return;
		if (await this.app.vault.adapter.exists(this.statePath)) this.state = parseState(await this.app.vault.adapter.read(this.statePath));
		this.loaded = true;
	}
	subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
	private action<T>(work: () => Promise<T>): Promise<T> {
		const next = this.queue.then(async () => {
			await this.load(); const before = JSON.stringify(this.state);
			try { return await work(); } catch (error) { this.state = parseState(before); throw error; }
		});
		this.queue = next.catch(() => {}); return next;
	}
	private async persist(): Promise<void> {
		await this.ensureFolder(this.statePath.slice(0,this.statePath.lastIndexOf("/")));
		if (await this.app.vault.adapter.exists(this.statePath)) await this.app.vault.adapter.write(`${this.statePath}.bak`, await this.app.vault.adapter.read(this.statePath));
		await this.app.vault.adapter.write(this.statePath,JSON.stringify(this.state,null,2));
		for (const listener of this.listeners) { try { listener(); } catch { /* a view cannot invalidate persisted data */ } }
	}
	private async ensureFolder(path: string): Promise<void> {
		let current = "";
		for (const part of path.split("/")) { current = current ? `${current}/${part}` : part; if (!await this.app.vault.adapter.exists(current)) await this.app.vault.createFolder(current); }
	}
	private async writeSection(path: string, key: string, body: string, frontmatter = ""): Promise<void> {
		const id = sectionKey(path,key), file = this.app.vault.getFileByPath(path);
		if (file) await this.app.vault.process(file, markdown => managedMarkdown(markdown,key,body,this.state.sections[id]));
		else {
			await this.ensureFolder(path.slice(0,path.lastIndexOf("/")));
			await this.app.vault.create(path, managedMarkdown(frontmatter,key,body) + (key.startsWith("field-") ? "\n## My reflections\n\n" : ""));
		}
		this.state.sections[id] = body;
	}
	private dailyPath(day: string, cfg: BlockConfig): string { return notePath(cfg.journal_folder ?? "Whereday/Daily",day).replace(/\.md$/i,""); }
	writeDay(data: ExportShape, day: string, cfg: BlockConfig, target?: string): Promise<string> {
		return this.action(async () => {
			const path = target ?? `${this.dailyPath(day,cfg)}.md`;
			if (!path.endsWith(".md") || path.startsWith("/") || path.split("/").includes("..")) throw new Error("Choose a Markdown note in this vault.");
			await this.writeSection(path,`field-${day}`,fieldNotes(data,day,this.state,cfg.min_stop_minutes ?? 1) + liveBlock(data,{
				journal:true,date:day,min_stop_minutes:cfg.min_stop_minutes ?? 1,auto_refresh:true,
				journal_folder:cfg.journal_folder ?? "Whereday/Daily",places_folder:cfg.places_folder ?? "Whereday/Places",trip_folder:cfg.trip_folder ?? "Whereday/Trips"
			}),`---\nwhereday_type: day\ndate: ${day}\n---\n`);
			await this.persist(); return path;
		});
	}
	review(v: Visit, note: string, reviewed: boolean): Promise<void> {
		return this.action(async () => {
			if (reviewed) this.state.reviews[visitKey(v)] = { note: note.trim(), reviewedAt: new Date().toISOString() };
			else delete this.state.reviews[visitKey(v)];
			await this.persist();
		});
	}
	createPassport(title: string, aliases: string[], visits: Visit[], data: ExportShape, cfg: BlockConfig): Promise<string> {
		return this.action(async () => {
			if (!title.trim() || !visits.length) throw new Error("Choose a title and at least one visit.");
			const id = globalThis.crypto.randomUUID(), path = notePath(cfg.places_folder ?? "Whereday/Places",`${title} ${id.slice(0,8)}`);
			const passport: PlacePassport = { id, title: title.trim(), aliases: aliases.map(s => s.trim()).filter(Boolean), visitKeys: [...new Set(visits.map(visitKey))], path: path.replace(/\.md$/i,"") };
			if (this.state.places.some(p => p.visitKeys.some(k => passport.visitKeys.includes(k)))) throw new Error("Some selected visits already belong to a passport. Reassign or split them first.");
			this.state.places.push(passport);
			try { await this.writePassport(passport,data,cfg); await this.persist(); }
			catch (error) { this.state.places = this.state.places.filter(p => p.id !== id); throw error; }
			return path;
		});
	}
	private async writePassport(p: PlacePassport, data: ExportShape, cfg: BlockConfig): Promise<void> {
		const visits = (data.visits ?? []).filter(v => p.visitKeys.includes(visitKey(v))).sort((a,b) => Date.parse(a.arrivedAt)-Date.parse(b.arrivedAt));
		const first = visits[0]?.arrivedAt, last = visits[visits.length-1]?.arrivedAt;
		const body = [`# ${markdownText(p.title)}`, "", `Reviewed aliases: ${p.aliases.map(markdownText).join(", ") || "None"}`, `Visits in loaded sources: ${visits.length} (${p.visitKeys.length} assigned identities).`, `First observed: ${first ?? "Unavailable in loaded sources"}`, `Last observed: ${last ?? "Unavailable in loaded sources"}`, "", ...visits.map(v => `${visitLine(v,this.state)} · ${wikiLink(this.dailyPath(localDay(new Date(v.arrivedAt)),cfg))}`), "", "Only explicitly assigned visits are included. Daily-note links may point to notes you have not created yet."].join("\n");
		const coordinate = visits[0] ? `\ncoordinates: [${visits[0].latitude}, ${visits[0].longitude}]` : "";
		await this.writeSection(`${p.path}.md`,"passport",body,`---\nwhereday_type: place\nwhereday_id: ${p.id}\naliases: ${JSON.stringify(p.aliases)}${coordinate}\n---\n`);
		const file = this.app.vault.getFileByPath(`${p.path}.md`);
		if (file && this.app.fileManager?.processFrontMatter) await this.app.fileManager.processFrontMatter(file, metadata => {
			const previous = [...(Array.isArray(metadata.whereday_aliases) ? metadata.whereday_aliases : []), metadata.whereday_title].filter(value => typeof value === "string");
			const aliases = Array.isArray(metadata.aliases) ? metadata.aliases : typeof metadata.aliases === "string" ? [metadata.aliases] : [];
			metadata.aliases = [...new Set([...aliases.filter((alias: unknown) => typeof alias === "string" && !previous.includes(alias)), p.title, ...p.aliases])];
			metadata.whereday_title = p.title; metadata.whereday_aliases = p.aliases;
			metadata.whereday_visits = visits.length; metadata.whereday_first = first ?? null; metadata.whereday_last = last ?? null;
		});
	}
	updatePassport(id: string, title: string, aliases: string[], keys: string[], data: ExportShape, cfg: BlockConfig): Promise<void> {
		return this.action(async () => {
			const p = this.state.places.find(p => p.id === id);
			if (!p || !title.trim()) throw new Error("Choose a passport and title.");
			const before = { ...p }; p.title = title.trim(); p.aliases = aliases; p.visitKeys = [...new Set(keys)];
			const affected = this.state.places.filter(other => other.id !== id && other.visitKeys.some(k => p.visitKeys.includes(k)));
			for (const other of affected) other.visitKeys = other.visitKeys.filter(k => !p.visitKeys.includes(k));
			try { for (const passport of [...affected,p]) await this.writePassport(passport,data,cfg); await this.persist(); } catch (error) { Object.assign(p,before); throw error; }
		});
	}
	writeTrip(title: string, from: string, until: string, data: ExportShape, cfg: BlockConfig, redact: boolean): Promise<string> {
		return this.action(async () => {
			const chapters = tripChapters(data,from,until), path = notePath(cfg.trip_folder ?? "Whereday/Trips",`${title} ${from} ${until}${redact ? " public" : ""}`);
			if (!title.trim()) throw new Error("Give the trip a title.");
			const body = [`# ${markdownText(title)}`, "", `${from} → ${until} · reviewed date range · ${redact ? "Location-free edition" : "Private edition"}`, "", "Chapters are organized by observed local date. No transport modes, missing routes or border crossings are inferred.", "",
				...chapters.flatMap(c => [`## ${c.day}`, "", `${c.visits.length} observed stops · ${c.points} clean GPS samples · ${c.gaps} gaps over 30 minutes between samples.`, ...c.visits.map(v => visitLine(v,this.state,redact,c.day,data.exportDate)), ...(!c.visits.length ? ["No visit records for this day."] : []), ""]),
				...(redact ? ["Names, place links, coordinates, notes and source paths are omitted. Dates and times remain; review before sharing."] : [`Sources: ${(data.sourcePaths ?? []).map(markdownText).join(", ")}`, `Snapshot: ${data.exportDate ?? "Unavailable"}`])].join("\n");
			await this.writeSection(path,"trip",body + (redact ? "" : liveBlock(data,{from,until,show_timeline:true,show_receipt:true,height:300})),`---\nwhereday_type: trip\nfrom: ${from}\nuntil: ${until}\n---\n`); await this.persist(); return path;
		});
	}
	createPlacesBase(cfg: BlockConfig): Promise<string> {
		return this.action(async () => {
			const folder = safeFolder(cfg.places_folder ?? "Whereday/Places"), path = `${folder}/Place Passports.base`;
			if (!await this.app.vault.adapter.exists(path)) {
				await this.ensureFolder(folder);
				await this.app.vault.create(path,["filters:", "  and:",
					...['file.ext == "md"','note.whereday_type == "place"',`file.inFolder(${JSON.stringify(folder)})`].map(filter => `    - ${JSON.stringify(filter)}`),
					"views:", "  - type: table", "    name: Place Passports", "    order:",
					...['file.name','note.whereday_title','note.whereday_visits','note.whereday_first','note.whereday_last'].map(key => `      - ${key}`), ""].join("\n"));
			}
			return path;
		});
	}

	writeRecall(title: string, query: RecallQuery, data: ExportShape, cfg: BlockConfig): Promise<string> {
		return this.action(async () => {
			if (!title.trim()) throw new Error("Name this saved query.");
			const results = recallVisits(data,query,this.state), path = notePath("Whereday/Queries",title);
			// JSON-quoted YAML-like values prevent user text from injecting fence lines.
			const sources = (data.sourcePaths ?? []).map(p => `  - ${JSON.stringify(p)}`).join("\n");
			const body = [`# ${markdownText(title)}`, "", "Saved local query. Result snapshot below; open this note to run it against its explicit sources.", "", "```whereday", "sources:", sources, "show_recall: true", `query: ${JSON.stringify(query.text)}`, `recall_status: ${query.status}`, `recall_min_minutes: ${query.minimum}`, `recall_revisit: ${query.revisit}`, `from: ${query.from || ""}`, `until: ${query.until || ""}`, "tile_provider: none", "```", "", `## Result snapshot (${results.length})`, "", ...results.map(v => visitLine(v,this.state))].join("\n");
			await this.writeSection(path,"recall",body); await this.persist(); return path;
		});
	}
}
