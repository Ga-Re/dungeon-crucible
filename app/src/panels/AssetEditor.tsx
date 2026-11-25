/**
 * The asset editor (E-27, DC-109) in the Asset Vault's centre: the asset on a 5-ft grid at its
 * size, with its cover mask (circle or polygon, or suggested from its outline), its light, its
 * anchor and door line (E-29) and an effect's behaviour. A command panel holds the options; nothing is saved before OK.
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactElement } from 'react';
import { pixelsToCells } from '../core/assets';
import { outlineFromAlpha, simplifyPath } from '../core/outline';
import type { AssetSidecar } from '../core/sidecar';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { absolutePath, assetUrl } from '../platform/bridge';
import { useStore } from '../app/store';
import { thumbnailUrl } from '../app/thumbs';
import { closeAssetEditor, saveAssetEditor, setEditorTool, updateEditorDraft, type EditorTool } from '../app/vault';

type Pt = [number, number];
type Cover = NonNullable<AssetSidecar['cover']>;

/** Feet per cell on the editor's grid (5-ft squares). */
const FT = 5;
/** Handle size in screen pixels. */
const HANDLE_PX = 9;

const TOOLS: { id: EditorTool; icon: IconName; label: MessageKey }[] = [
  { id: 'select', icon: 'select', label: 'editor.tool.select' },
  { id: 'circle', icon: 'sphere', label: 'editor.tool.circle' },
  { id: 'polygon', icon: 'zone', label: 'editor.tool.polygon' },
];

type Drag = { kind: 'circle-new'; at: Pt } | { kind: 'center' } | { kind: 'radius' } | { kind: 'corner'; index: number } | { kind: 'light' } | { kind: 'anchor' } | { kind: 'door-new'; at: Pt } | { kind: 'door-end'; end: 1 | 2 } | { kind: 'inner-new'; at: Pt; to: Pt };
type InnerKind = NonNullable<AssetSidecar['interior']>['walls'][number]['kind'];

