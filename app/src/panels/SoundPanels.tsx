/**
 * Sound sources (E-37, DC-104): choosing a sound (built in or from the library) and the selected
 * source's properties – sound, radius, volume, fading, listening in, layer, remove.
 */
import { useEffect, useState } from 'react';
import { AUDIO_FILE, BUILTIN_SOUND, BUILTIN_SOUNDS } from '../core/sound';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { previewSound } from '../app/mapSound';
import { removeSound, updateSound, useStore } from '../app/store';
import { refreshVault } from '../app/vault';
import { LayerRow } from './panels';

/** A sound's name: a built-in one translated, a library file by its asset name (else its file name). */
export function useSoundName(): (sound: string) => string {
  const { t } = useI18n();
  const items = useStore((s) => s.vault.items);
  return (sound) => {
    if (sound.startsWith(BUILTIN_SOUND)) return t(`amb.${sound.slice(BUILTIN_SOUND.length)}` as MessageKey);
    return items.find((i) => i.relPath === sound)?.asset.name ?? sound.split('/').pop()!.replace(/\.[^.]+$/, '');
  };
}

/** A choice of sound: the built-in ones and the library's audio files; optionally none. */
export function SoundSelect({ id, value, onChange, none }: { id?: string; value: string; onChange: (sound: string) => void; none?: boolean }) {
  const { t } = useI18n();
  const items = useStore((s) => s.vault.items);
  const root = useStore((s) => s.root?.root);
  const name = useSoundName();
  useEffect(() => {
    void refreshVault();
  }, [root]);
  const files = items.filter((i) => AUDIO_FILE.test(i.relPath)).map((i) => i.relPath);
  // A file no longer in the library still shows as chosen.
  if (value && !value.startsWith(BUILTIN_SOUND) && !files.includes(value)) files.push(value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {none && <option value="">{t('sound.none')}</option>}
      <optgroup label={t('sound.builtin')}>
        {BUILTIN_SOUNDS.map((k) => <option key={k} value={`${BUILTIN_SOUND}${k}`}>{name(`${BUILTIN_SOUND}${k}`)}</option>)}
      </optgroup>
      {files.length > 0 && (
        <optgroup label={t('sound.library')}>
          {files.map((f) => <option key={f} value={f}>{name(f)}</option>)}
        </optgroup>
      )}
    </select>
  );
}

/** The selected sound source in the Properties panel. */
export function SoundProperties({ id }: { id: string }) {
  const { t } = useI18n();
  const s = useStore((st) => st.scene.sounds.find((x) => x.id === id));
  // The volume slider changes the source once it is let go: one undoable step, not one per pixel.
  const [vol, setVol] = useState(0);
  useEffect(() => setVol(Math.round((s?.volume ?? 0) * 100)), [s?.volume]);
  if (!s) return null;
  const commitVolume = () => {
    if (vol !== Math.round(s.volume * 100)) updateSound(s.id, { volume: vol / 100 });
  };
  return (
    <>
      <div className="sec">{t('sound.title')}</div>
      <div className="row"><label htmlFor="snd-sound">{t('sound.sound')}</label><SoundSelect id="snd-sound" value={s.sound} onChange={(sound) => updateSound(s.id, { sound })} /></div>
      <div className="row"><label htmlFor="snd-r">{t('sound.radius')}</label>
        <input id="snd-r" type="number" min={5} step={5} value={s.radiusFt} onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateSound(s.id, { radiusFt: v }); }} />
      </div>
      <div className="row"><label htmlFor="snd-v">{t('sound.volume')}</label>
        <input id="snd-v" type="range" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} onMouseUp={commitVolume} onTouchEnd={commitVolume} onKeyUp={commitVolume} onBlur={commitVolume} />
      </div>
      <label className="cmd-check"><input type="checkbox" checked={s.fade} onChange={(e) => updateSound(s.id, { fade: e.target.checked })} />{t('sound.fade')}</label>
      <LayerRow ids={[s.id]} />
      <div className="cmd-line">
        <button className="btn sm" onClick={() => previewSound(s.sound, vol / 100)}><Icon name="play" />{t('sound.preview')}</button>
        <button className="btn sm danger" onClick={() => removeSound(s.id)}><Icon name="trash" />{t('sound.remove')}</button>
      </div>
      <p className="hint">{t('sound.hint')}</p>
    </>
  );
}
