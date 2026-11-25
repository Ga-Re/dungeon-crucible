/**
 * Command panel "Create area" / "Edit area" (DC-013, E-6): over the map at its top right, not
 * modal. The DM picks a shape and draws parts on the map – added to the area or cut out of it –
 * drags its corners and sets name, "secret", the fog look and the colour. Nothing is saved before
 * OK; Cancel or Escape discards. Editing also deletes the area (confirmed in the panel).
 */
import { useState, type KeyboardEvent } from 'react';
import type { AreaTool } from '../core/areas';
import { FOG_BIOMES, type FogBiome } from '../core/scene';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { areaCommandProblem, cancelAreaCommand, deleteArea, finishAreaCommand, updateAreaCommand, useStore } from '../app/store';

const TOOLS: { id: AreaTool; icon: IconName; label: MessageKey }[] = [
  { id: 'rect', icon: 'rect', label: 'area.shape.rect' },
  { id: 'ellipse', icon: 'sphere', label: 'area.shape.ellipse' },
  { id: 'polygon', icon: 'zone', label: 'area.shape.polygon' },
  { id: 'lasso', icon: 'line', label: 'area.shape.lasso' },
];

export function AreaCommandPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.areaCommand);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!c) return null;
  const editing = c.areaId;
  const problem = areaCommandProblem(c);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelAreaCommand();
    }
  };
  return (
    <form
      className="command-panel"
      aria-labelledby="area-cmd-title"
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        finishAreaCommand();
      }}
    >
      <div className="cmd-head">
        <b id="area-cmd-title">{t(editing ? 'area.edit' : 'area.cmd.title')}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={cancelAreaCommand}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <div className="cmd-row" role="radiogroup" aria-label={t('area.cmd.shape')}>
          {TOOLS.map((tool) => (
            <button key={tool.id} type="button" role="radio" aria-checked={c.tool === tool.id} className={`cmd-icon ${c.tool === tool.id ? 'on' : ''}`} title={t(tool.label)} aria-label={t(tool.label)} onClick={() => updateAreaCommand({ tool: tool.id })}>
              <Icon name={tool.icon} />
            </button>
          ))}
        </div>
        <div className="seg cmd-seg" role="radiogroup" aria-label={t('area.cmd.op')}>
          <button type="button" role="radio" aria-checked={c.op === 'add'} className={c.op === 'add' ? 'on' : ''} onClick={() => updateAreaCommand({ op: 'add' })}>{t('area.cmd.add')}</button>
          <button type="button" role="radio" aria-checked={c.op === 'subtract'} className={c.op === 'subtract' ? 'on' : ''} onClick={() => updateAreaCommand({ op: 'subtract' })}>{t('area.cmd.subtract')}</button>
        </div>
        <p className="hint">{t(`area.hint.${c.tool}` as MessageKey)} {t('area.hint.free')}</p>
        <label className="cmd-field">
          <span>{t('props.name')}</span>
          <input value={c.name} autoFocus onChange={(e) => updateAreaCommand({ name: e.target.value })} />
        </label>
        <label className="cmd-check">
          <input type="checkbox" checked={c.secret} onChange={(e) => updateAreaCommand({ secret: e.target.checked })} />
          {t('area.cmd.secret')}
        </label>
        <div className="cmd-two">
          <label className="cmd-field">
            <span>{t('area.cmd.biome')}</span>
            <select value={c.biome ?? ''} onChange={(e) => updateAreaCommand({ biome: (e.target.value || null) as FogBiome | null })}>
              <option value="">{t('area.cmd.biomeMap')}</option>
              {FOG_BIOMES.map((b) => <option key={b} value={b}>{t(`biome.${b}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="cmd-field">
            <span>{t('area.color')}</span>
            <input type="color" value={c.color} onChange={(e) => updateAreaCommand({ color: e.target.value })} />
          </label>
        </div>
        {editing && <p className="hint">{t('area.hint.corners')}</p>}
        {problem && <p className="hint" role="status">{t(problem === 'name' ? 'area.cmd.needName' : 'area.cmd.needShape')}</p>}
        {editing && confirmDelete === editing && (
          <div className="library-confirm" role="alert">
            <p>{t('area.deleteConfirm', { name: c.name || t('area.unnamed') })}</p>
            <div className="library-buttons">
              <button type="button" className="btn sm danger" onClick={() => deleteArea(editing)}>{t('area.delete')}</button>
              <button type="button" className="btn sm" onClick={() => setConfirmDelete(null)}>{t('start.cancel')}</button>
            </div>
          </div>
        )}
      </div>
      <div className="cmd-buttons">
        {editing && <button type="button" className="btn danger cmd-delete" onClick={() => setConfirmDelete(editing)}><Icon name="trash" />{t('area.delete')}</button>}
        <button type="button" className="btn" onClick={cancelAreaCommand}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri" disabled={problem !== null}>{t('area.cmd.ok')}</button>
      </div>
    </form>
  );
}
