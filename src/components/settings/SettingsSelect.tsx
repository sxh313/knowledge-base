import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SettingsSelectOption = {
  value: string;
  label: string;
};

type SettingsSelectProps = {
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

/** Settings dropdown with a rounded, app-owned menu instead of the browser popup. */
export default function SettingsSelect({ value, options, onChange, className = '', ariaLabel }: SettingsSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find(option => option.value === value) ?? { value, label: value };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`settings-select ${open ? 'settings-select-open' : ''} ${className}`}>
      <button
        type="button"
        className="settings-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="min-w-0 truncate">{selected.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={listId} className="settings-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`settings-select-option ${option.value === value ? 'settings-select-option-selected' : ''}`}
              onClick={() => choose(option.value)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {option.value === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
