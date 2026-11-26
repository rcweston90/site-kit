import { JSDOM } from 'jsdom';

// A browser-like global for the component tests, set up before React loads.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/admin/blog', pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Element', 'SVGElement', 'SVGSVGElement', 'Node', 'NodeFilter', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'StorageEvent', 'MutationObserver', 'localStorage', 'sessionStorage', 'DOMException', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(g, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no canvas, matchMedia, IntersectionObserver or ResizeObserver: the editor degrades without them.
(dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => null }).getContext = () => null;
(dom.window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as unknown as MediaQueryList;
export { dom };
class InertObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
for (const key of ['IntersectionObserver', 'ResizeObserver']) {
  Object.defineProperty(g, key, { value: InertObserver, configurable: true, writable: true });
  Object.defineProperty(dom.window, key, { value: InertObserver, configurable: true, writable: true });
}
g.HTMLImageElement = dom.window.HTMLImageElement;
g.HTMLVideoElement = dom.window.HTMLVideoElement;
g.HTMLMediaElement = dom.window.HTMLMediaElement;
g.DragEvent = dom.window.MouseEvent;
(dom.window.HTMLMediaElement.prototype as unknown as { play: () => Promise<void>; pause: () => void }).play = () => Promise.resolve();
(dom.window.HTMLMediaElement.prototype as unknown as { pause: () => void }).pause = () => {};
dom.window.Element.prototype.scrollIntoView = function scrollIntoView() {};
// ProseMirror measures layout; jsdom has none, so these answer with empty boxes.
const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return {}; } }) as DOMRect;
const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
for (const proto of [dom.window.Range.prototype, dom.window.Element.prototype] as unknown as { getBoundingClientRect: () => DOMRect; getClientRects: () => DOMRectList }[]) {
  proto.getBoundingClientRect ??= emptyRect;
  proto.getClientRects ??= emptyRects;
}
(dom.window.document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;
for (const key of ['Range', 'Selection', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLSelectElement', 'InputEvent', 'FocusEvent', 'PointerEvent', 'ClipboardEvent', 'File', 'Blob', 'FileReader', 'DataTransfer', 'getSelection', 'Text', 'DocumentFragment', 'CSS']) {
  const value = (dom.window as unknown as Record<string, unknown>)[key];
  if (value !== undefined) Object.defineProperty(g, key, { value, configurable: true, writable: true });
}
const css = (dom.window as unknown as { CSS?: { escape?: (v: string) => string } });
if (!css.CSS?.escape) {
  const escape = (value: string) => value.replace(/[^\w-]/g, (c) => `\\${c}`);
  Object.defineProperty(g, 'CSS', { value: { escape, supports: () => false }, configurable: true, writable: true });
  Object.defineProperty(dom.window, 'CSS', { value: { escape, supports: () => false }, configurable: true, writable: true });
}
