/**
 * Party (DC-096): the campaign's players, each linked to a player character of the library, and
 * whether they are at the table. "Place party" puts the present characters that are missing
 * into the scene.
 */
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { addPlayer, placeParty, removePlayer, updatePlayer, useStore } from '../app/store';

export function PartyPanel() {
  const { t } = useI18n();
  const players = useStore((s) => s.players);
  const creatures = useStore((s) => s.creatures);
  const campaign = useStore((s) => s.campaign);
  const layer = useStore((s) => s.layer);
  const pcs = creatures.filter((c) => c.role === 'pc');
  if (!campaign) return <div className="panel-body hint">{t('party.noCampaign')}</div>;
  return (
    <div className="panel-body party">
      {players.length === 0 ? (
        <p className="hint">{t('party.empty')}</p>
      ) : (
        <ul className="party-list">
          {players.map((p) => {
            const linked = creatures.find((c) => c.id === p.characterId);
            return (
              <li key={p.id} className={p.present ? '' : 'absent'}>
                <input
                  type="checkbox"
                  checked={p.present}
                  title={t('party.present')}
                  aria-label={`${t('party.present')}: ${p.name || t('party.unnamed')}`}
                  onChange={(e) => updatePlayer(p.id, { present: e.target.checked })}
                />
                <input
                  className="party-name"
                  value={p.name}
                  placeholder={t('party.playerName')}
                  aria-label={t('party.playerName')}
                  onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
                />
                <select
                  value={p.characterId ?? ''}
                  aria-label={`${t('party.character')}: ${p.name || t('party.unnamed')}`}
                  onChange={(e) => updatePlayer(p.id, { characterId: e.target.value || undefined })}
                >
                  <option value="">{t('party.noCharacter')}</option>
                  {/* A linked creature that is no PC (any more) stays selectable, so the link is not lost silently. */}
                  {linked && linked.role !== 'pc' && <option value={linked.id}>{linked.name}</option>}
                  {p.characterId && !linked && <option value={p.characterId}>{t('party.missing', { id: p.characterId })}</option>}
                  {pcs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="ab-btn" title={t('party.remove')} aria-label={`${t('party.remove')}: ${p.name || t('party.unnamed')}`} onClick={() => removePlayer(p.id)}><Icon name="trash" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="party-buttons">
        <button className="btn sm" onClick={() => addPlayer('')}><Icon name="plus" />{t('party.add')}</button>
        <button className="btn sm pri" disabled={layer === 'map'} onClick={placeParty}><Icon name="users" />{t('tool.placeParty')}</button>
      </div>
    </div>
  );
}
