/**
 * "Generate map …" (DC-119e): a dialog from the map catalog. Style, size, density, seed and the
 * extras act live on a small schematic preview (the generator runs in milliseconds, decision of
 * 2026-11-26: no worker); create bakes the result as a new drawn map of the library, with the
 * settings kept as a note on the map.
 */
import { useEffect, useRef, useState } from 'react';
import { generateMap, type GenStyle } from '../core/build/generate';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { generateLibraryMap } from './library';
import './start.css';

interface Opts {
  style: GenStyle;
  cols: number;
  rows: number;
  density: number;
  seed: number;
  water: boolean;
  lights: boolean;
  details: boolean;
}

const newSeed = () => Math.floor(Math.random() * 1_000_000);

export function GenerateMapDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(t('gen.map.defaultName'));
  const [opts, setOpts] = useState<Opts>({ style: 'dungeon', cols: 40, rows: 30, density: 0.6, seed: newSeed(), water: true, lights: true, details: true });
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const set = (patch: Partial<Opts>) => setOpts((o) => ({ ...o, ...patch }));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // The schematic preview: floors, ponds, doors and torches as plain colours.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const gen = generateMap(opts);
    const px = Math.max(2, Math.floor(Math.min(420 / gen.cols, 300 / gen.rows)));
    c.width = gen.cols * px;
    c.height = gen.rows * px;
    g.fillStyle = '#20201d';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = opts.style === 'cave' ? '#7a6f5d' : '#8a857a';
    for (let y = 0; y < gen.rows; y++)
      for (let x = 0; x < gen.cols; x++)
        if (gen.open[y * gen.cols + x]) g.fillRect(x * px, y * px, px, px);
    g.fillStyle = '#39678a';
    for (let y = 0; y < gen.rows; y++)
      for (let x = 0; x < gen.cols; x++)
        if (gen.water[y * gen.cols + x]) g.fillRect(x * px, y * px, px, px);
    g.fillStyle = '#d9a648';
    for (const d of gen.doors) g.fillRect(d.x * px, d.y * px, px, px);
    g.fillStyle = '#ffd27a';
    for (const l of gen.lightSpots) {
      g.beginPath();
      g.arc((l.x + 0.5) * px, (l.y + 0.5) * px, Math.max(1.5, px * 0.4), 0, Math.PI * 2);
      g.fill();
    }
  }, [opts]);

  const create = () => {
    if (busy) return;
    setBusy(true);
    void generateLibraryMap(name.trim() || t('gen.map.defaultName'), opts).then(onClose).finally(() => setBusy(false));
  };

  return (
    <div className="start-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="start-dialog gen-map-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gen-map-title"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h2 id="gen-map-title">{t('gen.map.title')}</h2>
        <div className="gen-map-grid">
          <div className="gen-map-fields">
            <label className="cmd-field">
              <span>{t('props.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <label className="cmd-field">
              <span>{t('build.gen.style')}</span>
              <select value={opts.style} onChange={(e) => set({ style: e.target.value as GenStyle })}>
                <option value="dungeon">{t('build.gen.dungeon')}</option>
                <option value="cave">{t('build.gen.cave')}</option>
              </select>
            </label>
            <div className="gen-map-size">
              <label className="cmd-field">
                <span>{t('gen.map.width')}</span>
                <input type="number" min={10} max={200} value={opts.cols} onChange={(e) => set({ cols: Math.max(10, Math.min(200, Math.floor(Number(e.target.value)) || 10)) })} />
              </label>
              <label className="cmd-field">
                <span>{t('gen.map.height')}</span>
                <input type="number" min={10} max={200} value={opts.rows} onChange={(e) => set({ rows: Math.max(10, Math.min(200, Math.floor(Number(e.target.value)) || 10)) })} />
              </label>
            </div>
            <label className="cmd-field">
              <span>{t('build.gen.density')}</span>
              <input type="range" min={5} max={100} value={Math.round(opts.density * 100)} onChange={(e) => set({ density: Number(e.target.value) / 100 })} />
            </label>
            <div className="cmd-line">
              <label className="cmd-field">
                <span>{t('build.gen.seed')}</span>
                <input type="number" value={opts.seed} onChange={(e) => set({ seed: Math.floor(Number(e.target.value)) || 0 })} />
              </label>
              <button type="button" className="btn sm" onClick={() => set({ seed: newSeed() })}><Icon name="dice" />{t('build.reroll')}</button>
            </div>
            <label className="cmd-check"><input type="checkbox" disabled={opts.style !== 'cave'} checked={opts.style === 'cave' && opts.water} onChange={(e) => set({ water: e.target.checked })} />{t('gen.map.water')}</label>
            <label className="cmd-check"><input type="checkbox" checked={opts.lights} onChange={(e) => set({ lights: e.target.checked })} />{t('gen.map.lights')}</label>
            <label className="cmd-check"><input type="checkbox" checked={opts.details} onChange={(e) => set({ details: e.target.checked })} />{t('gen.map.details')}</label>
          </div>
          <div className="gen-map-preview">
            <canvas ref={canvas} aria-label={t('gen.map.preview')} />
          </div>
        </div>
        <div className="start-buttons">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>{t('start.cancel')}</button>
          <button type="submit" className="btn pri" disabled={busy}>{t('gen.map.create')}</button>
        </div>
      </form>
    </div>
  );
}
