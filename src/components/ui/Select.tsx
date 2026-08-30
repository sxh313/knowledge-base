import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  menuClassName?: string;
  size?: 'compact' | 'default';
  placement?: 'auto' | 'up' | 'down';
  disabled?: boolean;
};

type Position = { left: number; top: number; width: number; maxHeight: number; direction: 'up' | 'down' };

export default function Select({ value, options, onChange, ariaLabel, className = '', menuClassName = '', size = 'default', placement = 'auto', disabled = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const direction = placement === 'up' || (placement === 'auto' && spaceBelow < 240 && spaceAbove > spaceBelow) ? 'up' : 'down';
    const maxHeight = Math.max(120, Math.min(320, direction === 'up' ? spaceAbove - 12 : spaceBelow - 12));
    setPosition({
      left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 200) - 12),
      top: direction === 'up' ? rect.top - gap : rect.bottom + gap,
      width: Math.max(rect.width, 200),
      maxHeight,
      direction,
    });
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const move = (step: number) => {
    if (!options.length) return;
    let next = activeIndex;
    do next = (next + step + options.length) % options.length;
    while (options[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onLayout = () => updatePosition();
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!triggerRef.current?.contains(node) && !menuRef.current?.contains(node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-select-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) setOpen(true); else move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) setOpen(true); else move(-1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!open) setOpen(true); else choose(activeIndex); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
    else if (event.key === 'Home' && open) { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === 'End' && open) { event.preventDefault(); setActiveIndex(Math.max(0, options.length - 1)); }
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={`select-trigger ${size === 'compact' ? 'select-trigger-compact' : ''} ${open ? 'select-trigger-open' : ''} ${className}`}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listId}
      disabled={disabled}
      onClick={() => setOpen(current => !current)}
      onKeyDown={handleKeyDown}
    >
      <span className="select-trigger-label">{selected?.icon}<span className="truncate">{selected?.label ?? value}</span></span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && position && createPortal(
      <div
        ref={menuRef}
        id={listId}
        className={`select-menu ${position.direction === 'up' ? 'select-menu-up' : 'select-menu-down'} ${menuClassName}`}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={`${listId}-option-${activeIndex}`}
        style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        onKeyDown={handleKeyDown}
      >
        {options.map((option, index) => <div key={`${option.value}-${index}`}>
          {option.group && (index === 0 || options[index - 1]?.group !== option.group) && <div className="select-group-label">{option.group}</div>}
          <button
            id={`${listId}-option-${index}`}
            data-select-index={index}
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            tabIndex={-1}
            className={`select-option ${option.value === value ? 'select-option-selected' : ''} ${activeIndex === index ? 'select-option-active' : ''}`}
            onPointerMove={() => setActiveIndex(index)}
            onClick={() => choose(index)}
          >
            {option.icon && <span className="select-option-icon">{option.icon}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate">{option.label}</span>{option.description && <span className="select-option-description">{option.description}</span>}</span>
            {option.value === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>
        </div>)}
      </div>,
      document.body,
    )}
  </>;
}
