/**
 * Native windows for floating panels. The page opens them itself (`window.open` of a blank
 * page in the same renderer process), so panel DOM moves into them unchanged and React renders
 * into them through portals. The platform (Electron) only shapes and positions them.
 *
 * Windows are opened and closed outside React: `release` closes a window only after the
 * current task, so a quick re-acquire (React StrictMode, a drag that ends floating) keeps the
 * same window instead of flashing a new one.
 */

export interface FloatBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the platform provides for native floating windows. */
export interface FloatingBackend {
  /** Moves/resizes the window named `name`; the first call shows it without taking the focus. */
  setBounds(name: string, bounds: FloatBounds & { opacity?: number }): void;
  /** The system moved or resized a floating window. */
  onMoved(cb: (name: string, bounds: FloatBounds) => void): () => void;
  /** A floating window was closed by the system or the user (e.g. ⌘W). */
  onClosed(cb: (name: string) => void): () => void;
  /** Desktop position of the main window's content area (logical pixels). */
  contentOrigin(): Promise<{ x: number; y: number }>;
}

export const FLOAT_WINDOW_PREFIX = 'dc-float:';
/** Bounds reports this soon after our own move are echoes of it. */
const ECHO_MS = 400;

export interface FloatWindow {
  id: string;
  name: string;
  win: Window;
  doc: Document;
}

interface Entry extends FloatWindow {
  closeTimer: ReturnType<typeof setTimeout> | null;
  lastSet: number;
  dispose: () => void;
}

let counter = 0;

export class NativeWindowPool {
  private readonly entries = new Map<string, Entry>();
  private readonly ids = new Map<string, string>();

  /** `beforeClose` runs right before a window closes (take the panel's DOM out of it). */
  constructor(
    private readonly backend: FloatingBackend,
    private readonly beforeClose: (id: string, doc: Document) => void,
  ) {}

  acquire(id: string, bounds: FloatBounds, title: string): FloatWindow | null {
    const existing = this.entries.get(id);
    if (existing && !existing.win.closed) {
      if (existing.closeTimer) clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
      return existing;
    }
    if (existing) this.drop(existing);
    // A fresh name each time: a window that is still closing is never reused by name.
    const name = `${FLOAT_WINDOW_PREFIX}${id}:${++counter}`;
    const features = `popup,left=${Math.round(bounds.x)},top=${Math.round(bounds.y)},width=${Math.round(bounds.width)},height=${Math.round(bounds.height)}`;
    const win = window.open('about:blank', name, features);
    if (!win) return null;
    const entry: Entry = { id, name, win, doc: win.document, closeTimer: null, lastSet: 0, dispose: prepareWindow(win, title) };
    this.entries.set(id, entry);
    this.ids.set(name, id);
    return entry;
  }

  /** Closes the panel's window after the current task unless it is acquired again. */
  release(id: string): void {
    const e = this.entries.get(id);
    if (!e || e.closeTimer) return;
    e.closeTimer = setTimeout(() => this.close(e), 0);
  }

  setBounds(id: string, bounds: FloatBounds, opacity = 1): void {
    const e = this.entries.get(id);
    if (!e || e.win.closed) return;
    e.lastSet = Date.now();
    this.backend.setBounds(e.name, { ...bounds, opacity });
  }

  /**
   * The panel whose window the system moved, or null for echoes of our own moves and for
   * windows that are no longer ours.
   */
  movedBySystem(name: string): string | null {
    const id = this.ids.get(name);
    const e = id ? this.entries.get(id) : undefined;
    if (!e || Date.now() - e.lastSet < ECHO_MS) return null;
    return e.id;
  }

  /** The panel whose window the system closed (null if we closed it ourselves). */
  closedBySystem(name: string): string | null {
    const id = this.ids.get(name);
    const e = id ? this.entries.get(id) : undefined;
    if (!e) return null;
    this.close(e);
    return e.id;
  }

  closeAll(): void {
    for (const e of [...this.entries.values()]) this.close(e);
  }

  private close(e: Entry): void {
    if (e.closeTimer) clearTimeout(e.closeTimer);
    e.closeTimer = null;
    if (this.entries.get(e.id) !== e) return;
    this.beforeClose(e.id, e.doc);
    this.drop(e);
    if (!e.win.closed) e.win.close();
  }

  private drop(e: Entry): void {
    e.dispose();
    this.entries.delete(e.id);
    this.ids.delete(e.name);
  }
}

/**
 * Makes a blank window look like the app: the main document's stylesheets and root attributes
 * (skin, language) are mirrored, and keys go on to the main window so app shortcuts work.
 */
function prepareWindow(win: Window, title: string): () => void {
  const doc = win.document;
  doc.title = title;
  doc.body.className = 'dock-float-body';

  const root = document.documentElement;
  const syncAttributes = () => {
    for (const a of [...doc.documentElement.attributes]) if (!root.hasAttribute(a.name)) doc.documentElement.removeAttribute(a.name);
    for (const a of [...root.attributes]) doc.documentElement.setAttribute(a.name, a.value);
  };

  const clones = new Map<Element, Element>();
  const syncStyles = () => {
    const sources = [...document.head.querySelectorAll('link[rel="stylesheet"], style')];
    for (const [src, copy] of clones) {
      if (!sources.includes(src)) {
        copy.remove();
        clones.delete(src);
      }
    }
    for (const src of sources) {
      let copy = clones.get(src);
      if (src instanceof HTMLLinkElement) {
        if (!copy) {
          copy = doc.createElement('link');
          copy.setAttribute('rel', 'stylesheet');
          doc.head.appendChild(copy);
          clones.set(src, copy);
        }
        if ((copy as HTMLLinkElement).href !== src.href) (copy as HTMLLinkElement).href = src.href;
      } else {
        if (!copy) {
          copy = doc.createElement('style');
          doc.head.appendChild(copy);
          clones.set(src, copy);
        }
        if (copy.textContent !== src.textContent) copy.textContent = src.textContent;
      }
    }
  };
  syncAttributes();
  syncStyles();
  const attrObserver = new MutationObserver(syncAttributes);
  attrObserver.observe(root, { attributes: true });
  const styleObserver = new MutationObserver(syncStyles);
  styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });

  const forward = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const t = e.target as Element | null;
    if (t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const copy = new KeyboardEvent(e.type, {
      key: e.key, code: e.code, location: e.location, repeat: e.repeat,
      ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      bubbles: true, cancelable: true,
    });
    document.body.dispatchEvent(copy);
    if (copy.defaultPrevented) e.preventDefault();
  };
  win.addEventListener('keydown', forward);
  win.addEventListener('keyup', forward);

  return () => {
    attrObserver.disconnect();
    styleObserver.disconnect();
    if (!win.closed) {
      win.removeEventListener('keydown', forward);
      win.removeEventListener('keyup', forward);
    }
  };
}
