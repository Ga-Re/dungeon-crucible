/**
 * One persistent DOM element per panel. React renders the panel's content into it once (via a
 * portal); docking, collapsing and floating only move this element between slots, so the
 * content keeps its state. Browsers reset scroll positions when an element leaves the
 * document, so the pool records them as they change and restores them after each move.
 */

export class PanelPool {
  private readonly hosts = new Map<string, HTMLDivElement>();
  private readonly scroll = new Map<string, Map<Element, [number, number]>>();
  private parking: HTMLElement | null = null;

  host(id: string, doc: Document = document): HTMLDivElement {
    let h = this.hosts.get(id);
    if (!h) {
      h = doc.createElement('div');
      h.className = 'dock-host';
      h.dataset['panel'] = id;
      const positions = new Map<Element, [number, number]>();
      this.scroll.set(id, positions);
      // Scroll events do not bubble; capture them for every scroller inside the panel.
      h.addEventListener(
        'scroll',
        (e) => {
          const el = e.target;
          if (el instanceof Element && el.isConnected) positions.set(el, [el.scrollTop, el.scrollLeft]);
        },
        { capture: true, passive: true },
      );
      this.hosts.set(id, h);
    }
    return h;
  }

  /** Hidden container for panels that are mounted but not shown (collapsed, closed). */
  setParking(el: HTMLElement | null): void {
    this.parking = el;
  }

  /** Puts the panel's element into `slot` (no-op if it is already there). */
  attach(id: string, slot: HTMLElement): void {
    const h = this.host(id);
    if (h.parentElement === slot) return;
    if (h.ownerDocument !== slot.ownerDocument) slot.ownerDocument.adoptNode(h);
    slot.appendChild(h);
    this.restore(id, h);
  }

  /** Takes the panel out of view, keeping it mounted. */
  park(id: string): void {
    const h = this.hosts.get(id);
    if (!h || !this.parking || h.parentElement === this.parking) return;
    if (h.ownerDocument !== this.parking.ownerDocument) this.parking.ownerDocument.adoptNode(h);
    this.parking.appendChild(h);
  }

  private restore(id: string, h: HTMLElement): void {
    const positions = this.scroll.get(id);
    if (!positions) return;
    for (const [el, [top, left]] of positions) {
      if (!h.contains(el)) {
        positions.delete(el);
        continue;
      }
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  }
}
