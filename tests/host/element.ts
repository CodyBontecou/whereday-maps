// Minimal Obsidian DOM host for behavior tests, not a browser/layout simulator.
export class Element {
  children: Element[] = [];
  attributes: Record<string, string> = {};
  events: Record<string, ((event: { preventDefault(): void }) => void)[]> = {};
  textContent = '';
  style: Record<string, unknown> = { setProperty: (key: string, value: string) => { this.style[key] = value; } };
  addClass(cls: string) { this.cls += ` ${cls}`; }
  removeClass(cls: string) { this.cls = this.cls.split(' ').filter(c => c !== cls).join(' '); }
  parent?: Element;
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  prepend(child: Element) { child.remove(); this.children.unshift(child); child.parent = this; }
  before(_element: Element) {}
  scrolled = false;
  scrollIntoView() { this.scrolled = true; }
  getBoundingClientRect() { return { width: 400, height: 300 }; }
  value = '';
  type = '';
  constructor(public tag: string, public cls = '') {}
  createEl(tag: string, options: { cls?: string; text?: string } = {}) {
    const child = new Element(tag, options.cls);
    child.textContent = options.text ?? '';
    child.parent = this;
    this.children.push(child);
    return child;
  }
  createDiv(options: { cls?: string }) { return this.createEl('div', options); }
  createSpan(options: { cls?: string }) { return this.createEl('span', options); }
  empty() { this.children = []; }
  getAttribute(key: string) { return this.attributes[key] ?? null; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(event: string, callback: (event: { preventDefault(): void }) => void) { (this.events[event] ??= []).push(callback); }
  dispatch(event: string) { for (const callback of this.events[event] ?? []) callback({ preventDefault() {} }); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
}
