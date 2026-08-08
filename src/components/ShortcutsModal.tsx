import { X } from 'lucide-react';

const SHORTCUTS = [
  {
    group: '全局',
    items: [
      { keys: 'Ctrl+K', desc: '命令面板' },
      { keys: 'Ctrl+N', desc: '新建文档' },
      { keys: 'Ctrl+/', desc: '快捷键面板' },
      { keys: 'Esc', desc: '关闭面板' },
    ],
  },
  {
    group: '编辑',
    items: [
      { keys: 'Ctrl+S', desc: '保存' },
      { keys: 'Ctrl+Z / Y', desc: '撤销 / 前进' },
      { keys: 'Ctrl+V', desc: '粘贴图片' },
      { keys: 'Ctrl+Shift+V', desc: '粘贴纯文本' },
      { keys: '/', desc: '插入块命令' },
    ],
  },
];

export default function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] p-6 max-w-md w-full mx-4 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">⌨️ 快捷键</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          {SHORTCUTS.map(g => (
            <div key={g.group}>
              <h3 className="text-xs font-medium text-[var(--color-text-tertiary)] mb-2">{g.group}</h3>
              <div className="space-y-1.5">
                {g.items.map(it => (
                  <div key={it.keys} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">{it.desc}</span>
                    <kbd className="kbd">{it.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
