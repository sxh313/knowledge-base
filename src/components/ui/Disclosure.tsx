import { type ReactNode, useId } from 'react';
import { ChevronDown } from 'lucide-react';

type DisclosureProps = {
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  buttonClassName?: string;
  contentClassName?: string;
};

export default function Disclosure({ open, onToggle, label, children, icon, className = '', buttonClassName = '', contentClassName = '' }: DisclosureProps) {
  const contentId = useId();
  return <div className={className}>
    <button type="button" className={`disclosure-trigger ${buttonClassName}`} aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
      {icon}<span className="min-w-0 flex-1 text-left">{label}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div id={contentId} className={`disclosure-content ${contentClassName}`}>{children}</div>}
  </div>;
}
