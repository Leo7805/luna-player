import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  RotateCcw,
  Keyboard,
  Gauge,
  FastForward,
  Volume2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { CONTROL_LIMITS, type ControlSettings } from '../config/controlSettings';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';
import {
  createDefaultSettingsDraft,
  createSettingsDraft,
  validateSettingsDraft,
  type SettingsDraft,
} from '../utils/settingsDraft';

interface SettingsModalProps {
  isOpen: boolean;
  settings: ControlSettings;
  onSave: (nextSettings: ControlSettings) => void;
  onClose: () => void;
}

const SHORTCUT_REFERENCE: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: 'Space / K', label: 'Play / Pause' },
  { keys: '[ / ]', label: 'Playback speed − / +' },
  { keys: '\\', label: 'Toggle 1× / Max speed' },
  { keys: '; / \'', label: 'Volume − / +' },
  { keys: 'Enter / M', label: 'Mute / Unmute' },
  { keys: ', / .', label: 'Fine seek − / +' },
  { keys: '← / →', label: 'Medium seek − / +' },
  { keys: '↑ / ↓', label: 'Large seek − / +' },
  { keys: '< / >', label: 'Jump to Start / End' },
  { keys: 'F', label: 'Fullscreen' },
  { keys: 'T', label: 'Theater Mode' },
];

interface NumberFieldProps {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  testId: string;
  onChange: (nextValue: string) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  min,
  max,
  step,
  testId,
  onChange,
}) => {
  const stepValue = (direction: -1 | 1) => {
    const parsed = Number(value.trim());
    const base = value.trim() !== '' && Number.isFinite(parsed) ? parsed : min;
    const next = Math.min(max, Math.max(min, Number((base + direction * step).toFixed(4))));
    onChange(String(next));
  };

  return (
    <label className="space-y-1 text-xs">
      <span className="block font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="relative flex items-center">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          className="no-number-spinner w-full pl-3 pr-8 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/15 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 transition tabular-nums"
        />
        <div className="absolute right-1 inset-y-1 flex flex-col justify-center border-l border-slate-300/70 dark:border-white/10 pl-0.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Increase ${label}`}
            onClick={() => stepValue(1)}
            className="flex items-center justify-center w-5 h-3.5 rounded-t text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-200/70 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Decrease ${label}`}
            onClick={() => stepValue(-1)}
            className="flex items-center justify-center w-5 h-3.5 rounded-b text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-200/70 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>
    </label>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState<SettingsDraft>(() => createSettingsDraft(settings));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(createSettingsDraft(settings));
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const { errors, isValid, parsed } = validateSettingsDraft(draft);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !parsed) return;
    onSave(parsed);
    onClose();
  };

  const handleResetToDefaults = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurButtonAfterPointerClick(e);
    setDraft(createDefaultSettingsDraft());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl glass-panel border border-slate-300/80 dark:border-white/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-300/60 dark:border-white/10 shrink-0">
          <h2
            id="settings-modal-title"
            className="text-base sm:text-lg font-bold text-slate-900 dark:text-white"
          >
            Keyboard & Control Settings
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            data-testid="settings-close-button"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form
          noValidate
          onSubmit={handleSave}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5 custom-scrollbar"
        >
          {/* 1. Keyboard Shortcuts (Read-Only) */}
          <section aria-labelledby="settings-shortcuts-heading" className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Keyboard className="w-3.5 h-3.5" />
              <h3 id="settings-shortcuts-heading">Keyboard Shortcuts</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SHORTCUT_REFERENCE.map((item) => (
                <div
                  key={item.keys}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-xs"
                >
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/15 font-mono text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 shrink-0">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Playback Speed */}
          <section aria-labelledby="settings-speed-heading" className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Gauge className="w-3.5 h-3.5" />
              <h3 id="settings-speed-heading">Playback Speed</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField
                label="Step (×)"
                value={draft.speedStep}
                min={CONTROL_LIMITS.playbackRate.minStep}
                max={CONTROL_LIMITS.playbackRate.maxStep}
                step={0.05}
                testId="settings-speed-step"
                onChange={(val) => setDraft({ ...draft, speedStep: val })}
              />
              <NumberField
                label="Minimum (×)"
                value={draft.speedMin}
                min={CONTROL_LIMITS.playbackRate.minRate}
                max={CONTROL_LIMITS.playbackRate.maxRate}
                step={0.25}
                testId="settings-speed-min"
                onChange={(val) => setDraft({ ...draft, speedMin: val })}
              />
              <NumberField
                label="Maximum (×)"
                value={draft.speedMax}
                min={CONTROL_LIMITS.playbackRate.minRate}
                max={CONTROL_LIMITS.playbackRate.maxRate}
                step={0.25}
                testId="settings-speed-max"
                onChange={(val) => setDraft({ ...draft, speedMax: val })}
              />
            </div>
            {(errors.speedStep || errors.speedRange) && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {errors.speedStep ?? errors.speedRange}
              </p>
            )}
          </section>

          {/* 3. Seeking */}
          <section aria-labelledby="settings-seek-heading" className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <FastForward className="w-3.5 h-3.5" />
              <h3 id="settings-seek-heading">Seeking</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField
                label="Fine Seek (s)"
                value={draft.fineSeconds}
                min={CONTROL_LIMITS.seek.fineMin}
                max={CONTROL_LIMITS.seek.fineMax}
                step={0.5}
                testId="settings-seek-fine"
                onChange={(val) => setDraft({ ...draft, fineSeconds: val })}
              />
              <NumberField
                label="Medium Seek (s)"
                value={draft.nearSeconds}
                min={CONTROL_LIMITS.seek.nearMin}
                max={CONTROL_LIMITS.seek.nearMax}
                step={1}
                testId="settings-seek-near"
                onChange={(val) => setDraft({ ...draft, nearSeconds: val })}
              />
              <NumberField
                label="Large Seek (s)"
                value={draft.farSeconds}
                min={CONTROL_LIMITS.seek.farMin}
                max={CONTROL_LIMITS.seek.farMax}
                step={5}
                testId="settings-seek-far"
                onChange={(val) => setDraft({ ...draft, farSeconds: val })}
              />
            </div>
            {errors.seek && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {errors.seek}
              </p>
            )}
          </section>

          {/* 4. Volume */}
          <section aria-labelledby="settings-volume-heading" className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Volume2 className="w-3.5 h-3.5" />
              <h3 id="settings-volume-heading">Volume</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField
                label="Volume Step (%)"
                value={draft.volumeStepPercent}
                min={1}
                max={100}
                step={1}
                testId="settings-volume-step"
                onChange={(val) => setDraft({ ...draft, volumeStepPercent: val })}
              />
            </div>
            {errors.volumeStep && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {errors.volumeStep}
              </p>
            )}
          </section>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-300/60 dark:border-white/10">
            <button
              type="button"
              onClick={handleResetToDefaults}
              data-testid="settings-reset-button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                data-testid="settings-cancel-button"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid}
                data-testid="settings-save-button"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 disabled:cursor-not-allowed text-white shadow-md shadow-indigo-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