export function AssetEditorView() {
  const { t } = useI18n();
  const editor = useStore((s) => s.vault.editor)!;
  const item = useStore((s) => s.vault.items.find((i) => i.relPath === s.vault.editor?.relPath));
  const { draft, tool } = editor;
  const size = draft.sizeCells ?? { w: 1, h: 1 };
  const svgRef = useRef<SVGSVGElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [path, setPath] = useState<Pt[]>([]);
  const [mouse, setMouse] = useState<Pt | null>(null);
  const [busy, setBusy] = useState(false);
  // The interior (E-29): shown on the stage to draw its walls, doors and windows.
  const [inside, setInside] = useState(false);
  const [innerKind, setInnerKind] = useState<InnerKind>('wall');
  const [innerImage, setInnerImage] = useState<string | null>(null);
  const [innerDraft, setInnerDraft] = useState<[Pt, Pt] | null>(null);
  const innerPath = draft.interior?.asset;
  const showInside = inside && !!draft.interior;
  const drag = useRef<Drag | null>(null);
  const isVideo = /\.(webm|mp4)$/i.test(editor.relPath);

  useEffect(() => {
    let live = true;
    // The full picture to draw over; for a video its thumbnail (a frame).
    if (!isVideo) void absolutePath(editor.relPath).then(assetUrl).then((u) => live && setImage(u));
    if (item) void thumbnailUrl(item.relPath, item.size, item.mtimeMs).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [editor.relPath]);

  useEffect(() => {
    let live = true;
    setInnerImage(null);
    if (innerPath && !/\.(webm|mp4)$/i.test(innerPath)) void absolutePath(innerPath).then(assetUrl).then((u) => live && setInnerImage(u));
    return () => {
      live = false;
    };
  }, [innerPath]);

  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === 'Escape') {
        if (path.length) setPath([]);
        else closeAssetEditor();
      }
      if (e.key === 'Enter') {
        if (path.length) closePolygon();
        else void saveAssetEditor();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const setCover = (cover: Cover | undefined) =>
    updateEditorDraft((a) => {
      const { cover: _c, ...rest } = a;
      return cover ? { ...rest, cover } : rest;
    });

  /** `p` on quarter cells inside the footprint (hinges, edges and door ends sit on them). */
  const quarter = (p: Pt): Pt => {
    const q = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v * 4) / 4));
    return [q(p[0], size.w), q(p[1], size.h)];
  };
  /** The anchor at `p`; wall snapping kept. */
  const setAnchor = (p: Pt) => {
    const [x, y] = quarter(p);
    updateEditorDraft((a) => ({ ...a, anchor: { x, y, wallSnap: a.anchor?.wallSnap ?? false } }));
  };
  const setDoor = (door: NonNullable<AssetSidecar['door']>) => updateEditorDraft((a) => ({ ...a, door }));

  const closePolygon = () => {
    if (path.length >= 3) setCover({ shape: 'polygon', points: path });
    setPath([]);
    setEditorTool('select');
  };

  /** Pointer position in cells of the footprint. */
  const toCells = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];
  };
  /** Cells per screen pixel (for handle sizes). */
  const perPx = () => {
    const m = svgRef.current?.getScreenCTM();
    return m ? 1 / m.a : 0.02;
  };

  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toCells(e);
    const near = (q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]) < HANDLE_PX * perPx();
    if (tool === 'circle') {
      drag.current = { kind: 'circle-new', at: p };
      setCover({ shape: 'circle', x: p[0], y: p[1], r: 0.05 });
      return;
    }
    if (tool === 'polygon') {
      if (path.length >= 3 && near(path[0])) closePolygon();
      else setPath([...path, p]);
      return;
    }
    if (tool === 'light') {
      drag.current = { kind: 'light' };
      updateEditorDraft((a) => (a.light ? { ...a, light: { ...a.light, x: p[0], y: p[1] } } : a));
      return;
    }
    if (tool === 'inner') {
      const at = quarter(p);
      drag.current = { kind: 'inner-new', at, to: at };
      setInnerDraft([at, at]);
      return;
    }
    if (tool === 'door') {
      drag.current = { kind: 'door-new', at: quarter(p) };
      return;
    }
    if (tool === 'anchor') {
      drag.current = { kind: 'anchor' };
      setAnchor(p);
      return;
    }
    // Select: grab a handle of the anchor, the mask or the light.
    const c = draft.cover;
    const d = draft.door;
    if (draft.anchor && near([draft.anchor.x, draft.anchor.y])) drag.current = { kind: 'anchor' };
    else if (d && near([d.x1, d.y1])) drag.current = { kind: 'door-end', end: 1 };
    else if (d && near([d.x2, d.y2])) drag.current = { kind: 'door-end', end: 2 };
    else if (draft.light && near([draft.light.x, draft.light.y])) drag.current = { kind: 'light' };
    else if (c?.shape === 'circle' && near([c.x + c.r, c.y])) drag.current = { kind: 'radius' };
    else if (c?.shape === 'circle' && near([c.x, c.y])) drag.current = { kind: 'center' };
    else if (c?.shape === 'polygon') {
      const index = c.points.findIndex((q) => near(q));
      if (index >= 0) drag.current = { kind: 'corner', index };
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = toCells(e);
    setMouse(p);
    const d = drag.current;
    const c = draft.cover;
    if (!d) return;
    if (d.kind === 'circle-new') setCover({ shape: 'circle', x: d.at[0], y: d.at[1], r: Math.max(0.05, Math.hypot(p[0] - d.at[0], p[1] - d.at[1])) });
    else if (d.kind === 'center' && c?.shape === 'circle') setCover({ ...c, x: p[0], y: p[1] });
    else if (d.kind === 'radius' && c?.shape === 'circle') setCover({ ...c, r: Math.max(0.05, Math.hypot(p[0] - c.x, p[1] - c.y)) });
    else if (d.kind === 'corner' && c?.shape === 'polygon') setCover({ ...c, points: c.points.map((q, i) => (i === d.index ? p : q)) });
    else if (d.kind === 'light') updateEditorDraft((a) => (a.light ? { ...a, light: { ...a.light, x: p[0], y: p[1] } } : a));
    else if (d.kind === 'anchor') setAnchor(p);
    else if (d.kind === 'inner-new') {
      d.to = quarter(p);
      setInnerDraft([d.at, d.to]);
    }
    else if (d.kind === 'door-new') {
      const q = quarter(p);
      if (q[0] !== d.at[0] || q[1] !== d.at[1]) setDoor({ x1: d.at[0], y1: d.at[1], x2: q[0], y2: q[1] });
    } else if (d.kind === 'door-end' && draft.door) {
      const q = quarter(p);
      setDoor(d.end === 1 ? { ...draft.door, x1: q[0], y1: q[1] } : { ...draft.door, x2: q[0], y2: q[1] });
    }
  };

  const onUp = () => {
    // The piece being drawn comes from the drag itself: the state may not have caught up yet.
    if (drag.current?.kind === 'inner-new') {
      const [[x1, y1], [x2, y2]] = [drag.current.at, drag.current.to];
      if (x1 !== x2 || y1 !== y2) updateEditorDraft((a) => (a.interior ? { ...a, interior: { ...a.interior, walls: [...a.interior.walls, { kind: innerKind, x1, y1, x2, y2 }] } } : a));
      setInnerDraft(null);
    }
    if (drag.current?.kind === 'circle-new' || drag.current?.kind === 'door-new' || (drag.current?.kind === 'anchor' && tool === 'anchor')) setEditorTool('select');
    drag.current = null;
  };

  /** A polygon around the opaque part of the picture, to adjust. */
  const suggest = async () => {
    if (!thumb) return;
    setBusy(true);
    try {
      const img = new Image();
      img.src = thumb;
      await img.decode();
      const scale = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h).data;
      const alpha = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
      const outline = outlineFromAlpha(alpha, w, h);
      if (outline) setCover({ shape: 'polygon', points: pixelsToCells(simplifyPath(outline, Math.max(1, w / 64)), w, h, size) });
    } finally {
      setBusy(false);
    }
  };

  const px = perPx();
  const c = draft.cover;
  const l = draft.light;
  // Room around the footprint: one cell, more for a light's reach (at most four).
  const pad = l ? Math.min(4, Math.max(1, Math.ceil(l.dimFt / FT - Math.min(size.w, size.h) / 2))) : 1;
  const lines: ReactElement[] = [];
  for (let x = -pad; x <= size.w + pad; x++) lines.push(<line key={`x${x}`} x1={x} y1={-pad} x2={x} y2={size.h + pad} />);
  for (let y = -pad; y <= size.h + pad; y++) lines.push(<line key={`y${y}`} x1={-pad} y1={y} x2={size.w + pad} y2={y} />);
  return (
    <div className="asset-editor">
      <div className="vault-bar">
        <button className="btn sm" onClick={closeAssetEditor}><Icon name="chev" />{t('editor.back')}</button>
        <b className="asset-editor-name">{draft.name}</b>
        <span className="hint">{t(`editor.hint.${tool}` as MessageKey)}</span>
      </div>
      <div className="asset-stage">
        <svg
          ref={svgRef}
          viewBox={`${-pad} ${-pad} ${size.w + 2 * pad} ${size.h + 2 * pad}`}
          preserveAspectRatio="xMidYMid meet"
          className={`tool-${tool}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={() => tool === 'polygon' && closePolygon()}
          aria-label={t('editor.stage')}
        >
          <g className="asset-grid" strokeWidth={px}>{lines}</g>
          <rect className="asset-footprint" x={0} y={0} width={size.w} height={size.h} strokeWidth={2 * px} />
          {showInside
            ? innerImage && <image href={innerImage} x={0} y={0} width={size.w} height={size.h} preserveAspectRatio="none" />
            : (image ?? thumb) && <image href={image ?? thumb!} x={0} y={0} width={size.w} height={size.h} preserveAspectRatio="none" />}
          {showInside && (
            <g className="asset-inner" strokeWidth={4 * px}>
              {draft.interior!.walls.map((w, i) => <line key={i} className={w.kind} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />)}
              {innerDraft && <line className={innerKind} x1={innerDraft[0][0]} y1={innerDraft[0][1]} x2={innerDraft[1][0]} y2={innerDraft[1][1]} strokeDasharray={`${6 * px} ${4 * px}`} />}
            </g>
          )}
          {l && (
            <g className="asset-light">
              <circle cx={l.x} cy={l.y} r={l.dimFt / FT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${5 * px}`} style={{ stroke: l.color }} />
              <circle cx={l.x} cy={l.y} r={l.brightFt / FT} strokeWidth={1.5 * px} style={{ stroke: l.color }} />
              <circle cx={l.x} cy={l.y} r={HANDLE_PX * px} className="handle" style={{ fill: l.color }} strokeWidth={1.5 * px} />
            </g>
          )}
          {c?.shape === 'circle' && (
            <g className="asset-cover">
              <circle cx={c.x} cy={c.y} r={c.r} strokeWidth={2 * px} />
              <circle className="handle" cx={c.x} cy={c.y} r={HANDLE_PX * 0.6 * px} strokeWidth={1.5 * px} />
              <rect className="handle" x={c.x + c.r - HANDLE_PX * 0.6 * px} y={c.y - HANDLE_PX * 0.6 * px} width={HANDLE_PX * 1.2 * px} height={HANDLE_PX * 1.2 * px} strokeWidth={1.5 * px} />
            </g>
          )}
          {c?.shape === 'polygon' && (
            <g className="asset-cover">
              <polygon points={c.points.map((q) => q.join(',')).join(' ')} strokeWidth={2 * px} />
              {c.points.map((q, i) => (
                <rect key={i} className="handle" x={q[0] - HANDLE_PX * 0.5 * px} y={q[1] - HANDLE_PX * 0.5 * px} width={HANDLE_PX * px} height={HANDLE_PX * px} strokeWidth={1.5 * px} />
              ))}
            </g>
          )}
          {draft.door && (
            <g className="asset-door" strokeWidth={4 * px}>
              <line x1={draft.door.x1} y1={draft.door.y1} x2={draft.door.x2} y2={draft.door.y2} />
              {([[draft.door.x1, draft.door.y1], [draft.door.x2, draft.door.y2]] as Pt[]).map((q, i) => (
                <rect key={i} className="handle" x={q[0] - HANDLE_PX * 0.5 * px} y={q[1] - HANDLE_PX * 0.5 * px} width={HANDLE_PX * px} height={HANDLE_PX * px} strokeWidth={1.5 * px} />
              ))}
            </g>
          )}
          {draft.anchor && (
            <g className="asset-anchor" strokeWidth={2 * px}>
              <circle cx={draft.anchor.x} cy={draft.anchor.y} r={HANDLE_PX * 0.7 * px} className="handle" />
              <path d={`M${draft.anchor.x - HANDLE_PX * 1.6 * px} ${draft.anchor.y}h${HANDLE_PX * 3.2 * px}M${draft.anchor.x} ${draft.anchor.y - HANDLE_PX * 1.6 * px}v${HANDLE_PX * 3.2 * px}`} />
            </g>
          )}
          {path.length > 0 && (
            <polyline className="asset-draft" points={[...path, ...(mouse ? [mouse] : [])].map((q) => q.join(',')).join(' ')} strokeWidth={2 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
          )}
        </svg>
      </div>
      <EditorPanel busy={busy} canSuggest={!!thumb} onSuggest={() => void suggest()} inside={showInside} setInside={setInside} innerKind={innerKind} setInnerKind={setInnerKind} />
    </div>
  );
}

