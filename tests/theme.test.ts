import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { applyTheme, parseThemePreference, readThemePreference, resolveTheme, saveThemePreference, THEME_BOOTSTRAP, THEME_STORAGE_KEY, type ThemePreference } from '../src/lib/theme';

const invalid = [null, [], {}, true, 'dark', { version: 2, preference: 'dark' }, { version: 1, preference: 'sepia' }, { version: '1', preference: 'dark' }, { version: 1, preference: 'dark', caseId: 'not-allowed' }];
const stored = (preference: ThemePreference) => JSON.stringify({ version: 1, preference });
const adapter = (raw: string | null = null) => ({ getItem: vi.fn(() => raw), setItem: vi.fn() });

describe('independent color theme preference', () => {
  it('accepts only the versioned allowlist and defaults to system', () => {
    for (const value of ['system', 'light', 'dark'] as const) expect(parseThemePreference(stored(value))).toBe(value);
    for (const value of invalid) expect(parseThemePreference(JSON.stringify(value))).toBe('system');
    expect(parseThemePreference('{broken')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
  });
  it('only reads and writes its own key', () => {
    const storage = adapter(stored('dark'));
    expect(readThemePreference(storage)).toBe('dark');
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY);
    expect(saveThemePreference('light', storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY, stored('light'));
  });
  it('handles blocked or missing storage', () => {
    const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
    for (const storage of [null, blocked]) {
      expect(readThemePreference(storage)).toBe('system');
      expect(saveThemePreference('dark', storage)).toBe(false);
    }
  });
  it('follows the OS only in system mode', () => {
    for (const dark of [true, false]) {
      expect(resolveTheme('light', dark)).toBe('light');
      expect(resolveTheme('dark', dark)).toBe('dark');
      expect(resolveTheme('system', dark)).toBe(dark ? 'dark' : 'light');
    }
  });
  it('only sets theme attributes, leaving reading settings and print CSS alone', () => {
    const root = { setAttribute: vi.fn() };
    applyTheme('system', true, root);
    expect(root.setAttribute.mock.calls).toEqual([['data-theme-preference', 'system'], ['data-theme', 'dark']]);
  });
  it('keeps before-paint validation in parity with the client parser', () => {
    const raws = [null, '{broken', ...invalid.map(value => JSON.stringify(value)), ...(['system', 'light', 'dark'] as const).map(stored)];
    for (const raw of raws) for (const systemDark of [true, false]) {
      const attrs: Record<string, string> = {};
      runInNewContext(THEME_BOOTSTRAP, { window: { localStorage: adapter(raw), matchMedia: () => ({ matches: systemDark }) }, document: { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } } });
      const preference = parseThemePreference(raw);
      expect(attrs).toEqual({ 'data-theme-preference': preference, 'data-theme': resolveTheme(preference, systemDark) });
    }
  });
  it('initializes safely when both browser preference APIs throw', () => {
    const attrs: Record<string, string> = {};
    runInNewContext(THEME_BOOTSTRAP, { window: { get localStorage() { throw Error('blocked'); }, matchMedia: () => { throw Error('blocked'); } }, document: { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } } });
    expect(attrs).toEqual({ 'data-theme-preference': 'system', 'data-theme': 'light' });
  });
});
