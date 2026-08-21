import { useEffect, type RefObject } from 'react';

const SELECTABLE = 'button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])';
export function useFocusTrap(open: boolean, rootRef: RefObject<HTMLElement>, initialRef?: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialRef?.current ?? root.querySelector<HTMLElement>(SELECTABLE))?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(SELECTABLE)).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, rootRef, initialRef]);
}
