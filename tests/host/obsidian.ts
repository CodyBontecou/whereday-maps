// Minimal host boundaries; no real Obsidian lifecycle or DOM is simulated.
import type { Element } from './element';
export class MarkdownRenderChild {
  constructor(public containerEl: Element) {}
  registeredEvents: unknown[] = [];
  registerDomEvent() {}
  registerEvent(ref: unknown) { this.registeredEvents.push(ref); }
}
export let pluginData: unknown = null;
export const savedData: unknown[] = [];
export const commands = new Map<string, {editorCallback: (editor: any) => void}>();
export const processors = new Map<string, (...args: any[]) => unknown>();
export function setPluginData(data: unknown) { pluginData = data; savedData.length = 0; processors.clear(); commands.clear(); }
export class Plugin {
  constructor(public app: unknown, public manifest: unknown) {}
  async loadData() { return pluginData; }
  async saveData(data: unknown) { savedData.push(data); }
  registerMarkdownCodeBlockProcessor(language: string, callback: (...args: any[]) => unknown) { processors.set(language, callback); }
  addSettingTab() {}
  addCommand(command: {id: string; editorCallback: (editor: any) => void}) { commands.set(command.id,command); }
}
export class PluginSettingTab {}
export class Setting {}
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '');
