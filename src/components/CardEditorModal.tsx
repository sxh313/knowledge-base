import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { KnowledgeCard } from '../lib/db/schema';
import { useCardStore, type NewCardInput } from '../stores/cardStore';

interface Props {
  /** 传入则为编辑模式，否则为新建 */
  card?: KnowledgeCard;
  onClose: () => void;
}

export default function CardEditorModal({ card, onClose }: Props) {
  const { addCard, editCard } = useCardStore();
  const isEdit = !!card;

  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const [tags, setTags] = useState<string[]>(card?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  // 打开时自动聚焦 + 禁止背景滚动
  useEffect(() => {
    frontRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      setError('正面和背面都不能为空');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && card) {
        await editCard(card.id, { front: front.trim(), back: back.trim(), tags });
      } else {
        const input: NewCardInput = {
          front: front.trim(),
          back: back.trim(),
          tags,
          cardType: 'basic',
        };
        await addCard(input);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="card relative w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{isEdit ? '✏️ 编辑卡片' : '➕ 新建卡片'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5" title="关闭" type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Front */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              正面 / 问题
            </label>
            <textarea
              ref={frontRef}
              className="input-field mt-1 min-h-[80px] resize-y"
              placeholder="例如：什么是闭包？"
              value={front}
              onChange={(e) => setFront(e.target.value)}
            />
          </div>

          {/* Back */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              背面 / 答案
            </label>
            <textarea
              className="input-field mt-1 min-h-[120px] resize-y"
              placeholder="例如：闭包是函数与其词法环境的组合…（支持 Markdown）"
              value={back}
              onChange={(e) => setBack(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">标签</label>
            <div className="mt-1 flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="输入标签后回车"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" className="btn-secondary text-xs" onClick={addTag}>添加</button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="tag-gray">
                    {t}
                    <button
                      type="button"
                      className="ml-1 opacity-60 hover:opacity-100"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {(front || back) && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">预览</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mb-1">正面</p>
                  <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap break-words">
                    {front || <span className="text-[var(--color-text-tertiary)]">（空）</span>}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mb-1">背面</p>
                  <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap break-words">
                    {back || <span className="text-[var(--color-text-tertiary)]">（空）</span>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !front.trim() || !back.trim()}
          >
            {saving ? '保存中…' : isEdit ? '保存修改' : '创建卡片'}
          </button>
        </div>
      </div>
    </div>
  );
}
