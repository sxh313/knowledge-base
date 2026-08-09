import { useEffect, useRef, useState, useCallback, useReducer, type CSSProperties } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  Bold, Italic, Strikethrough,
  Code, Link as LinkIcon, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, Pilcrow, CodeXml, Minus, Image as ImageIcon,
  Undo2, Redo2, ListChecks, ZoomIn, ZoomOut, Copy,
  Lightbulb, Languages, Sparkles, BookOpen, Search, PaintRoller,
} from 'lucide-react';
import { markdownToHtml, htmlToMarkdown } from '../lib/markdownUtils';
import { useJournalStore } from '../stores/journalStore';
import { getSlashCommands, type SlashCommandItem } from './tiptap/slashCommand';
import { Callout } from './tiptap/callout';
import { Wikilink } from './tiptap/wikilink';
import SearchReplaceBar from './SearchReplaceBar';

// 代码语法高亮：注册常用语言集合
const lowlight = createLowlight(common);

interface RichTextEditorProps {
  value: string;          // Markdown
  onChange: (value: string) => void;  // 返回 Markdown
  placeholder?: string;
  autoFocus?: boolean;
  /** 选中→AI 操作（飞书式）：翻译/解释/润色 */
  onAIAction?: (action: 'translate' | 'explain' | 'polish', selectedText: string) => void;
  /** AI 结果注入信号：n 变化时把 text 插入/替换到当前选区 */
  insertSignal?: { text: string; n: number } | null;
  /** 点击双向链接 [[目标]] 时触发（父组件负责跳转到目标文档） */
  onWikilinkClick?: (target: string) => void;
}

