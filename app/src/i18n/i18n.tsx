import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { de } from './de';
import { en, type MessageKey } from './en';

export type Locale = 'en' | 'de';
export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

const DICTS: Record<Locale, Partial<Record<MessageKey, string>>> = { en, de };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const raw = DICTS[locale][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** The language setting: a fixed language, or the system's (the default, decision E-5). */
export type LocaleSetting = Locale | 'system';

/** The first of the system's preferred languages the app has; English if none. */
export function systemLocale(languages: readonly string[]): Locale {
  for (const l of languages) {
    const base = l.toLowerCase().split(/[-_]/)[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export function resolveLocale(setting: LocaleSetting, languages: readonly string[] = systemLanguages()): Locale {
  return setting === 'system' ? systemLocale(languages) : setting;
}

interface I18nValue {
  locale: Locale;
  /** What the user chose; `system` follows the operating system. */
  setting: LocaleSetting;
  setLocale: (l: LocaleSetting) => void;
  t: Translate;
}

const Ctx = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'dc.locale';

function initialSetting(): LocaleSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'de' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<LocaleSetting>(initialSetting);
  const [languages, setLanguages] = useState(systemLanguages);
  // The system language can change while the app runs.
  useEffect(() => {
    const changed = () => setLanguages(systemLanguages());
    window.addEventListener('languagechange', changed);
    return () => window.removeEventListener('languagechange', changed);
  }, []);
  const locale = resolveLocale(setting, languages);
  // Set before children render: docking reads it for panel titles.
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  const setLocale = useCallback((l: LocaleSetting) => {
    setSetting(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setting, setLocale, t }), [locale, setting, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
