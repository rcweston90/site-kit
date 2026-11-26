import { JSDOM } from 'jsdom';

// A browser-like global for the component tests, set up before React loads.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://admin.example/admin/shots', pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'localStorage', 'sessionStorage', 'DOMException', 'getComputedStyle', 'requestAnimationFrame']) {
  Object.defineProperty(g, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
export { dom };
