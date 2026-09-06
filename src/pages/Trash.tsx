import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RotateCcw, FileText, ArrowLeft } from 'lucide-react';
import type { JournalEntry } from '../lib/db/schema';
import { getTrashedJournals, restoreJournal, purgeJournal } from '../lib/db/repositories/journals';
import { useJournalStore } from '../stores/journalStore';

export default function Trash() {
  const navigate = useNavigate();
  const { loadAll } = useJournalStore();
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const trashed = await getTrashedJournals();
    trashed.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    setItems(trashed);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (id: string) => {
    await restoreJournal(id);
    await loadAll();
    await load();
  };

  const handlePurge = async (id: string) => {
    if (confirmPurge !== id) { setConfirmPurge(id); return; }
    await purgeJournal(id);
    setConfirmPurge(null);
    await load();
  };

  return (
    <div className="content-frame-reading animate-fade-in space-y-4">
      <div className="page-hero">
        <div className="page-hero-copy">
          <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => navigate('/')} title="返回">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="h-6 w-6" /> 回收站
          </h1>
          </div>
          <p className="page-subtitle">已删除的内容会暂时保留，可恢复或永久清理。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--color-text-secondary)]">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon mb-3">
            <Trash2 className="h-8 w-8 text-[var(--color-text-tertiary)]" />
          </div>
          <p className="text-[var(--color-text-secondary)] text-sm">回收站是空的</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <article key={item.id} className="card flex items-center gap-3">
              <FileText className="h-4 w-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--color-text)] truncate">{item.title || '无标题'}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  删除于 {item.deletedAt ? new Date(item.deletedAt).toLocaleString('zh-CN') : '—'}
                </p>
              </div>
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => handleRestore(item.id)}>
                <RotateCcw className="h-3.5 w-3.5" /> 恢复
              </button>
              <button
                className={`btn-ghost text-xs px-3 py-1.5 ${confirmPurge === item.id ? '!text-[var(--color-danger)]' : ''}`}
                onClick={() => handlePurge(item.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmPurge === item.id ? '确认删除？' : '彻底删除'}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