export default function RichTextEditor({ value, onChange, placeholder, autoFocus, onAIAction, insertSignal, onWikilinkClick }: RichTextEditorProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  // 撤销/重做可用性需要随编辑器事务更新而重渲染
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [fontScale, setFontScale] = useState(1);
  const [showSearch, setShowSearch] = useState(false);
  // 格式刷：第一次点复制选区格式，第二次点应用到新选区
  const [storedMarks, setStoredMarks] = useState<{ type: string }[] | null>(null);
  // 双向链接 [[ 浮层
  const [wlOpen, setWlOpen] = useState(false);
  const [wlQuery, setWlQuery] = useState('');
  const [wlIndex, setWlIndex] = useState(0);
  const wlRef = useRef<HTMLDivElement>(null);
  const wlStartRef = useRef<number>(-1);
  const { entries: allDocs } = useJournalStore();
  // 双向链接浮层：过滤文档（提前定义，供下方 effect 使用）
  const filteredDocs = wlQuery
    ? allDocs.filter((d: any) => !d.deletedAt && (d.title || '无标题').toLowerCase().includes(wlQuery.toLowerCase())).slice(0, 8)
    : allDocs.filter((d: any) => !d.deletedAt).slice(0, 8);
  // 选中某文档：删除已输入的 [[query，插入 wikilink 节点（editor 在下方声明，函数体延迟引用）
  const insertWl = (doc: any) => {
    if (!editor) return;
    const end = editor.state.selection.$from.pos;
    const start = wlStartRef.current;
    if (start < 0) return;
    editor.chain().focus().deleteRange({ from: Math.max(0, start - 2), to: end }).insertContent({ type: 'wikilink', attrs: { target: doc.title || '无标题' } }).run();
    setWlOpen(false);
  };
  const slashItemsRef = useRef<HTMLDivElement>(null);
  // 记录最后由编辑器 emit 出去的 markdown，用于区分「外部加载」与「自身输入」，
  // 避免输入时回流触发 setContent 把 TipTap 增量历史栈清空（撤销一次清空的 bug 根因）
  const lastEmittedRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || '输入 / 插入内容，或直接输入文字...',
      }),
      Image.configure({ allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Callout,
      Wikilink,
    ],
    content: markdownToHtml(value),
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'prose-custom max-w-none focus:outline-none min-h-[400px] p-3 border border-[var(--color-border)] rounded-lg',
      },
      handleDOMEvents: {
        dragstart: (view: any, event: DragEvent) => {
          // 禁用编辑器内所有内容的拖拽（选中后拖动会复制/丢失，尤其 callout 不稳定）。
          // 移动内容请用剪切(Ctrl+X)+粘贴。外部图片拖入由 onDrop 单独处理，不受影响。
          event.preventDefault();
          return true;
        },
      },
    },
    onUpdate: ({ editor }) => {
      const md = htmlToMarkdown(editor.getHTML());
      // 标记本次变化由编辑器自身产生：下方 effect 据此跳过 setContent，保留撤销/重做历史栈
      lastEmittedRef.current = md;
      onChange(md);
    },
  });

  // 外部内容变化时同步到编辑器（如加载已有文档）
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

  // 飞书式：粘贴（Ctrl+V 截图）/ 拖拽图片自动插入（DOM 级监听，HMR 友好）
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const insertImageFile = (file: File) =>
      fileToImageDataURL(file).then(({ src, alt }) => {
        if (!src) return;
        editor.chain().focus().setImage({ src, alt }).run();
        console.debug('[paste] 图片已插入');
      });
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      console.debug('[paste] 触发，剪贴板类型：', items ? Array.from(items).map(i => i.type) : '空');
      if (!items) return;
      let hasImage = false;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { hasImage = true; insertImageFile(file); }
        }
      }
      if (hasImage) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      let hasImage = false;
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) { hasImage = true; insertImageFile(file); }
      }
      if (hasImage) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      // 兜底：禁用编辑器内所有拖拽（主逻辑在 editorProps.handleDOMEvents.dragstart）
      e.preventDefault();
    };
    dom.addEventListener('paste', onPaste);
    dom.addEventListener('drop', onDrop);
    dom.addEventListener('dragstart', onDragStart);
    return () => {
      dom.removeEventListener('paste', onPaste);
      dom.removeEventListener('drop', onDrop);
      dom.removeEventListener('dragstart', onDragStart);
    };
  }, [editor]);

  // 编辑器事务变化时刷新撤销/重做的可用状态
  useEffect(() => {
    if (!editor) return;
    const handler = () => force();
    editor.on('update', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('update', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  // Ctrl+H / Ctrl+F 打开搜索替换
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === 'h' || k === 'f')) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 点击双向链接 chip 跳转
  useEffect(() => {
    if (!editor || !onWikilinkClick) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const wl = (e.target as HTMLElement).closest('.wikilink') as HTMLElement | null;
      if (wl) {
        e.preventDefault();
        onWikilinkClick(wl.getAttribute('data-wikilink') || wl.textContent || '');
      }
    };
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor, onWikilinkClick]);

  // 输入 [[ 检测：弹出文档搜索浮层
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      const { $from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, $from.pos - 30), $from.pos, '\n');
      const idx = textBefore.lastIndexOf('[[');
      if (idx >= 0) {
        const after = textBefore.slice(idx + 2);
        if (!after.includes(']]') && !after.includes('[[') && after.length <= 30) {
          wlStartRef.current = $from.pos - after.length;
          setWlQuery(after);
          setWlIndex(0);
          if (!wlOpen) setWlOpen(true);
          return;
        }
      }
      if (wlOpen) setWlOpen(false);
    };
    editor.on('update', check);
    editor.on('selectionUpdate', check);
    return () => {
      editor.off('update', check);
      editor.off('selectionUpdate', check);
    };
  }, [editor, wlOpen]);

  // 浮层打开时的键盘导航
  useEffect(() => {
    if (!wlOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setWlIndex(i => Math.min(i + 1, filteredDocs.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setWlIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const d = filteredDocs[wlIndex]; if (d) insertWl(d); }
      else if (e.key === 'Escape') { e.preventDefault(); setWlOpen(false); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [wlOpen, wlIndex, filteredDocs]);

  // AI 结果注入：n 变化时把 text 插入/替换当前选区
  const lastInsertN = useRef(0);
  useEffect(() => {
    if (!editor || !insertSignal) return;
    if (insertSignal.n === lastInsertN.current) return;
    lastInsertN.current = insertSignal.n;
    const { from, to } = editor.state.selection;
    editor.chain().focus().insertContentAt({ from, to }, insertSignal.text).run();
  }, [editor, insertSignal]);

  // 选中→AI 操作：取当前选中文本，回调给父组件
  const triggerSelectionAI = (action: 'translate' | 'explain' | 'polish') => {
    if (!editor || !onAIAction) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (text.trim()) onAIAction(action, text);
  };

  // 格式刷：第一次点（有选区）复制该处文字格式；第二次点（有选区）套用到目标
  const handleBrush = () => {
    if (!editor) return;
    if (storedMarks) {
      // 应用：先清目标现有常见格式，再套用存储的格式
      let chain = editor.chain().focus();
      (['bold', 'italic', 'strike', 'code', 'underline'] as const).forEach(m => { chain = chain.unsetMark(m); });
      storedMarks.forEach(m => { chain = chain.setMark(m.type); });
      chain.run();
      setStoredMarks(null);
    } else {
      // 复制：取选区起点的 marks
      const { from, to } = editor.state.selection;
      if (from === to) {
        window.alert('请先选中带格式的文字，再点格式刷复制格式');
        return;
      }
      const marks = editor.state.selection.$from.marks().map(m => ({ type: m.type.name }));
      setStoredMarks(marks.length > 0 ? marks : null);
      if (marks.length === 0) window.alert('选中的文字没有可复制的格式');
    }
  };

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
    <div className="relative" style={{ ['--editor-fs']: `${0.95 * fontScale}rem` } as CSSProperties}>
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
          {onAIAction && (
            <>
              <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
              <ToolbarBtn onClick={() => triggerSelectionAI('translate')} title="AI 翻译"><Languages className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => triggerSelectionAI('explain')} title="AI 解释"><BookOpen className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => triggerSelectionAI('polish')} title="AI 润色"><Sparkles className="w-3.5 h-3.5" /></ToolbarBtn>
            </>
          )}
        </div>
      </BubbleMenu>
      )}

      {/* 固定工具栏 */}
      <div className="flex items-center flex-wrap gap-0.5 px-1 py-1.5 border-b border-[var(--color-border)] mb-2 animate-slide-down">
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)"><Undo2 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="前进 (Ctrl+Y)"><Redo2 className="w-4 h-4" /></ToolbarBtn>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
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
        <ToolbarBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={isActive('taskList')} title="待办清单"><ListChecks className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={isActive('blockquote')} title="引用"><Quote className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCallout('note').run()} active={isActive('callout')} title="提示框（Callout，再次点击取消）"><Lightbulb className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => {
          const docs = useJournalStore.getState().entries.filter(e => !e.deletedAt);
          if (docs.length === 0) { window.alert('还没有文档，先创建一篇吧'); return; }
          const list = docs.slice(0, 25).map(d => d.title || '无标题').join('、');
          const target = window.prompt(`输入要链接的文档标题（双向链接）。\n\n可用文档：\n${list}`, '');
          if (target && target.trim()) editor.chain().focus().insertWikilink(target.trim()).run();
        }} title="插入双向链接 [[]]"><LinkIcon className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={isActive('codeBlock')} title="代码块"><CodeXml className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分隔线"><Minus className="w-4 h-4" /></ToolbarBtn>
        <label className="p-1.5 rounded-md transition-colors text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer" title="插入图片（选文件）">
          <ImageIcon className="w-4 h-4" />
          <input type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            console.debug('[img] 选了文件:', f?.name, f?.type, f?.size, '字节');
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              console.debug('[img] dataURL 已生成，长度:', src.length);
              editor.chain().focus().setImage({ src, alt: f.name }).run();
              console.debug('[img] setImage 已调用，当前编辑器 HTML 长度:', editor.getHTML().length);
            };
            reader.onerror = (err) => console.error('[img] FileReader 错误:', err);
            reader.readAsDataURL(f);
            e.target.value = '';
          }} />
        </label>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        <ToolbarBtn onClick={() => setFontScale(s => Math.max(0.7, +(s - 0.1).toFixed(1)))} title="缩小字体"><ZoomOut className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => setFontScale(s => Math.min(1.6, +(s + 0.1).toFixed(1)))} title="放大字体"><ZoomIn className="w-4 h-4" /></ToolbarBtn>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        <ToolbarBtn onClick={() => {
          const md = htmlToMarkdown(editor.getHTML());
          navigator.clipboard?.writeText(md);
        }} title="复制为 Markdown"><Copy className="w-4 h-4" /></ToolbarBtn>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        <ToolbarBtn
          onClick={handleBrush}
          active={!!storedMarks}
          title={storedMarks ? '格式刷：选中目标文字后点此套用格式' : '格式刷：选中带格式的文字点此复制'}
        >
          <PaintRoller className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => setShowSearch(true)} title="查找替换 (Ctrl+H)"><Search className="w-4 h-4" /></ToolbarBtn>
      </div>

      {showSearch && editor && <SearchReplaceBar editor={editor} onClose={() => setShowSearch(false)} />}

      {/* 编辑器内容 */}
      <EditorContent editor={editor} />

      {/* 双向链接浮层 */}
      {wlOpen && (
        <div
          ref={wlRef}
          className="absolute left-0 top-auto mt-2 w-64 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl z-50"
        >
          <div className="px-3 py-1.5 text-[10px] text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]">
            链接到文档（↑↓ 选择，↵ 插入，Esc 取消）
          </div>
          {filteredDocs.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-400">无匹配文档</div>
          ) : (
            filteredDocs.map((d: any, i) => (
              <button
                key={d.id}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === wlIndex ? 'bg-[var(--color-primary-light)]' : ''}`}
                onMouseEnter={() => setWlIndex(i)}
                onClick={() => insertWl(d)}
              >
                <span className="text-xs">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">{d.title || '无标题'}</p>
                  {d.subject && <p className="text-[10px] text-[var(--color-text-tertiary)] truncate">{d.subject}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      )}

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

// 图片压缩为 dataURL：限制最大宽度，避免截图撑爆本地存储 / 云同步
function fileToImageDataURL(file: File, maxW = 1280): Promise<{ src: string; alt: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement('img');
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve({ src: reader.result as string, alt: file.name }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const isPng = file.type === 'image/png';
        resolve({ src: canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85), alt: file.name });
      };
      img.onerror = () => resolve({ src: reader.result as string, alt: file.name });
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve({ src: '', alt: file.name });
    reader.readAsDataURL(file);
  });
}

function ToolbarBtn({ children, onClick, active, disabled, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      disabled={disabled}
      className={`p-1.5 rounded-md transition-all duration-150 active:scale-90 ${
        disabled
          ? 'opacity-30 cursor-not-allowed text-[var(--color-text-tertiary)]'
          : active
            ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      {children}
    </button>
  );
}