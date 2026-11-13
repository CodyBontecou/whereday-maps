import { ExportShape, Visit, LocationPoint } from "./types";
import { dayWindow, visitEnd, placeInk, trackSegments } from "./journal";
import { localDay, sortedVisits, playbackPoints, distanceMeters, parseDay } from "./atlas";

export const VISUALIZATION_VIEWS = ["stay-strip", "day-dial", "route-card", "return-calendar", "weekly-rhythm"] as const;
export type VisualizationView = typeof VISUALIZATION_VIEWS[number];
export interface StaySegment { visit: Visit; start: number; end: number; minutes: number; lane: number; ink: number; from: number; until: number }
/** Use elapsed local-day fractions: a DST day can contain 23 or 25 hours. */
export function staySegments(data: ExportShape, day: string, minimum = 1): { stays: StaySegment[]; hidden: number; hours: number } {
	const [start,end] = dayWindow(day), lanes: number[] = []; let hidden = 0;
	const stays: StaySegment[] = [];
	for (const visit of sortedVisits(data.visits ?? [])) {
		const arrival=Date.parse(visit.arrivedAt), departure=visitEnd(visit,data.exportDate);
		if (arrival >= end || (departure <= start && arrival !== start)) continue;
		const from=Math.max(start,arrival), until=Math.min(end,departure), minutes=(until-from)/60000;
		if (minutes < minimum) { hidden++; continue; }
		let lane=lanes.findIndex(value=>value<=from); if(lane<0) lane=lanes.length; lanes[lane]=until;
		stays.push({visit,start:(from-start)/(end-start),end:(until-start)/(end-start),minutes,lane,ink:placeInk(visit),from,until});
	}
	return {stays,hidden,hours:(end-start)/3600000};
}
export function daySamples(data: ExportShape, day: string): LocationPoint[] {
	return playbackPoints(data.points ?? []).filter(p=>localDay(new Date(p.timestamp))===day);
}
export function routeSummary(points: LocationPoint[]): { meters: number; gaps: number; segments: LocationPoint[][] } {
	const segments=trackSegments(points); let meters=0;
	for(const segment of segments) for(let i=1;i<segment.length;i++) meters+=distanceMeters([segment[i-1].latitude,segment[i-1].longitude],[segment[i].latitude,segment[i].longitude]);
	return {meters,gaps:Math.max(0,segments.length-1),segments};
}
export function namedVisits(data: ExportShape, place?: string): Visit[] {
	const name=place?.trim().toLocaleLowerCase();
	return sortedVisits(data.visits ?? []).filter(v=>!name || v.locationName?.trim().toLocaleLowerCase()===name);
}
export function arrivalCounts(data: ExportShape, month: string, place?: string): Map<string,number> {
	if(!/^\d{4}-\d{2}$/.test(month) || !parseDay(`${month}-01`)) throw new Error("Choose a valid calendar month.");
	const counts=new Map<string,number>();
	for(const v of namedVisits(data,place)) {const day=localDay(new Date(v.arrivedAt));if(day.startsWith(month)) counts.set(day,(counts.get(day)??0)+1);}
	return counts;
}
export function rhythmCounts(data: ExportShape, place?: string): number[][] {
	const result=Array.from({length:7},()=>Array<number>(24).fill(0));
	for(const v of namedVisits(data,place)) {const date=new Date(v.arrivedAt);result[(date.getDay()+6)%7][date.getHours()]++;}
	return result;
}
export function moveDay(day: string, direction: number, month = false): string {
	const date=parseDay(day); if(!date) throw new Error("Choose a valid date.");
	if(month) {const old=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+direction);const last=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();date.setDate(Math.min(old,last));}
	else date.setDate(date.getDate()+direction);
	return localDay(date);
}
