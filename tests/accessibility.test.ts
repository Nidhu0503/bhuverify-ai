import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  applyReadingPreferences,
  clearReadingPreferences,
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  readReadingPreferences,
  READING_PREFERENCES_BOOTSTRAP,
  READING_PREFERENCES_KEY,
  saveReadingPreferences,
  type ReadingPreferences,
} from '../src/lib/accessibility';

const custom: ReadingPreferences = { version: 1, textSize: 'extra-large', highContrast: true, reducedMotion: true };
const invalidValues: unknown[] = [
  null, [], true, 'large', {},
  { ...custom, version: 2 },
  { ...custom, version: '1' },
  { ...custom, textSize: 'huge' },
  { ...custom, highContrast: 'true' },
  { ...custom, reducedMotion: 1 },
  { ...custom, caseId: 'must-not-be-read-or-stored' },
  { textSize: 'large', highContrast: true, reducedMotion: false },
];

function storage(raw: string | null = null) {
  return { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() };
}

function runBootstrap(raw: string | null, reducedMotion = false, blocked = false) {
  const attributes: Record<string, string> = {};
  runInNewContext(READING_PREFERENCES_BOOTSTRAP, {
    document: { documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } } },
    window: {
      get localStorage() {
        if (blocked) throw new Error('Storage is blocked');
        return storage(raw);
      },
      matchMedia: () => ({ matches: reducedMotion }),
    },
  });
  return attributes;
}

describe('reading preference storage', () => {
  it('accepts the supported version and sizes', () => {
    for (const textSize of ['standard', 'large', 'extra-large']) {
      const preferences = { ...custom, textSize };
      expect(parseReadingPreferences(JSON.stringify(preferences))).toEqual(preferences);
    }
  });

  it('falls back safely for missing, malformed and unexpected shapes', () => {
    for (const value of invalidValues) {
      expect(parseReadingPreferences(JSON.stringify(value))).toEqual(DEFAULT_READING_PREFERENCES);
    }
    expect(parseReadingPreferences('{broken')).toEqual(DEFAULT_READING_PREFERENCES);
    expect(parseReadingPreferences(null)).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it('uses only the dedicated preferences key and non-sensitive fields', () => {
    const adapter = storage(JSON.stringify(custom));
    expect(readReadingPreferences(adapter)).toEqual(custom);
    expect(adapter.getItem).toHaveBeenCalledExactlyOnceWith(READING_PREFERENCES_KEY);
    expect(saveReadingPreferences({ ...custom, documentText: 'private' } as ReadingPreferences, adapter)).toBe(true);
    expect(adapter.setItem).toHaveBeenCalledExactlyOnceWith(READING_PREFERENCES_KEY, JSON.stringify(custom));
    expect(clearReadingPreferences(adapter)).toBe(true);
    expect(adapter.removeItem).toHaveBeenCalledExactlyOnceWith(READING_PREFERENCES_KEY);
  });

  it('continues without storage or when storage operations throw', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(readReadingPreferences(blocked)).toEqual(DEFAULT_READING_PREFERENCES);
    expect(saveReadingPreferences(custom, blocked)).toBe(false);
    expect(clearReadingPreferences(blocked)).toBe(false);
    expect(readReadingPreferences(null)).toEqual(DEFAULT_READING_PREFERENCES);
    expect(saveReadingPreferences(custom, null)).toBe(false);
    expect(clearReadingPreferences(null)).toBe(false);
  });
});

describe('reading preference application and pre-paint initialization', () => {
  it('sets all three root attributes and never overrides system reduced motion', () => {
    const root = { setAttribute: vi.fn() };
    applyReadingPreferences({ ...custom, reducedMotion: false }, true, root);
    expect(root.setAttribute.mock.calls).toEqual([
      ['data-text-size', 'extra-large'], ['data-high-contrast', 'true'], ['data-reduced-motion', 'true'],
    ]);
    root.setAttribute.mockClear();
    applyReadingPreferences(DEFAULT_READING_PREFERENCES, false, root);
    expect(root.setAttribute.mock.calls).toEqual([
      ['data-text-size', 'standard'], ['data-high-contrast', 'false'], ['data-reduced-motion', 'false'],
    ]);
  });

  it('keeps bootstrap validation consistent with client validation', () => {
    for (const raw of [null, '{broken', JSON.stringify(custom), ...invalidValues.map(value => JSON.stringify(value))]) {
      const parsed = parseReadingPreferences(raw);
      expect(runBootstrap(raw)).toEqual({
        'data-text-size': parsed.textSize,
        'data-high-contrast': String(parsed.highContrast),
        'data-reduced-motion': String(parsed.reducedMotion),
      });
    }
  });

  it('honours system motion preferences even with saved false or blocked storage', () => {
    expect(runBootstrap(JSON.stringify(DEFAULT_READING_PREFERENCES), true)['data-reduced-motion']).toBe('true');
    expect(runBootstrap(null, true, true)).toEqual({
      'data-text-size': 'standard', 'data-high-contrast': 'false', 'data-reduced-motion': 'true',
    });
  });
});
