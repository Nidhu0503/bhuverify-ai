'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, parseThemePreference, readThemePreference, saveThemePreference, THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';
import './theme-selector.css';

export function ThemeSelector() {
  const id = useId();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const current = useRef<ThemePreference>('system');
  const media = useRef<MediaQueryList | null>(null);
  const [status, setStatus] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    media.current = query;
    const initial = readThemePreference();
    current.current = initial;
    setPreference(initial);
    applyTheme(initial, query.matches);
    const onSystemChange = () => applyTheme(current.current, query.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      // Ignore sessionStorage events: this preference belongs to localStorage.
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      const next = parseThemePreference(event.newValue);
      current.current = next;
      setPreference(next);
      applyTheme(next, query.matches);
      setStorageFailed(false);
      setStatus('Color theme updated from another tab.');
    };
    query.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      query.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
      media.current = null;
    };
  }, []);

  function changeTheme(next: ThemePreference) {
    current.current = next;
    setPreference(next);
    applyTheme(next, media.current?.matches ?? false);
    const saved = saveThemePreference(next);
    setStorageFailed(!saved);
    setStatus(saved ? 'Color theme saved in this browser.' : 'Theme applied for this visit. Your browser could not save it.');
  }

  const Icon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor;
  return (
    <div className="theme-selector">
      <label htmlFor={`${id}-theme`} className="theme-selector-control">
        <Icon aria-hidden="true" />
        <span>Theme</span>
        <select id={`${id}-theme`} aria-label="Color theme" aria-describedby={`${id}-hint`} value={preference} onChange={event => changeTheme(event.target.value as ThemePreference)}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <span id={`${id}-hint`} className="sr-only">System follows your device’s light or dark appearance.</span>
      <span className={storageFailed ? 'theme-selector-notice' : 'sr-only'} role="status" aria-live="polite">{status}</span>
    </div>
  );
}
