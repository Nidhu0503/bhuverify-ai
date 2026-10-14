export const READING_PREFERENCES_KEY = 'bhuverify-reading-preferences';

export type ReadingTextSize = 'standard' | 'large' | 'extra-large';

export type ReadingPreferences = {
  version: 1;
  textSize: ReadingTextSize;
  highContrast: boolean;
  reducedMotion: boolean;
};

export const DEFAULT_READING_PREFERENCES: Readonly<ReadingPreferences> = Object.freeze({
  version: 1,
  textSize: 'standard',
  highContrast: false,
  reducedMotion: false,
});

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function parseReadingPreferences(raw: string | null): ReadingPreferences {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const preference = value as Record<string, unknown>;
      if (
        Object.keys(preference).length === 4 &&
        preference.version === 1 &&
        (preference.textSize === 'standard' || preference.textSize === 'large' || preference.textSize === 'extra-large') &&
        typeof preference.highContrast === 'boolean' &&
        typeof preference.reducedMotion === 'boolean'
      ) {
        return {
          version: 1,
          textSize: preference.textSize,
          highContrast: preference.highContrast,
          reducedMotion: preference.reducedMotion,
        };
      }
    }
  } catch {
    // Corrupted or unavailable storage must never prevent access to the app.
  }
  return { ...DEFAULT_READING_PREFERENCES };
}

export function readReadingPreferences(storage: PreferenceStorage | null = browserStorage()): ReadingPreferences {
  try {
    return parseReadingPreferences(storage?.getItem(READING_PREFERENCES_KEY) ?? null);
  } catch {
    return { ...DEFAULT_READING_PREFERENCES };
  }
}

export function saveReadingPreferences(
  preferences: ReadingPreferences,
  storage: PreferenceStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    // Pick only this allowlist; document, case and account data never enter storage here.
    storage.setItem(READING_PREFERENCES_KEY, JSON.stringify({
      version: 1,
      textSize: preferences.textSize,
      highContrast: preferences.highContrast,
      reducedMotion: preferences.reducedMotion,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearReadingPreferences(storage: PreferenceStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(READING_PREFERENCES_KEY);
    return true;
  } catch {
    return false;
  }
}

export function applyReadingPreferences(
  preferences: ReadingPreferences,
  systemReducedMotion: boolean,
  root: Pick<HTMLElement, 'setAttribute'> = document.documentElement,
): void {
  root.setAttribute('data-text-size', preferences.textSize);
  root.setAttribute('data-high-contrast', String(preferences.highContrast));
  root.setAttribute('data-reduced-motion', String(preferences.reducedMotion || systemReducedMotion));
}

// Render this fixed, non-user-authored script in <head> before first paint.
// Keep the validation in sync with parseReadingPreferences; the tests exercise both.
export const READING_PREFERENCES_BOOTSTRAP = `(() => {
  let preference = { version: 1, textSize: 'standard', highContrast: false, reducedMotion: false };
  try {
    const value = JSON.parse(window.localStorage.getItem('bhuverify-reading-preferences') || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === 4 && value.version === 1
      && ['standard', 'large', 'extra-large'].includes(value.textSize)
      && typeof value.highContrast === 'boolean' && typeof value.reducedMotion === 'boolean') {
      preference = value;
    }
  } catch {}
  let systemReducedMotion = false;
  try { systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
  const root = document.documentElement;
  root.setAttribute('data-text-size', preference.textSize);
  root.setAttribute('data-high-contrast', String(preference.highContrast));
  root.setAttribute('data-reduced-motion', String(preference.reducedMotion || systemReducedMotion));
})();`;
