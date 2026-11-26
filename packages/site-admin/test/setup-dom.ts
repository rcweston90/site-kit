import { JSDOM } from 'jsdom';

// A browser-like global for the component tests, set up before React loads.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example/admin', pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDialogElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'localStorage', 'sessionStorage', 'DOMException', 'getComputedStyle', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'InputEvent', 'FocusEvent', 'requestAnimationFrame']) {
  Object.defineProperty(g, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no <dialog> methods yet.
const proto = (dom.window.HTMLDialogElement ?? dom.window.HTMLElement).prototype as HTMLDialogElement;
proto.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
proto.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
export { dom };
