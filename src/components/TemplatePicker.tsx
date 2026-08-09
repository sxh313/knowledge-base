import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { TEMPLATES, type DocTemplate } from '../lib/templates';
import { useJournalStore } from '../stores/journalStore';

interface TemplatePickerProps {
  onClose: () => void;
}

export default function TemplatePicker({ onClose }: TemplatePickerProps) {
  const navigate = useNavigate();
  const { create, setCurrent } = useJournalStore();

  const handlePick = async (tpl: DocTemplate) => {
    const content = tpl.build();
    const title = tpl.key === 'blank'
      ? ''
      : tpl.name === '每日复盘'
        ? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? tpl.name
        : tpl.name;
    const contentPlain = content.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim();
    const entry = await create({
      title,
      content,
      contentPlain,
      tags: tpl.tags,
      subject: tpl.subject,
      sourceType: 'manual',
    });
    setCurrent(entry);
    onClose();
    navigate(`/edit/${entry.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">从模板新建</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 模板网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-5 max-h-[70vh] overflow-y-auto">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => handlePick(tpl)}
              className="group flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-4 text-left transition-all hover:border-[var(--color-primary)] hover:shadow-md hover:-translate-y-0.5"
            >
              <span className="text-2xl shrink-0">{tpl.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)]">{tpl.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 line-clamp-2">{tpl.desc}</p>
                {tpl.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {tpl.tags.map(t => <span key={t} className="tag-gray text-[10px]">#{t}</span>)}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--color-border)] px-5 py-2.5 text-center text-[11px] text-[var(--color-text-tertiary)]">
          选择模板后会自动创建文档并跳转到编辑页
        </div>
      </div>
    </div>
  );
}
