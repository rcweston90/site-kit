import { JSDOM } from 'jsdom';

// A browser-like global for the component tests, set up before React loads.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/docs/intro', pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Element', 'SVGElement', 'SVGSVGElement', 'Node', 'NodeFilter', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'StorageEvent', 'MutationObserver', 'localStorage', 'sessionStorage', 'DOMException', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(g, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no canvas, matchMedia or popover API: X-ray degrades without them.
(dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => null }).getContext = () => null;
(dom.window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as unknown as MediaQueryList;
export { dom };
