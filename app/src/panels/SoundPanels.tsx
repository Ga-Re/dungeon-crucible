/**
 * Sound sources (E-37, DC-104): choosing a sound (built in or from the library), the selected
 * source's properties – sound, radius, volume, fading, listening in, layer, remove; in a scene
 * also whether it plays – and the scene's own sound everywhere (DC-104c).
 */
import { useEffect, useState } from 'react';
import { AUDIO_FILE, BUILTIN_SOUND, BUILTIN_SOUNDS } from '../core/sound';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { previewSound } from '../app/mapSound';
import { removeSound, selectSound, setMapSoundsMuted, setSceneAmbientSound, setSoundLevel, setSoundPlaying, updateSound, useStore } from '../app/store';
import type { SoundSource } from '../core/scene';
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
  const shown = useStore((st) => st.scene.sounds.find((x) => x.id === id));
  // In a scene a switched-off source stays selected (DC-104c).
  const off = useStore((st) => st.scene.hidden.sounds.find((x) => x.id === id));
  const inScene = useStore((st) => st.layer !== 'map');
  const s = shown ?? off;
  // The volume slider changes the source once it is let go: one undoable step, not one per pixel.
  // In a scene the volume is the scene's own (state, DC-104c); in the Map Forge the map's.
  const volume = s ? (inScene ? (s.level ?? s.volume) : s.volume) : 0;
  const [vol, setVol] = useState(0);
  useEffect(() => setVol(Math.round(volume * 100)), [volume]);
  if (!s) return null;
  const commitVolume = () => {
    if (vol === Math.round(volume * 100)) return;
    if (inScene) setSoundLevel(s.id, vol / 100);
    else updateSound(s.id, { volume: vol / 100 });
  };
  return (
    <>
      <div className="sec">{t('sound.title')}</div>
      {inScene && <label className="cmd-check"><input type="checkbox" checked={!!shown} onChange={(e) => setSoundPlaying(s.id, e.target.checked)} />{t('sound.playing')}</label>}
      <fieldset className="plain" disabled={!shown}>
      <div className="row"><label htmlFor="snd-sound">{t('sound.sound')}</label><SoundSelect id="snd-sound" value={s.sound} onChange={(sound) => updateSound(s.id, { sound })} /></div>
      <div className="row"><label htmlFor="snd-r">{t('sound.radius')}</label>
        <input id="snd-r" type="number" min={5} step={5} value={s.radiusFt} onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateSound(s.id, { radiusFt: v }); }} />
      </div>
      <div className="row"><label htmlFor="snd-v">{t('sound.volume')}</label>
        <input id="snd-v" type="range" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} onMouseUp={commitVolume} onTouchEnd={commitVolume} onKeyUp={commitVolume} onBlur={commitVolume} />
      </div>
      <label className="cmd-check"><input type="checkbox" checked={s.fade} onChange={(e) => updateSound(s.id, { fade: e.target.checked })} />{t('sound.fade')}</label>
      {!inScene && <LayerRow ids={[s.id]} />}
      </fieldset>
      <div className="cmd-line">
        <button className="btn sm" onClick={() => previewSound(s.sound, vol / 100)}><Icon name="play" />{t('sound.preview')}</button>
        {shown && <button className="btn sm danger" onClick={() => removeSound(s.id)}><Icon name="trash" />{t('sound.remove')}</button>}
      </div>
      <p className="hint">{t('sound.hint')}</p>
    </>
  );
}

