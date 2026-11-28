/**
 * Command panel of the terrain tools (E-87, E-88, E-6): over the map at its top right, not modal.
 * "Stufe": effect (raise, lower, set to a step – with a pipette), brush (round, square on the grid,
 * lasso) and size. "Bodenklasse": the class (pictured as the biome under the pointer shows it),
 * strength, soft edge and size. "Biom": the biome, strength, soft edge and size. "Füllen": the class
 * and the tolerance. Every stroke or fill is one step of undo; OK keeps them, Cancel or Escape takes
 * back all since the tools opened. How painting steps is previewed is a setting of this device.
 */
import type { KeyboardEvent } from 'react';
import { BIOME_CLASSES, GROUND_CLASSES, type GroundClass } from '../core/build/terrain/groundTool';
import type { BrushShape, StepMode } from '../core/build/terrain/stepTool';
import { STEP_MAX, STEP_MIN } from '../core/build/terrain/stepTool';
import { TERRAIN_BIOMES, type TerrainBiome } from '../core/build/terrainKeys';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { groundPictureUrl } from '../render/build/terrainTextures';
import { Icon, type IconName } from '../ui/Icon';
import { cancelTerrainCommand, finishTerrainCommand, setTerrainPreview, terrainPalette, updateTerrainCommand, useStore, type TerrainCommand, type TerrainPreview } from '../app/store';

const MODES: { id: StepMode; icon: IconName }[] = [
  { id: 'raise', icon: 'up' },
  { id: 'lower', icon: 'down' },
  { id: 'set', icon: 'equals' },
];

const SHAPES: { id: BrushShape; icon: IconName }[] = [
  { id: 'round', icon: 'brush' },
  { id: 'square', icon: 'rect' },
  { id: 'lasso', icon: 'lasso' },
];

