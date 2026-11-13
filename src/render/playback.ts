import { LocationPoint } from "../types";
import { playbackPoints } from "../atlas";

type Scheduler = (callback: () => void, delay: number) => () => void;
const timeout: Scheduler = (callback, delay) => { const id = setTimeout(callback, delay); return () => clearTimeout(id); };

export function buildPlayback(parent: HTMLElement, raw: LocationPoint[], onPoint: (point: LocationPoint) => void, schedule: Scheduler = timeout): () => void {
	const points = playbackPoints(raw);
	const wrap = parent.createDiv({ cls: "whereday-playback" });
	wrap.createEl("h5", { text: "Route playback" });
	if (!points.length) { wrap.createEl("p", { text: "No timestamped, non-outlier GPS points to replay. Summary endpoints are not tracks." }); return () => {}; }
	wrap.createEl("p", { text: "Recorded points · 2 points/second. Time gaps are not interpolated.", cls: "whereday-caption" });
	const play = wrap.createEl("button", { text: "Play" }); play.type = "button";
	const slider = wrap.createEl("input", { cls: "whereday-playback-range" });
	slider.type = "range"; slider.min = "0"; slider.max = String(points.length - 1); slider.step = "1";
	slider.setAttribute("aria-label", "Route playback position");
	const label = wrap.createEl("p");
	let index = 0, running = false, disposed = false;
	let cancel: (() => void) | null = null;
	const pause = () => { running = false; cancel?.(); cancel = null; play.textContent = "Play"; };
	const update = () => {
		slider.value = String(index);
		const text = `${index + 1} / ${points.length} · ${new Date(points[index].timestamp).toLocaleString()}`;
		label.textContent = text; slider.setAttribute("aria-valuetext", text);
		onPoint(points[index]);
	};
	const tick = () => {
		if (disposed || !running) return;
		if (index >= points.length - 1) { pause(); return; }
		index++; update();
		if (index === points.length - 1) pause();
		else cancel = schedule(tick, 500);
	};
	play.disabled = points.length < 2;
	play.addEventListener("click", () => {
		if (disposed || points.length < 2) return;
		if (running) { pause(); return; }
		if (index === points.length - 1) { index = 0; update(); }
		running = true; play.textContent = "Pause"; cancel = schedule(tick, 500);
	});
	slider.addEventListener("input", () => {
		if (disposed) return;
		pause(); const value = Number(slider.value);
		index = Number.isFinite(value) ? Math.max(0, Math.min(points.length - 1, Math.round(value))) : 0;
		update();
	});
	update();
	return () => { disposed = true; pause(); };
}