/** A scene's sound everywhere (DC-104c): the map's, its own, or silence – start and play apart. */
export function SceneSound() {
  const { t } = useI18n();
  const own = useStore((st) => st.scene.ambientOverride);
  const mapSound = useStore((st) => st.scene.map.ambientSound);
  const name = useSoundName();
  const [vol, setVol] = useState(0);
  const custom = own && own !== 'none' ? own : null;
  useEffect(() => setVol(Math.round((custom?.volume ?? 0.5) * 100)), [custom?.volume]);
  const commitVolume = () => {
    if (custom && vol !== Math.round(custom.volume * 100)) setSceneAmbientSound({ ...custom, volume: vol / 100 });
  };
  const mode = own === undefined ? 'map' : own === 'none' ? 'none' : 'own';
  return (
    <>
      <div className="sec">{t('sound.scene')}</div>
      <div className="row"><label htmlFor="scene-snd-mode">{t('sound.sceneMode')}</label>
        <select id="scene-snd-mode" value={mode} onChange={(e) => {
          const v = e.target.value;
          setSceneAmbientSound(v === 'map' ? null : v === 'none' ? 'none' : { sound: mapSound?.sound ?? 'builtin:wind', volume: mapSound?.volume ?? 0.5 });
        }}>
          <option value="map">{mapSound ? t('sound.asMap', { name: name(mapSound.sound) }) : t('sound.asMapNone')}</option>
          <option value="none">{t('sound.mute')}</option>
          <option value="own">{t('sound.own')}</option>
        </select>
      </div>
      {custom && (
        <>
          <div className="row"><label htmlFor="scene-snd">{t('sound.sound')}</label><SoundSelect id="scene-snd" value={custom.sound} onChange={(sound) => setSceneAmbientSound({ ...custom, sound })} /></div>
          <div className="row"><label htmlFor="scene-snd-v">{t('sound.volume')}</label>
            <input id="scene-snd-v" type="range" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} onMouseUp={commitVolume} onTouchEnd={commitVolume} onKeyUp={commitVolume} onBlur={commitVolume} />
          </div>
        </>
      )}
    </>
  );
}

/**
 * The Orchestrator's panel "Map sounds" (DC-104c): the scene's sound everywhere and every sound
 * source – on or off, its volume in this scene; a click on its name marks it on the map. While
 * preparing ("edit start state") it changes the start, else the play state.
 */
export function MapSoundPanel() {
  const { t } = useI18n();
  const inScene = useStore((st) => st.layer !== 'map' && !!st.mapDoc);
  const shown = useStore((st) => st.scene.sounds);
  const off = useStore((st) => st.scene.hidden.sounds);
  const muted = useStore((st) => st.mapSoundsMuted);
  const elsewhere = useStore((st) => !!st.tvScenePath && st.tvScenePath !== st.scenePath);
  if (!inScene) return <div className="panel-body"><p className="hint">{t('sound.noScene')}</p></div>;
  return (
    <div className="panel-body map-sounds">
      <label className="cmd-check"><input type="checkbox" checked={muted} onChange={(e) => setMapSoundsMuted(e.target.checked)} />{t('sound.muteAll')}</label>
      {elsewhere && <p className="hint">{t('sound.tvPlays')}</p>}
      <SceneSound />
      <div className="sec">{t('sound.sources')}</div>
      {shown.length + off.length === 0 && <p className="hint">{t('sound.noSources')}</p>}
      {shown.map((x) => <SourceRow key={x.id} source={x} on />)}
      {off.map((x) => <SourceRow key={x.id} source={x} on={false} />)}
    </div>
  );
}

function SourceRow({ source, on }: { source: SoundSource; on: boolean }) {
  const { t } = useI18n();
  const name = useSoundName()(source.sound);
  const selected = useStore((st) => st.selectedSoundId === source.id);
  // The source's volume in this scene (state, DC-104c).
  const volume = source.level ?? source.volume;
  const [vol, setVol] = useState(Math.round(volume * 100));
  useEffect(() => setVol(Math.round(volume * 100)), [volume]);
  const commit = () => {
    if (vol !== Math.round(volume * 100)) setSoundLevel(source.id, vol / 100);
  };
  return (
    <div className={`amb ${selected ? 'sel' : ''}`}>
      <button className={`play ${on ? 'on' : ''}`} title={t(on ? 'sound.switchOff' : 'sound.switchOn')} aria-label={`${t(on ? 'sound.switchOff' : 'sound.switchOn')}: ${name}`} aria-pressed={on} onClick={() => setSoundPlaying(source.id, !on)}>
        <Icon name={on ? 'pause' : 'play'} />
      </button>
      <button className="nm link" title={t('sound.showOnMap')} onClick={() => selectSound(source.id)}>{name}</button>
      <input type="range" min={0} max={100} value={vol} disabled={!on} aria-label={`${name}: ${t('sound.volume')}`} onChange={(e) => setVol(Number(e.target.value))} onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit} />
    </div>
  );
}
