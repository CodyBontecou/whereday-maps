import type { App } from "obsidian";

/** Real wiki links must exist in Markdown for Obsidian's backlink index.
 * This is invoked only by the explicitly labeled user-action button. */
export function appendPlaceLinks(markdown: string, rawTargets: string[]): string {
	const targets = [...new Set(rawTargets)].filter(target => target && !/[\[\]|#^\r\n]/.test(target) && !target.startsWith("/") && !target.split("/").includes("..")).slice(0, 250);
	const missing = targets.filter(target => !markdown.includes(`[[${target}]]`));
	if (!missing.length) return markdown;
	return `${markdown.replace(/\s*$/, "")}\n\n<!-- whereday place backlinks -->\n${missing.map(target => `- [[${target}]]`).join("\n")}\n`;
}
export async function insertPlaceLinks(app: App, sourcePath: string, targets: string[]): Promise<void> {
	const note = app.vault.getFileByPath(sourcePath);
	if (!note || note.extension !== "md") throw new Error("Cannot find the source Markdown note for place links.");
	await app.vault.process(note, markdown => appendPlaceLinks(markdown, targets));
}
