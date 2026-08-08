import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Strikethrough,
  Code, Link as LinkIcon, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, Pilcrow, CodeXml, Minus, Image as ImageIcon,
} from 'lucide-react';
import { markdownToHtml, htmlToMarkdown } from '../lib/mardownUtils';
import { getSlashCommands, type SlashCommandItem } from './tiptap/slashCommand';

interface RichTextEditorProps {
  value: string;          // Markdown
  onChange: (value: string) => void;  // 返回 Markdown
  placeholder?: string;
  autoFocus?: boolean;
}

export default function RichTextEditor({ value, onChange, placeholder, autoFocus }: RichTextEditorProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashItemsRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder || '输入 / 插入内容，或直接输入文字...',
      }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: markdownToHtml(value),
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'prose-custom max-w-none focus:outline-none min-h-[400px] px-1 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(htmlToMarkdown(html));
    },
  });

  // 外部内容变化时同步到编辑器（如加载已有文档）
  const lastEmittedRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedRef.current) {
      const newHtml = markdownToHtml(value);
      if (editor.getHTML() !== newHtml) {
        editor.commands.setContent(newHtml);
      }
      lastEmittedRef.current = value;
    }
  }, [value, editor]);

  const allCommands = getSlashCommands();
  const filteredCommands = slashQuery
    ? allCommands.filter(c =>
        (c.title + ' ' + (c.keywords ?? '')).toLowerCase().includes(slashQuery.toLowerCase()))
    : allCommands;

  const executeCommand = useCallback((cmd: SlashCommandItem) => {
    if (!editor) return;
    // 删除已输入的斜杠字符和查询文本
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(0, from, ' ') || '';
    const slashIdx = textBefore.lastIndexOf('/');
    if (slashIdx >= 0) {
      editor.chain().focus().deleteRange({ from: slashIdx, to: from }).run();
    }
    cmd.action(editor);
    setSlashOpen(false);
  }, [editor]);

  // 监听斜杠输入和键盘导航
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 输入 / 打开命令菜单
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const { state } = editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(0, from, ' ') || '';
        const lineStart = textBefore.lastIndexOf('\n');
        const lineText = textBefore.slice(lineStart + 1);
        if (lineText.trim() === '') {
          setSlashOpen(true);
          setSlashQuery('');
          setSlashIndex(0);
        }
      }

      // 命令菜单打开时的键盘导航
      if (slashOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const cmd = filteredCommands[slashIndex];
          if (cmd) executeCommand(cmd);
        } else if (e.key === 'Escape') {
          setSlashOpen(false);
        }
      }
    };

    const handleUpdate = () => {
      if (slashOpen) {
        const { state } = editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, ' ') || '';
        const slashIdx = textBefore.lastIndexOf('/');
        if (slashIdx >= 0) {
          setSlashQuery(textBefore.slice(slashIdx + 1).replace(/[^\w一-龥-]/g, ''));
        }
      }
    };

    editor.view.dom.addEventListener('keydown', handleKeyDown);
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      editor.view.dom.removeEventListener('keydown', handleKeyDown);
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor, slashOpen, filteredCommands, slashIndex, executeCommand]);

  // 点击编辑器外部关闭菜单
  useEffect(() => {
    if (!editor) return;
    const handler = (e: MouseEvent) => {
      if (slashItemsRef.current && !slashItemsRef.current.contains(e.target as Node)) {
        setSlashOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editor]);

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);

  return (
    <div className="relative">
      {/* 浮动工具栏（选中文字时） */}
      {editor && (
      <BubbleMenu editor={editor}>
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg px-1 py-1">
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={isActive('bold')} title="加粗"><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={isActive('italic')} title="斜体"><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={isActive('strike')} title="删除线"><Strikethrough className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={isActive('code')} title="代码"><Code className="w-3.5 h-3.5" /></ToolbarBtn>
          <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
          <ToolbarBtn
            onClick={() => {
              const url = window.prompt('输入链接 URL');
              if (url) editor.chain().focus().setLink({ href: url }).run();
              else editor.chain().focus().unsetLink().run();
            }}
            active={isActive('link')}
            title="链接"
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </div>
      </BubbleMenu>
      )}

      {/* 固定工具栏 */}
      <div className="flex items-center flex-wrap gap-0.5 px-1 py-1.5 border-b border-[var(--color-border)] mb-2">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={isActive('heading', { level: 1 })} title="标题 1"><Heading1 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={isActive('heading', { level: 2 })} title="标题 2"><Heading2 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={isActive('heading', { level: 3 })} title="标题 3"><Heading3 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setParagraph().run()} active={isActive('paragraph')} title="正文"><Pilcrow className="w-4 h-4" /></ToolbarBtn>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={isActive('bold')} title="加粗"><Bold className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={isActive('italic')} title="斜体"><Italic className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={isActive('strike')} title="删除线"><Strikethrough className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={isActive('code')} title="行内代码"><Code className="w-4 h-4" /></ToolbarBtn>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={isActive('bulletList')} title="无序列表"><List className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={isActive('orderedList')} title="有序列表"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={isActive('blockquote')} title="引用"><Quote className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={isActive('codeBlock')} title="代码块"><CodeXml className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分隔线"><Minus className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            const url = window.prompt('输入图片 URL');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
          title="图片"
        >
          <ImageIcon className="w-4 h-4" />
        </ToolbarBtn>
      </div>

      {/* 编辑器内容 */}
      <EditorContent editor={editor} />

      {/* 斜杠命令菜单 */}
      {slashOpen && (
        <div
          ref={slashItemsRef}
          className="absolute left-0 top-auto mt-2 w-64 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl z-50"
        >
          <div className="px-3 py-1.5 text-[10px] text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]">
            输入以过滤，或选择命令
          </div>
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-400">无匹配命令</div>
          ) : (
            filteredCommands.map((cmd, i) => (
              <button
                key={cmd.title}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  i === slashIndex ? 'bg-[var(--color-primary-light)]' : ''
                }`}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => executeCommand(cmd)}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-surface-2)] text-xs font-semibold text-[var(--color-text-secondary)]">
                  {cmd.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{cmd.title}</p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)]">{cmd.description}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      {children}
    </button>
  );
}