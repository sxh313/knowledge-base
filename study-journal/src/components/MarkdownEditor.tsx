import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function MarkdownEditor({ value, onChange, placeholder, minHeight = 400 }: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="card p-0 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
          <span className="font-mono font-bold text-brand-500">MD</span>
          <span>Markdown</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`btn-ghost text-xs ${!showPreview ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            onClick={() => setShowPreview(false)}
          >
            ✏️ 编辑
          </button>
          <button
            className={`btn-ghost text-xs ${showPreview ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            onClick={() => setShowPreview(true)}
          >
            👁️ 预览
          </button>
        </div>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div
          className="flex-1 p-5 prose-custom max-w-none overflow-y-auto"
          style={{ minHeight }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value || '*暂无内容*'}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          className="w-full bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed p-5"
          style={{ minHeight }}
          placeholder={placeholder || '在此输入 Markdown 内容...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}