function EditorPanel(props: { busy: boolean; canSuggest: boolean; onSuggest: () => void; inside: boolean; setInside: (on: boolean) => void; innerKind: InnerKind; setInnerKind: (k: InnerKind) => void }) {
  const { busy, canSuggest, onSuggest } = props;
  const { t } = useI18n();
  const editor = useStore((s) => s.vault.editor)!;
  const { draft, tool } = editor;
  const size = draft.sizeCells ?? { w: 1, h: 1 };
  const l = draft.light;
  const setSize = (w: number, h: number) => w > 0 && h > 0 && w <= 100 && h <= 100 && updateEditorDraft((a) => ({ ...a, sizeCells: { w, h } }));
  // A door: its line across the middle; without an anchor, one in the centre that snaps onto walls.
  const toggleDoor = (on: boolean) =>
    updateEditorDraft((a) => {
      const { door: _d, ...rest } = a;
      if (!on) return rest;
      return { ...rest, door: { x1: 0, y1: size.h / 2, x2: size.w, y2: size.h / 2 }, anchor: a.anchor ?? { x: size.w / 2, y: size.h / 2, wallSnap: true } };
    });
  const setLight = (patch: Partial<NonNullable<AssetSidecar['light']>>) => updateEditorDraft((a) => (a.light ? { ...a, light: { ...a.light, ...patch } } : a));
  const toggleLight = (on: boolean) =>
    updateEditorDraft((a) => {
      const { light: _l, ...rest } = a;
      return on ? { ...rest, light: { x: size.w / 2, y: size.h / 2, brightFt: 10, dimFt: 20, color: '#ffb14a', flicker: 0 } } : rest;
    });
  return (
    <form
      className="command-panel asset-panel"
      aria-labelledby="ae-title"
      onSubmit={(e) => {
        e.preventDefault();
        void saveAssetEditor();
      }}
    >
      <div className="cmd-head">
        <b id="ae-title">{t('editor.title')}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={closeAssetEditor}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <div className="cmd-field">
          <span>{t('vault.sizeCells')}</span>
          <span className="vault-size-fields">
            <input type="number" min={0.5} max={100} step={0.5} aria-label={`${t('vault.sizeCells')} W`} value={size.w} onChange={(e) => setSize(Number(e.target.value), size.h)} />
            ×
            <input type="number" min={0.5} max={100} step={0.5} aria-label={`${t('vault.sizeCells')} H`} value={size.h} onChange={(e) => setSize(size.w, Number(e.target.value))} />
          </span>
        </div>
        <div className="cmd-field">
          <span>{t('editor.cover')}</span>
          <div className="cmd-row" role="radiogroup" aria-label={t('editor.cover')}>
            {TOOLS.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={tool === x.id} className={`cmd-icon ${tool === x.id ? 'on' : ''}`} title={t(x.label)} aria-label={t(x.label)} onClick={() => setEditorTool(x.id)}>
                <Icon name={x.icon} />
              </button>
            ))}
          </div>
        </div>
        <div className="cmd-row">
          <button type="button" className="btn sm" disabled={!canSuggest || busy} onClick={onSuggest}><Icon name="zone" />{t('editor.suggest')}</button>
          <button
            type="button"
            className="btn sm"
            disabled={!draft.cover}
            onClick={() =>
              updateEditorDraft((a) => {
                const { cover: _c, ...rest } = a;
                return rest;
              })
            }
          >
            <Icon name="trash" />{t('editor.removeCover')}
          </button>
        </div>
        <p className="hint">{t('editor.coverHint')}</p>
        {draft.assetKind !== 'light' && (
          <label className="cmd-check">
            <input type="checkbox" checked={!!l} onChange={(e) => toggleLight(e.target.checked)} />
            {t('editor.withLight')}
          </label>
        )}
        {l && (
          <>
            <div className="cmd-two">
              <label className="cmd-field">
                <span>{t('light.bright')}</span>
                <input type="number" min={0} step={5} value={l.brightFt} onChange={(e) => setLight({ brightFt: Math.max(0, Number(e.target.value)) })} />
              </label>
              <label className="cmd-field">
                <span>{t('light.dim')}</span>
                <input type="number" min={0} step={5} value={l.dimFt} onChange={(e) => setLight({ dimFt: Math.max(0, Number(e.target.value)) })} />
              </label>
            </div>
            <div className="cmd-two">
              <label className="cmd-field">
                <span>{t('light.color')}</span>
                <input type="color" value={l.color} onChange={(e) => setLight({ color: e.target.value })} />
              </label>
              <label className="cmd-field">
                <span>{t('editor.flicker')}</span>
                <input type="range" min={0} max={1} step={0.05} value={l.flicker} onChange={(e) => setLight({ flicker: Number(e.target.value) })} />
              </label>
            </div>
            <button type="button" className={`btn sm ${tool === 'light' ? 'pri' : ''}`} aria-pressed={tool === 'light'} onClick={() => setEditorTool(tool === 'light' ? 'select' : 'light')}><Icon name="light" />{t('editor.placeLight')}</button>
          </>
        )}
        <div className="cmd-field">
          <span>{t('editor.anchor')}</span>
          <div className="cmd-row">
            <button type="button" className={`btn sm ${tool === 'anchor' ? 'pri' : ''}`} aria-pressed={tool === 'anchor'} onClick={() => setEditorTool(tool === 'anchor' ? 'select' : 'anchor')}><Icon name="anchor" />{t('editor.placeAnchor')}</button>
            <button
              type="button"
              className="btn sm"
              disabled={!draft.anchor}
              onClick={() =>
                updateEditorDraft((a) => {
                  const { anchor: _a, ...rest } = a;
                  return rest;
                })
              }
            >
              <Icon name="trash" />{t('editor.removeAnchor')}
            </button>
          </div>
        </div>
        {draft.anchor && (
          <label className="cmd-check">
            <input type="checkbox" checked={draft.anchor.wallSnap} onChange={(e) => updateEditorDraft((a) => (a.anchor ? { ...a, anchor: { ...a.anchor, wallSnap: e.target.checked } } : a))} />
            {t('editor.wallSnap')}
          </label>
        )}
        <p className="hint">{t('editor.anchorHint')}</p>
        <label className="cmd-check">
          <input type="checkbox" checked={!!draft.door} onChange={(e) => toggleDoor(e.target.checked)} />
          {t('editor.isDoor')}
        </label>
        {draft.door && (
          <button type="button" className={`btn sm ${tool === 'door' ? 'pri' : ''}`} aria-pressed={tool === 'door'} onClick={() => setEditorTool(tool === 'door' ? 'select' : 'door')}><Icon name="door" />{t('editor.drawDoor')}</button>
        )}
        <InteriorFields {...props} />
        {draft.assetKind === 'effect' && (
          <>
            <label className="cmd-check">
              <input type="checkbox" checked={draft.effect?.loop ?? true} onChange={(e) => updateEditorDraft((a) => ({ ...a, effect: { loop: e.target.checked, trigger: a.effect?.trigger ?? false } }))} />
              {t('editor.loop')}
            </label>
            <label className="cmd-check">
              <input type="checkbox" checked={draft.effect?.trigger ?? false} onChange={(e) => updateEditorDraft((a) => ({ ...a, effect: { loop: a.effect?.loop ?? true, trigger: e.target.checked } }))} />
              {t('editor.trigger')}
            </label>
          </>
        )}
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={closeAssetEditor}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri">{t('area.cmd.ok')}</button>
      </div>
    </form>
  );
}

