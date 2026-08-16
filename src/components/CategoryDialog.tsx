import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface CategoryDialogProps {
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}

export default function CategoryDialog({
  title,
  initialValue = '',
  confirmLabel = '保存',
  onClose,
  onSubmit,
}: CategoryDialogProps) {
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) {
      setError('请输入分类名称');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(normalized);
      onClose();
    } catch (submitError) {
      setError((submitError as Error).message || '保存失败');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 p-4" onMouseDown={() => { if (!busy) onClose(); }}>
      <form className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
          <button type="button" className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)]" onClick={onClose} disabled={busy} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          分类名称
          <input
            ref={inputRef}
            className="input-field mt-1"
            value={name}
            onChange={(event) => { setName(event.target.value); setError(''); }}
            maxLength={80}
            placeholder="输入分类名称"
          />
        </label>
        {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onClose} disabled={busy}>取消</button>
          <button type="submit" className="btn-primary text-sm" disabled={busy || !name.trim()}>{busy ? '保存中...' : confirmLabel}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
