/** Theme and language selection (app bar and start screen). */
import { useEffect, useState } from 'react';
import { useI18n, LOCALES, resolveLocale, type LocaleSetting } from '../i18n/i18n';

type Skin = 'dark' | 'light' | 'parchment';

function initialSkin(): Skin {
  try {
    const v = localStorage.getItem('dc.skin');
    if (v === 'light' || v === 'parchment' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function AppearanceControls() {
  const { t, setting, setLocale } = useI18n();
  const system = LOCALES.find((l) => l.id === resolveLocale('system'))!.label;
  const [skin, setSkin] = useState<Skin>(initialSkin);
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      localStorage.setItem('dc.skin', skin);
    } catch {
      /* ignore */
    }
  }, [skin]);
  return (
    <>
      <select className="compact-select" aria-label={t('app.theme')} value={skin} onChange={(e) => setSkin(e.target.value as Skin)}>
        <option value="dark">{t('app.theme')}: {t('theme.dark')}</option>
        <option value="light">{t('app.theme')}: {t('theme.light')}</option>
        <option value="parchment">{t('app.theme')}: {t('theme.parchment')}</option>
      </select>
      <select className="compact-select" aria-label={t('app.language')} value={setting} onChange={(e) => setLocale(e.target.value as LocaleSetting)}>
        <option value="system">{t('app.languageSystem', { language: system })}</option>
        {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </>
  );
}
