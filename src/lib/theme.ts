export const THEME_STORAGE_KEY = 'bhuverify-color-theme';
export type ThemePreference = 'system' | 'light' | 'dark';
type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function parseThemePreference(raw: string | null): ThemePreference {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 2 && record.version === 1 &&
        (record.preference === 'system' || record.preference === 'light' || record.preference === 'dark')) return record.preference;
    }
  } catch { /* A malformed preference must not prevent access to the app. */ }
  return 'system';
}

function browserStorage(): ThemeStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function readThemePreference(storage: ThemeStorage | null = browserStorage()): ThemePreference {
  try { return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY) ?? null); }
  catch { return 'system'; }
}

export function saveThemePreference(preference: ThemePreference, storage: ThemeStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 1, preference }));
    return true;
  } catch { return false; }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function applyTheme(preference: ThemePreference, systemDark: boolean, root: Pick<HTMLElement, 'setAttribute'> = document.documentElement) {
  root.setAttribute('data-theme-preference', preference);
  root.setAttribute('data-theme', resolveTheme(preference, systemDark));
}

// Fixed, trusted source only. Keep its validation aligned with the parser above.
// CSS owns color-scheme so the print stylesheet can remain light.
export const THEME_BOOTSTRAP = `(() => {
  let preference = 'system';
  try {
    const value = JSON.parse(window.localStorage.getItem('bhuverify-color-theme') || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === 2 && value.version === 1
      && ['system', 'light', 'dark'].includes(value.preference)) preference = value.preference;
  } catch {}
  let systemDark = false;
  try { systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch {}
  const root = document.documentElement;
  root.setAttribute('data-theme-preference', preference);
  root.setAttribute('data-theme', preference === 'system' ? (systemDark ? 'dark' : 'light') : preference);
})();`;
