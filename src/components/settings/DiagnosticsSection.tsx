import { useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, Copy, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { clearDiagnostics, listDiagnostics, type DiagnosticOutcome } from '../../lib/observability/diagnostics';

const outcomeMeta: Record<DiagnosticOutcome, { label: string; icon: typeof CheckCircle2; className: string }> = {
  success: { label: '成功', icon: CheckCircle2, className: 'text-[var(--color-success)]' },
  failure: { label: '失败', icon: XCircle, className: 'text-[var(--color-danger)]' },
  cancelled: { label: '已取消', icon: CircleAlert, className: 'text-amber-600' },
};

export default function DiagnosticsSection() {
  const [events, setEvents] = useState(() => listDiagnostics(30));

  const refresh = () => setEvents(listDiagnostics(30));
  const clear = () => {
    clearDiagnostics();
    refresh();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    } catch {
      // Clipboard permission is optional; diagnostics remain visible in the panel.
    }
  };

  return (
    <section id="diagnostics" className="scroll-mt-6 space-y-3">
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-4 w-4" />运行诊断</h2>
            <p className="mt-1 text-xs text-gray-400">仅保留最近的脱敏运行结果，用于定位 AI、同步、索引和页面异常。</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button className="btn-ghost h-8 w-8 p-0" onClick={refresh} title="刷新诊断" aria-label="刷新诊断" type="button"><RotateCcw className="h-4 w-4" /></button>
            <button className="btn-ghost h-8 w-8 p-0" onClick={() => void copy()} title="复制诊断" aria-label="复制诊断" type="button"><Copy className="h-4 w-4" /></button>
            <button className="btn-ghost h-8 w-8 p-0" onClick={clear} title="清空诊断" aria-label="清空诊断" type="button"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">暂无诊断记录</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
            {events.map((event) => {
              const meta = outcomeMeta[event.outcome];
              const Icon = meta.icon;
              return (
                <div key={event.id} className="flex items-start gap-2 px-3 py-2.5 text-xs">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.className}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-[var(--color-text)]">{event.operation}</span>
                      <span className="text-[var(--color-text-tertiary)]">{event.category} · {meta.label}</span>
                      <span className="text-[var(--color-text-tertiary)]">{event.platform} · v{event.version}</span>
                    </div>
                    {event.message && <p className="mt-1 break-words text-[var(--color-text-tertiary)]">{event.message}</p>}
                  </div>
                  <time className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-tertiary)]" dateTime={new Date(event.createdAt).toISOString()}>
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </time>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