const PREVIEWS: TerrainPreview[] = ['live', 'outline'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function TerrainCommandPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.terrainCommand);
  const preview = useStore((s) => s.terrainPreview);
  const hover = useStore((s) => s.terrainHover);
  if (!c) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelTerrainCommand();
    }
  };
  const title: Record<TerrainCommand['tool'], MessageKey> = { step: 'terrain.cmd.title', ground: 'terrain.cmd.title.ground', biome: 'terrain.cmd.title.biome', fill: 'terrain.cmd.title.fill' };
  const percent = (key: 'strength' | 'softness' | 'tolerance', label: MessageKey) => (
    <label className="cmd-field">
      <span>{t(label)}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(c[key] * 100)} aria-valuetext={`${Math.round(c[key] * 100)} %`} onChange={(e) => updateTerrainCommand({ [key]: Number(e.target.value) / 100 })} />
    </label>
  );
  const size = (
    <label className="cmd-field">
      <span>{t('terrain.cmd.size')}</span>
      <input type="number" min={0.5} max={20} step={0.5} value={c.sizeCells} onChange={(e) => updateTerrainCommand({ sizeCells: clamp(Number(e.target.value) || 1, 0.5, 20) })} />
    </label>
  );
  return (
    <form
      className="command-panel"
      aria-labelledby="terrain-cmd-title"
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        finishTerrainCommand();
      }}
    >
      <div className="cmd-head">
        <b id="terrain-cmd-title">{t(title[c.tool])}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={cancelTerrainCommand}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        {c.tool === 'step' && <StepOptions c={c} />}
        {(c.tool === 'ground' || c.tool === 'fill') && <ClassPalette selected={c.groundClass} biome={hover ?? terrainPalette()[0]!} />}
        {c.tool === 'biome' && <BiomePalette selected={c.biome} />}
        {(c.tool === 'ground' || c.tool === 'biome') && (
          <>
            {percent('strength', 'terrain.cmd.strength')}
            {percent('softness', 'terrain.cmd.softness')}
            {size}
          </>
        )}
        {c.tool === 'fill' && percent('tolerance', 'terrain.cmd.tolerance')}
        <p className="hint">{t(c.tool === 'step' ? 'terrain.cmd.hint' : c.tool === 'ground' ? 'terrain.cmd.groundHint' : c.tool === 'biome' ? 'terrain.cmd.biomeHint' : 'terrain.cmd.fillHint')}</p>
        {c.tool === 'step' && (
          <label className="cmd-field">
            <span>{t('terrain.cmd.preview')}</span>
            <select value={preview} onChange={(e) => setTerrainPreview(e.target.value as TerrainPreview)}>
              {PREVIEWS.map((p) => (
                <option key={p} value={p}>{t(`terrain.preview.${p}` as MessageKey)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={cancelTerrainCommand}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri">{t('area.cmd.ok')}</button>
      </div>
    </form>
  );
}

function StepOptions({ c }: { c: TerrainCommand }) {
  const { t } = useI18n();
  return (
    <>
      <div className="cmd-row" role="radiogroup" aria-label={t('terrain.cmd.mode')}>
        {MODES.map((m) => {
          const label = t(`terrain.mode.${m.id}` as MessageKey);
          return (
            <button key={m.id} type="button" role="radio" aria-checked={c.mode === m.id} className={`cmd-icon ${c.mode === m.id ? 'on' : ''}`} title={label} aria-label={label} onClick={() => updateTerrainCommand({ mode: m.id })}>
              <Icon name={m.icon} />
            </button>
          );
        })}
      </div>
      {c.mode === 'set' && (
        <div className="cmd-line">
          <label className="cmd-field">
            <span>{t('terrain.cmd.step')}</span>
            <input type="number" min={STEP_MIN} max={STEP_MAX} step={1} value={c.picked} onChange={(e) => updateTerrainCommand({ picked: clamp(Math.round(Number(e.target.value) || 0), STEP_MIN, STEP_MAX) })} />
          </label>
          <button type="button" className={`cmd-icon ${c.picking ? 'on' : ''}`} aria-pressed={c.picking} title={t('terrain.cmd.pick')} aria-label={t('terrain.cmd.pick')} onClick={() => updateTerrainCommand({ picking: !c.picking })}>
            <Icon name="pipette" />
          </button>
        </div>
      )}
      {c.picking && <p className="hint" role="status">{t('terrain.cmd.picking')}</p>}
      <div className="cmd-row" role="radiogroup" aria-label={t('terrain.cmd.shape')}>
        {SHAPES.map((s) => {
          const label = t(`terrain.shape.${s.id}` as MessageKey);
          return (
            <button key={s.id} type="button" role="radio" aria-checked={c.shape === s.id} className={`cmd-icon ${c.shape === s.id ? 'on' : ''}`} title={label} aria-label={label} onClick={() => updateTerrainCommand({ shape: s.id })}>
              <Icon name={s.icon} />
            </button>
          );
        })}
      </div>
      {c.shape !== 'lasso' && (
        <label className="cmd-field">
          <span>{t('terrain.cmd.size')}</span>
          <input type="number" min={0.5} max={20} step={0.5} value={c.sizeCells} onChange={(e) => updateTerrainCommand({ sizeCells: clamp(Number(e.target.value) || 1, 0.5, 20) })} />
        </label>
      )}
    </>
  );
}

/** The ground classes as `biome` shows them; one it lacks is faded and says it shows as Auto there. */
function ClassPalette({ selected, biome }: { selected: GroundClass; biome: TerrainBiome }) {
  const { t } = useI18n();
  const biomeName = t(`terrain.biome.${biome}` as MessageKey);
  return (
    <>
      <div className="ground-palette" role="radiogroup" aria-label={t('terrain.cmd.class')}>
        {GROUND_CLASSES.map((cls) => {
          const here = BIOME_CLASSES[biome].includes(cls);
          const name = t(`terrain.class.${cls}` as MessageKey);
          const title = here ? name : `${name} – ${t('terrain.cmd.notInBiome', { biome: biomeName })}`;
          const url = here ? groundPictureUrl(biome, cls) : groundPictureUrl(biome, null);
          return (
            <button key={cls} type="button" role="radio" aria-checked={selected === cls} className={`ground-swatch ${selected === cls ? 'on' : ''} ${here ? '' : 'absent'}`} title={title} aria-label={title} onClick={() => updateTerrainCommand({ groundClass: cls })}>
              {url && <img src={url} alt="" draggable={false} />}
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      <p className="hint">{t('terrain.cmd.classHere', { biome: biomeName })}</p>
    </>
  );
}

/** The five biomes, each pictured by its own ground; the map's palette below. */
function BiomePalette({ selected }: { selected: TerrainBiome }) {
  const { t } = useI18n();
  // Read again with every change of the store: painting or undo may change the palette.
  const palette = useStore(() => terrainPalette().join()).split(',') as TerrainBiome[];
  return (
    <>
      <div className="ground-palette" role="radiogroup" aria-label={t('tool.terrainBiome')}>
        {TERRAIN_BIOMES.map((b) => {
          const name = t(`terrain.biome.${b}` as MessageKey);
          const url = groundPictureUrl(b, null);
          return (
            <button key={b} type="button" role="radio" aria-checked={selected === b} className={`ground-swatch ${selected === b ? 'on' : ''}`} title={name} aria-label={name} onClick={() => updateTerrainCommand({ biome: b })}>
              {url && <img src={url} alt="" draggable={false} />}
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      <p className="hint">{t('terrain.cmd.palette', { list: palette.map((b) => t(`terrain.biome.${b}` as MessageKey)).join(', ') })}</p>
    </>
  );
}
