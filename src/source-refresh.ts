type Schedule = (callback: () => void, delay: number) => () => void;
const scheduleTimeout: Schedule = (callback, delay) => {
	const timer = setTimeout(callback, delay);
	return () => clearTimeout(timer);
};
const contains = (paths: Set<string>, path: string) => [...paths].some(p => p === path || p.startsWith(path.replace(/\/$/, "") + "/"));

/** File events are hints; only configured-source matches may trigger a read.
 * Creation/rename re-resolves bounded source paths so new dated/glob files work.
 */
export class SourceRefresh {
	private paths = new Set<string>();
	private cancel: (() => void) | null = null;
	private version = 0;
	private stopped = false;
	private pending: { path: string; oldPath?: string; known: boolean }[] = [];
	constructor(private resolve: () => Promise<string[]>, private refresh: () => void, private schedule: Schedule = scheduleTimeout) {}
	track(paths: string[]): void { this.paths = new Set(paths); }
	changed(path: string, kind: "modify" | "create" | "delete" | "rename", oldPath?: string): void {
		if (this.stopped) return;
		const known = contains(this.paths, path) || (!!oldPath && contains(this.paths, oldPath));
		if (kind === "modify" && !known) return;
		if (!known && !/\.(json|geojson|csv|md|markdown|gpx)$/i.test(path)) return;
		this.pending.push({ path, oldPath, known });
		this.cancel?.();
		const version = ++this.version;
		this.cancel = this.schedule(() => {
			this.cancel = null;
			void this.check(version);
		}, 300);
	}
	private async check(version: number): Promise<void> {
		const events = this.pending.slice();
		let next: string[];
		try { next = await this.resolve(); }
		catch {
			if (!this.stopped && version === this.version) {
				this.pending = [];
				if (events.some(e => e.known)) this.refresh();
			}
			return;
		}
		if (this.stopped || version !== this.version) return;
		this.pending = [];
		const paths = new Set(next);
		if (events.some(e => e.known || contains(paths, e.path) || (!!e.oldPath && contains(paths, e.oldPath)))) this.refresh();
	}
	dispose(): void { this.stopped = true; this.version++; this.cancel?.(); this.cancel = null; this.pending = []; }
}
