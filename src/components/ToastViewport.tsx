import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { subscribeToasts, type ToastEvent } from '../lib/ui/toast';

const icons = { success: CheckCircle2, error: AlertCircle, info: Info, warning: TriangleAlert };
export default function ToastViewport() {
  const [items, setItems] = useState<ToastEvent[]>([]);
  useEffect(() => subscribeToasts((event) => {
    setItems((current) => [...current.slice(-2), event]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== event.id)), event.duration ?? 3600);
  }), []);
  return <div className="fixed inset-x-3 bottom-3 z-[120] flex flex-col items-end gap-2 pointer-events-none sm:left-auto sm:w-96" aria-live="polite">
    {items.map((item) => { const Icon = icons[item.kind]; return <div key={item.id} className={`toast-${item.kind} pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-md animate-slide-up`} role={item.kind === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p>{item.message && <p className="mt-0.5 text-xs opacity-80">{item.message}</p>}</div><button className="btn-ghost h-6 w-6 p-0" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label="关闭提示" type="button"><X className="h-3.5 w-3.5" /></button>
    </div>; })}
  </div>;
}
