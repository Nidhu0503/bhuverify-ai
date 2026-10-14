'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  applyReadingPreferences,
  clearReadingPreferences,
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  readReadingPreferences,
  READING_PREFERENCES_KEY,
  saveReadingPreferences,
  type ReadingPreferences,
  type ReadingTextSize,
} from '@/lib/accessibility';
import './accessibility-controls.css';

const textSizes: { value: ReadingTextSize; label: string; scale: string }[] = [
  { value: 'standard', label: 'Standard', scale: '100%' },
  { value: 'large', label: 'Large', scale: '125%' },
  { value: 'extra-large', label: 'Extra large', scale: '150%' },
];

export function AccessibilityControls() {
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const currentPreferences = useRef<ReadingPreferences>({ ...DEFAULT_READING_PREFERENCES });
  const motionPreference = useRef<MediaQueryList | null>(null);
  const [preferences, setPreferences] = useState<ReadingPreferences>({ ...DEFAULT_READING_PREFERENCES });
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('');

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionPreference.current = media;
    const stored = readReadingPreferences();
    currentPreferences.current = stored;
    setPreferences(stored);
    setSystemReducedMotion(media.matches);
    applyReadingPreferences(stored, media.matches);

    const updateSystemMotion = () => {
      setSystemReducedMotion(media.matches);
      applyReadingPreferences(currentPreferences.current, media.matches);
    };
    const updateFromStorage = (event: StorageEvent) => {
      if (event.key !== READING_PREFERENCES_KEY && event.key !== null) return;
      const next = parseReadingPreferences(event.newValue);
      currentPreferences.current = next;
      setPreferences(next);
      applyReadingPreferences(next, media.matches);
    };

    media.addEventListener('change', updateSystemMotion);
    window.addEventListener('storage', updateFromStorage);
    return () => {
      media.removeEventListener('change', updateSystemMotion);
      window.removeEventListener('storage', updateFromStorage);
      motionPreference.current = null;
    };
  }, []);

  function updatePreferences(next: ReadingPreferences) {
    currentPreferences.current = next;
    setPreferences(next);
    applyReadingPreferences(next, motionPreference.current?.matches ?? systemReducedMotion);
    const saved = saveReadingPreferences(next);
    setStatus(saved ? 'Reading settings saved on this device.' : 'Settings applied for this visit. Your browser could not save them.');
  }

  function resetPreferences() {
    const next = { ...DEFAULT_READING_PREFERENCES };
    currentPreferences.current = next;
    setPreferences(next);
    applyReadingPreferences(next, motionPreference.current?.matches ?? systemReducedMotion);
    const cleared = clearReadingPreferences();
    setStatus(cleared ? 'Reading settings reset. Your device’s reduced-motion preference still applies.' : 'Settings reset for this visit. Your browser could not clear saved settings.');
  }

  function openDialog() {
    if (!dialog.current || dialog.current.open) return;
    setStatus('');
    dialog.current.showModal();
    setIsOpen(true);
    closeButton.current?.focus({ preventScroll: true });
  }

  function closeDialog() {
    dialog.current?.close();
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="reading-settings-trigger"
        aria-haspopup="dialog"
        aria-controls={`${id}-dialog`}
        aria-expanded={isOpen}
        onClick={openDialog}
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>Reading settings</span>
      </button>
      <dialog
        ref={dialog}
        id={`${id}-dialog`}
        className="reading-settings-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          // Native modal dialogs make the page inert, but Chrome can still move
          // keyboard focus to browser chrome at the first/last control boundary.
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        onCancel={event => { event.preventDefault(); closeDialog(); }}
        onClose={() => { setIsOpen(false); opener.current?.focus({ preventScroll: true }); }}
      >
        <div className="reading-settings-header">
          <div>
            <p className="reading-settings-eyebrow">Make yourself comfortable</p>
            <h2 id={`${id}-title`}>Reading settings</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="reading-settings-close"
            aria-label="Close reading settings"
            onClick={closeDialog}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="reading-settings-description" id={`${id}-description`}>
          Adjust how BhuVerify looks and moves. Changes apply immediately.
        </p>
        <fieldset className="reading-settings-sizes">
          <legend>Text size</legend>
          <div className="reading-settings-size-options">
            {textSizes.map(size => (
              <label key={size.value} className="reading-settings-size-option">
                <input
                  type="radio"
                  name={`${id}-text-size`}
                  value={size.value}
                  aria-label={size.label}
                  checked={preferences.textSize === size.value}
                  onChange={() => updatePreferences({ ...preferences, textSize: size.value })}
                />
                <span>{size.label}<small>{size.scale}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="reading-settings-row">
          <div>
            <h3 id={`${id}-contrast-label`}>High contrast</h3>
            <p id={`${id}-contrast-description`}>Stronger text, borders, and backgrounds.</p>
          </div>
          <button
            type="button"
            role="switch"
            className="reading-settings-switch"
            aria-checked={preferences.highContrast}
            aria-labelledby={`${id}-contrast-label`}
            aria-describedby={`${id}-contrast-description`}
            onClick={() => updatePreferences({ ...preferences, highContrast: !preferences.highContrast })}
          >
            <span className="reading-settings-switch-track" aria-hidden="true"><span /></span>
            <span className="reading-settings-switch-value" aria-hidden="true">{preferences.highContrast ? 'On' : 'Off'}</span>
          </button>
        </div>
        <div className="reading-settings-row">
          <div>
            <h3 id={`${id}-motion-label`}>Reduced motion</h3>
            <p id={`${id}-motion-description`}>
              {systemReducedMotion ? 'On because your device requests less motion. Change this in your device settings.' : 'Limit animations and smooth scrolling.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            className="reading-settings-switch"
            aria-checked={preferences.reducedMotion || systemReducedMotion}
            aria-labelledby={`${id}-motion-label`}
            aria-describedby={`${id}-motion-description`}
            disabled={systemReducedMotion}
            onClick={() => updatePreferences({ ...preferences, reducedMotion: !preferences.reducedMotion })}
          >
            <span className="reading-settings-switch-track" aria-hidden="true"><span /></span>
            <span className="reading-settings-switch-value" aria-hidden="true">{preferences.reducedMotion || systemReducedMotion ? 'On' : 'Off'}</span>
          </button>
        </div>
        <p className="reading-settings-privacy">Only these display preferences are saved in this browser. Your documents are not read or stored by these controls.</p>
        <p className="reading-settings-status" role="status" aria-live="polite">{status}</p>
        <div className="reading-settings-footer">
          <button type="button" className="reading-settings-reset" onClick={resetPreferences}>Reset settings</button>
          <button type="button" className="reading-settings-done" onClick={closeDialog}>Done</button>
        </div>
      </dialog>
    </>
  );
}
