/** Confirms "reset scene": the play state goes back to the start state (undoable). */
import { useEffect } from 'react';
import { useI18n } from '../i18n/i18n';
import { resetScene } from './campaign';
import { useStore } from './store';
import './start.css';

export function ResetSceneDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const name = useStore((s) => s.sceneName);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="start-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="start-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-text"
        onSubmit={(e) => {
          e.preventDefault();
          void resetScene().then(onClose);
        }}
      >
        <h2 id="reset-title">{t('reset.title', { scene: name })}</h2>
        <p id="reset-text" className="start-lead">{t('reset.text')}</p>
        <div className="start-buttons">
          <button type="button" className="btn" onClick={onClose}>{t('start.cancel')}</button>
          <button type="submit" className="btn pri" autoFocus>{t('reset.confirm')}</button>
        </div>
      </form>
    </div>
  );
}
