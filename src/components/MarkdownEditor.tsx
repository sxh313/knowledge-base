import { useState, useRef, useCallback } from 'react';
import MarkdownContent from './MarkdownContent';
import remarkGfm from 'remark-gfm';
import { Bold, Italic, Code, List, Heading, Quote, Link as LinkIcon, Undo2, Redo2 } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** 撤销函数（由父组件通过 useHistory 提供） */
  onUndo?: () => void;
  /** 重做函数 */
  onRedo?: () => void;
  /** 撤销/重做是否可用 */
  canUndo?: boolean;
  canRedo?: boolean;
}

export default function MarkdownEditor({ value, onChange, placeholder, minHeight = 400, onUndo, onRedo, canUndo, canRedo }: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** 在当前光标位置插入或包裹文本 */
  const wrapSelection = useCallback((before: string, after: string = before, placeholder = '') => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end);

    onChange(newValue);

    // 恢复光标位置（选中包裹后的文本）
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }, [value, onChange]);

  /** 在行首插入前缀（如 # 标题、> 引用、- 列表） */
  const insertLinePrefix = useCallback((prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);

    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }, [value, onChange]);

  // ─── 格式化操作 ───
  const handleBold = () => wrapSelection('**', '**', '粗体文本');
  const handleItalic = () => wrapSelection('*', '*', '斜体文本');
  const handleCode = () => wrapSelection('`', '`', '代码');
  const handleHeading = () => insertLinePrefix('## ');
  const handleList = () => insertLinePrefix('- ');
  const handleQuote = () => insertLinePrefix('> ');
  const handleLink = () => wrapSelection('[', '](https://)', '链接文字');

  /** 键盘快捷键处理 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;

    if (!mod) return;

    const key = e.key.toLowerCase();

    switch (key) {
      case 'b':
        e.preventDefault();
        handleBold();
        break;
      case 'i':
        e.preventDefault();
        handleItalic();
        break;
      case 'z':
        if (e.shiftKey) {
          // Ctrl+Shift+Z = 重做
          e.preventDefault();
          onRedo?.();
        } else {
          // Ctrl+Z = 撤销
          e.preventDefault();
          onUndo?.();
        }
        break;
      case 'y':
        // Ctrl+Y = 重做（Windows 风格）
        e.preventDefault();
        onRedo?.();
        break;
      case 'e':
        // Ctrl+E = 行内代码（部分编辑器的习惯）
        e.preventDefault();
        handleCode();
        break;
    }
  };

  const formatButtons = [
    { icon: Bold, action: handleBold, label: '加粗 (Ctrl+B)' },
    { icon: Italic, action: handleItalic, label: '斜体 (Ctrl+I)' },
    { icon: Code, action: handleCode, label: '代码 (Ctrl+E)' },
    { icon: Heading, action: handleHeading, label: '标题' },
    { icon: List, action: handleList, label: '列表' },
    { icon: Quote, action: handleQuote, label: '引用' },
    { icon: LinkIcon, action: handleLink, label: '链接' },
  ];

  return (
    <div className="card p-0 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-1">
          <span className="font-mono font-bold text-brand-500 text-xs mr-2">MD</span>
          {/* 撤销/重做 */}
          {!showPreview && (
            <>
              <button
                className="btn-ghost p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={onUndo}
                title="撤销 (Ctrl+Z)"
                disabled={!canUndo}
                type="button"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost p-1.5 disabled:opacity-30 disabled:cursor-not-allowed mr-1"
                onClick={onRedo}
                title="重做 (Ctrl+Shift+Z)"
                disabled={!canRedo}
                type="button"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
              {/* 格式化按钮 */}
              {formatButtons.map(({ icon: Icon, action, label }) => (
                <button
                  key={label}
                  className="btn-ghost p-1.5"
                  onClick={action}
                  title={label}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`btn-ghost text-xs ${!showPreview ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            onClick={() => setShowPreview(false)}
            type="button"
          >
            ✏️ 编辑
          </button>
          <button
            className={`btn-ghost text-xs ${showPreview ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            onClick={() => setShowPreview(true)}
            type="button"
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
          <MarkdownContent remarkPlugins={[remarkGfm]}>
            {value || '*暂无内容*'}
          </MarkdownContent>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed p-5"
          style={{ minHeight }}
          placeholder={placeholder || '在此输入 Markdown 内容...\n\n快捷键：Ctrl+B 加粗 | Ctrl+I 斜体 | Ctrl+Z 撤销 | Ctrl+S 保存'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
      )}
    </div>
  );
}
