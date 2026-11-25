import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { resolveLocale, systemLocale, translate } from './i18n';

describe('i18n', () => {
  it('falls back to English and fills parameters', () => {
    expect(translate('de', 'init.round', { n: 3 })).toBe('Runde 3');
    expect(translate('en', 'init.round', { n: 3 })).toBe('Round 3');
    expect(translate('de', 'app.name')).toBe('Dungeon Crucible');
  });
  it('German covers every English key except names that stay the same', () => {
    const missing = Object.keys(en).filter((k) => !(k in de));
    expect(missing).toEqual(['app.name', 'table.live']);
  });
  it('keeps placeholders consistent across locales', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [k, v] of Object.entries(de)) expect(ph(v!), k).toBe(ph(en[k as keyof typeof en]));
  });
  it('follows the system: the first preferred language the app has, else English (E-5)', () => {
    expect(systemLocale(['de-DE', 'en-US'])).toBe('de');
    expect(systemLocale(['fr-FR', 'de-AT', 'en'])).toBe('de');
    expect(systemLocale(['en-GB', 'de'])).toBe('en');
    expect(systemLocale(['fr', 'ja'])).toBe('en');
    expect(systemLocale([])).toBe('en');
    expect(resolveLocale('system', ['de_CH'])).toBe('de');
    expect(resolveLocale('en', ['de'])).toBe('en');
  });
});
