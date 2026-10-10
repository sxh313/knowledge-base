import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type DropdownMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
};

type DropdownMenuProps = {
  label: string;
  items: DropdownMenuItem[];
  icon?: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  placement?: 'up' | 'down';
};

export default function DropdownMenu({ label, items, icon, className = '', align = 'right', placement = 'down' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const move = (step: number) => {
    if (!items.length) return;
    let next = activeIndex;
    do next = (next + step + items.length) % items.length;
    while (items[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) setOpen(true); else move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) setOpen(true); else move(-1); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); const item = items[activeIndex]; if (item && !item.disabled) { item.onSelect(); setOpen(false); } }
  };

  return <div ref={rootRef} className={`dropdown-root ${className}`}>
    <button ref={triggerRef} type="button" className={`btn-ghost dropdown-trigger ${open ? 'dropdown-trigger-open' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)} onKeyDown={handleKeyDown}>
      {icon}{label}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div id={menuId} className={`dropdown-menu ${placement === 'up' ? 'dropdown-menu-up' : ''} ${align === 'left' ? 'dropdown-menu-left' : 'dropdown-menu-right'}`} role="menu" onKeyDown={handleKeyDown}>
      {items.map((item, index) => <button key={item.label} type="button" role="menuitem" disabled={item.disabled} tabIndex={-1} className={`dropdown-item ${activeIndex === index ? 'dropdown-item-active' : ''} ${item.tone === 'danger' ? 'dropdown-item-danger' : ''}`} onPointerMove={() => setActiveIndex(index)} onClick={() => { item.onSelect(); setOpen(false); }}>
        {item.icon}<span>{item.label}</span>
      </button>)}
    </div>}
  </div>;
}
