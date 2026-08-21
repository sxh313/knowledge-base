export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface ToastEvent { id: string; kind: ToastKind; title: string; message?: string; duration?: number }

const listeners = new Set<(event: ToastEvent) => void>();
export function subscribeToasts(listener: (event: ToastEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function showToast(kind: ToastKind, title: string, message?: string, duration = 3600) {
  const event = { id: crypto.randomUUID(), kind, title, message, duration };
  listeners.forEach((listener) => listener(event));
  return event.id;
}