const INNER_KINDS: { id: InnerKind; label: MessageKey }[] = [
  { id: 'wall', label: 'wall.kind.wall' },
  { id: 'door', label: 'wall.kind.door' },
  { id: 'window', label: 'wall.kind.window' },
];

/**
 * A house's interior (E-29): another asset of its group shown inside, its walls, doors and windows
 * drawn on that picture, and how it is triggered.
 */
function InteriorFields({ inside, setInside, innerKind, setInnerKind }: { inside: boolean; setInside: (on: boolean) => void; innerKind: InnerKind; setInnerKind: (k: InnerKind) => void }) {
  const { t } = useI18n();
  const editor = useStore((s) => s.vault.editor)!;
  const items = useStore((s) => s.vault.items);
  const { draft, tool } = editor;
  const i = draft.interior;
  const group = draft.group ? items.filter((x) => x.asset.group === draft.group && x.relPath !== editor.relPath) : [];
  const setInterior = (patch: Partial<NonNullable<AssetSidecar['interior']>>) => updateEditorDraft((a) => (a.interior ? { ...a, interior: { ...a.interior, ...patch } } : a));
  const setTrigger = (patch: Partial<NonNullable<AssetSidecar['interior']>['trigger']>) => i && setInterior({ trigger: { ...i.trigger, ...patch } });
  const toggle = (on: boolean) =>
    updateEditorDraft((a) => {
      const { interior: _i, ...rest } = a;
      if (!on || !group.length) return rest;
      return { ...rest, interior: { asset: group[0].relPath, walls: [], trigger: { mode: 'enter', nearFt: 10, confirm: false, leaveOff: true } } };
    });
  return (
    <>
      <label className="cmd-check">
        <input type="checkbox" checked={!!i} disabled={!i && !group.length} onChange={(e) => toggle(e.target.checked)} />
        {t('editor.hasInterior')}
      </label>
      {!i && !group.length && <p className="hint">{t('editor.interiorNeedsGroup')}</p>}
      {i && (
        <>
          <label className="cmd-field">
            <span>{t('editor.interiorAsset')}</span>
            <select value={i.asset} onChange={(e) => setInterior({ asset: e.target.value })}>
              {group.map((x) => <option key={x.relPath} value={x.relPath}>{x.asset.name}</option>)}
            </select>
          </label>
          <label className="cmd-check">
            <input type="checkbox" checked={inside} onChange={(e) => { setInside(e.target.checked); if (!e.target.checked && tool === 'inner') setEditorTool('select'); }} />
            {t('editor.showInside')}
          </label>
          {inside && (
            <>
              <div className="cmd-row" role="radiogroup" aria-label={t('editor.innerKind')}>
                {INNER_KINDS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={innerKind === k.id} className={`btn sm ${innerKind === k.id ? 'on' : ''}`} onClick={() => setInnerKind(k.id)}>{t(k.label)}</button>
                ))}
              </div>
              <div className="cmd-row">
                <button type="button" className={`btn sm ${tool === 'inner' ? 'pri' : ''}`} aria-pressed={tool === 'inner'} onClick={() => setEditorTool(tool === 'inner' ? 'select' : 'inner')}><Icon name="wall" />{t('editor.drawInner')}</button>
                <button type="button" className="btn sm" disabled={!i.walls.length} onClick={() => setInterior({ walls: i.walls.slice(0, -1) })}><Icon name="undo" />{t('editor.removeLastInner')}</button>
              </div>
              <p className="hint">{t('editor.innerCount', { n: i.walls.length })}</p>
            </>
          )}
          <label className="cmd-field">
            <span>{t('editor.trigger.mode')}</span>
            <select value={i.trigger.mode} onChange={(e) => setTrigger({ mode: e.target.value as 'click' | 'enter' | 'near' })}>
              <option value="click">{t('interior.mode.click')}</option>
              <option value="enter">{t('interior.mode.enter')}</option>
              <option value="near">{t('interior.mode.near')}</option>
            </select>
          </label>
          {i.trigger.mode === 'near' && (
            <label className="cmd-field">
              <span>{t('interior.nearFt')}</span>
              <input type="number" min={0} step={5} value={i.trigger.nearFt} onChange={(e) => setTrigger({ nearFt: Math.max(0, Number(e.target.value)) })} />
            </label>
          )}
          {i.trigger.mode !== 'click' && (
            <>
              <label className="cmd-check"><input type="checkbox" checked={i.trigger.confirm} onChange={(e) => setTrigger({ confirm: e.target.checked })} />{t('interior.confirm')}</label>
              <label className="cmd-check"><input type="checkbox" checked={i.trigger.leaveOff} onChange={(e) => setTrigger({ leaveOff: e.target.checked })} />{t('interior.leaveOff')}</label>
            </>
          )}
        </>
      )}
    </>
  );
}
