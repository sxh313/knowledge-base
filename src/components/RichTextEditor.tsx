import { useEffect, useRef, useState, useCallback, useReducer, memo, type CSSProperties } from 'react';
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
  Quote, Heading1, Heading2, Heading3, Heading4, Heading5, Pilcrow, CodeXml, Minus, Image as ImageIcon,
  Undo2, Redo2, ListChecks, ZoomIn, ZoomOut, Copy,
  Lightbulb, Languages, Sparkles, BookOpen, Search, PaintRoller,
} from 'lucide-react';
import { markdownToHtml, htmlToMarkdown } from '../lib/markdownUtils';
import { putAttachment, getAttachment } from '../lib/db/queries';
import { useJournalStore } from '../stores/journalStore';
import { getSlashCommands, type SlashCommandItem } from './tiptap/slashCommand';
import { Callout } from './tiptap/callout';
import { Wikilink } from './tiptap/wikilink';
import { CollapsibleHeading } from './tiptap/collapsibleHeading';
import SearchReplaceBar from './SearchReplaceBar';

// 代码语法高亮：注册常用语言集合
const lowlight = createLowlight(common);

// 附件图片解析缓存：attachmentId → 可渲染 dataUrl（跨实例复用，避免重复查库）
const attachmentSrcCache = new Map<string, string>();

/** 把 DOM 中 attachment://<id> 的 <img> 解析为可渲染 dataUrl（仅替换渲染属性，不改 ProseMirror 模型，故 getHTML 仍是 attachment://id） */
async function resolveAttachmentImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[src^="attachment://"]'));
  if (imgs.length === 0) return;
  for (const img of imgs) {
    const raw = img.getAttribute('src');
    if (!raw) continue;
    const id = raw.slice('attachment://'.length);
    if (!id) continue;
    let url = attachmentSrcCache.get(id);
    if (!url) {
      try {
        const att = await getAttachment(id);
        url = att?.dataUrl ?? '';
        if (url) attachmentSrcCache.set(id, url);
      } catch {
        url = '';
      }
    }
    if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
  }
}

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
  /** 当前文档 id（有值时粘贴/拖入图片会落库为附件并用 attachment://id 引用；未保存的新文档退化为 base64） */
  journalId?: string;
}

function RichTextEditor({ value, onChange, placeholder, autoFocus, onAIAction, insertSignal, onWikilinkClick, journalId }: RichTextEditorProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  // 撤销/重做可用性需要随编辑器事务更新而重渲染
  const [, force] = useReducer((x: number) => x + 1, 0);
  // 编辑器字号缩放：持久化到 localStorage，退出再进入保持用户设置
  const [fontScale, setFontScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem('kb-editor-font-scale'));
    return Number.isFinite(saved) && saved >= 0.7 && saved <= 1.6 ? saved : 1;
  });
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
  // 合并 onUpdate 的 rAF 句柄：连续输入时只做一次 turndown 转换
  const rafRef = useRef<number>(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      CollapsibleHeading.configure({ levels: [1, 2, 3, 4, 5] }),
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
        class: 'prose-custom max-w-none focus:outline-none min-h-[58vh] px-1 py-3',
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
      // 用 rAF 合并同一帧内的多次事务，避免连续快速输入时每次都做完整的 turndown 转换
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (editor.isDestroyed) return;
        const md = htmlToMarkdown(editor.getHTML());
        // 标记本次变化由编辑器自身产生：下方 effect 据此跳过 setContent，保留撤销/重做历史栈
        lastEmittedRef.current = md;
        onChange(md);
      });
    },
  });

  // 字号缩放持久化：每次变化写入 localStorage，退出再进入保持
  useEffect(() => {
    localStorage.setItem('kb-editor-font-scale', String(fontScale));
  }, [fontScale]);

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

  // 附件图片：把图片以附件形式存储，正文用 attachment://<id> 引用（渲染时解析回 dataUrl）
  const insertImageFromDataUrl = useCallback(async (dataUrl: string, name: string, mimeType: string) => {
    const ed = editor;
    if (!ed) return;
    let src = dataUrl;
    // 仅在已保存文档（有 id）时落库为附件；新建未保存文档退化为 base64（避免产生孤立附件）
    if (journalId) {
      try {
        const att = await putAttachment({
          journalId,
          name: name || 'image',
          mimeType: mimeType || 'image/png',
          size: Math.round(dataUrl.length * 0.75),
          dataUrl,
        });
        attachmentSrcCache.set(att.id, dataUrl);
        src = `attachment://${att.id}`;
      } catch {
        /* 落库失败则退化用 base64 内联 */
      }
    }
    ed.chain().focus().setImage({ src, alt: name }).run();
  }, [editor, journalId]);

  // 用 ref 暴露最新插入函数给粘贴/拖拽监听（监听只绑定一次，避免依赖变化重建）
  const insertImageRef = useRef(insertImageFromDataUrl);
  useEffect(() => { insertImageRef.current = insertImageFromDataUrl; }, [insertImageFromDataUrl]);

  // 解析正文里 attachment://<id> 图片为可渲染 dataUrl（content 保持引用，仅渲染层替换 src）
  useEffect(() => {
    if (!editor) return;
    const run = () => { if (editor && !editor.isDestroyed && editor.view) resolveAttachmentImages(editor.view.dom); };
    run();
    const raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [editor, value]);

  // 折叠标题：把「已折叠标题之后、下一个同级或更高级标题之前」的内容标记为 data-hidden
  // （纯展示行为，不写入 Markdown；编辑器内容变化时同步一次）
  useEffect(() => {
    if (!editor) return;
    const syncCollapse = () => {
      // 编辑器 view 可能尚未挂载（React StrictMode 双重调用 / 首次渲染），需防御
      if (!editor.view || editor.isDestroyed) return;
      const root = editor.view.dom;
      if (!root) return;
      const headings = Array.from(root.querySelectorAll<HTMLElement>('h1[data-collapsed="true"], h2[data-collapsed="true"], h3[data-collapsed="true"], h4[data-collapsed="true"], h5[data-collapsed="true"]'));
      // 先清除所有 data-hidden，再按当前折叠状态重新标记
      root.querySelectorAll<HTMLElement>('[data-hidden]').forEach((el) => el.removeAttribute('data-hidden'));
      for (const h of headings) {
        const level = parseInt(h.tagName.slice(1), 10);
        let el = h.nextElementSibling;
        while (el) {
          const tag = el.tagName;
          if (/^H[1-5]$/.test(tag)) {
            const elLevel = parseInt(tag.slice(1), 10);
            // 遇到同级或更高级标题则停止
            if (elLevel <= level) break;
          }
          el.setAttribute('data-hidden', 'true');
          el = el.nextElementSibling;
        }
      }
    };
    syncCollapse();
    // editor.view 可能尚未挂载（React StrictMode 双重调用 / 首次渲染），需防御
    if (!editor.view || editor.isDestroyed) return;
    const observer = new MutationObserver(syncCollapse);
    observer.observe(editor.view.dom, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-collapsed'] });
    return () => observer.disconnect();
  }, [editor, value]);

  // 折叠状态下输入内容自动展开：
  // 当光标落在被折叠隐藏（data-hidden）的内容里并发生内容变化（输入/回车/粘贴）时，
  // 自动展开包含该内容的折叠标题，避免新内容被隐藏看不到。
  useEffect(() => {
    if (!editor) return;
    const onTransaction = ({ transaction }: { transaction: any }) => {
      if (!transaction.docChanged) return;
      const view = editor.view;
      if (!view || editor.isDestroyed) return;
      const root = view.dom;
      // 光标所在 DOM 元素（可能是文本节点，取其父元素）
      const domAtPos = view.domAtPos(editor.state.selection.from);
      let el: HTMLElement | null = domAtPos.node instanceof Text ? domAtPos.node.parentElement : (domAtPos.node as HTMLElement);
      // 向上查找是否位于 data-hidden 折叠区域内
      let hiddenEl: HTMLElement | null = null;
      while (el && el !== root) {
        if (el.getAttribute && el.getAttribute('data-hidden') === 'true') { hiddenEl = el; break; }
        el = el.parentElement;
      }
      if (!hiddenEl) return;
      // 找到 hiddenEl 之前（文档顺序）的所有折叠标题，全部展开
      // （处理嵌套折叠：若 H1 折叠且其内 H2 也折叠，需同时展开，否则内容仍被外层隐藏）
      const headings = Array.from(root.querySelectorAll<HTMLElement>('h1[data-collapsed="true"], h2[data-collapsed="true"], h3[data-collapsed="true"], h4[data-collapsed="true"], h5[data-collapsed="true"]'));
      const targets: HTMLElement[] = [];
      for (const h of headings) {
        // h 在 hiddenEl 之前（DOCUMENT_POSITION_PRECEDING = 2）
        if (h.compareDocumentPosition(hiddenEl) & Node.DOCUMENT_POSITION_PRECEDING) {
          targets.push(h);
        }
      }
      if (targets.length === 0) return;
      // 展开所有相关折叠标题（从内到外），用单个事务累积，避免多次 dispatch 触发递归
      let tr = view.state.tr;
      let changed = false;
      for (const target of targets) {
        const pos = view.posAtDOM(target, 0);
        if (pos == null) continue;
        const $pos = editor.state.doc.resolve(pos);
        let headingDepth = -1;
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'heading') { headingDepth = d; break; }
        }
        if (headingDepth < 0) continue;
        const headingNode = $pos.node(headingDepth);
        tr = tr.setNodeMarkup($pos.before(headingDepth), undefined, {
          ...headingNode.attrs,
          collapsed: false,
        });
        changed = true;
      }
      if (changed) view.dispatch(tr);
    };
    editor.on('transaction', onTransaction);
    return () => { editor.off('transaction', onTransaction); };
  }, [editor]);

  // 给编辑器标题设置 id（与 DocOutline.parseHeadings 的 id 生成逻辑一致），
  // 让侧栏大纲点击能精确定位到标题（否则 getElementById 永远找不到，只能靠文本匹配）。
  // id 是纯 DOM 展示属性，不写入 Markdown。
  useEffect(() => {
    if (!editor) return;
    const syncHeadingIds = () => {
      if (!editor.view || editor.isDestroyed) return;
      const root = editor.view.dom;
      if (!root) return;
      const headings = Array.from(root.querySelectorAll<HTMLElement>('h1.collapsible-heading, h2.collapsible-heading, h3.collapsible-heading, h4.collapsible-heading, h5.collapsible-heading'));
      for (const h of headings) {
        // textContent 不含 ::before 编号，只含标题文字
        const text = (h.textContent || '').trim();
        const id = text.toLowerCase()
          .replace(/[^一-龥a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        if (id) h.id = id;
      }
    };
    syncHeadingIds();
    if (!editor.view || editor.isDestroyed) return;
    const observer = new MutationObserver(syncHeadingIds);
    observer.observe(editor.view.dom, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [editor]);

  // 折叠标题：点击标题左侧箭头区域切换折叠状态
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 找到被点击的标题元素
      const headingEl = target.closest<HTMLElement>('h1.collapsible-heading, h2.collapsible-heading, h3.collapsible-heading, h4.collapsible-heading, h5.collapsible-heading');
      if (!headingEl) return;
      // 仅当点击落在左侧箭头区域（约 1rem 宽）时切换折叠；
      // 文字/编号从 padding-left(1.25rem) 之后开始，点击文字开头可正常放置光标
      const rect = headingEl.getBoundingClientRect();
      const arrowWidth = 16; // px，与 CSS 中箭头宽度(1rem)一致
      if (e.clientX - rect.left > arrowWidth) return;
      e.preventDefault();
      e.stopPropagation();
      // 从 DOM 定位标题节点，再换算成 ProseMirror 位置
      const view = editor.view;
      const pos = view.posAtDOM(headingEl, 0);
      if (pos == null) return;
      const $pos = view.state.doc.resolve(pos);
      let headingDepth = -1;
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'heading') { headingDepth = d; break; }
      }
      if (headingDepth < 0) return;
      const headingNode = $pos.node(headingDepth);
      const collapsed = !(headingNode.attrs as { collapsed?: boolean }).collapsed;
      view.dispatch(view.state.tr.setNodeMarkup($pos.before(headingDepth), undefined, {
        ...headingNode.attrs,
        collapsed,
      }));
    };
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor]);

  // 飞书式：粘贴（Ctrl+V 截图）/ 拖拽图片自动插入（DOM 级监听，HMR 友好）
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const insertImageFile = (file: File) =>
      fileToImageDataURL(file).then(({ src, alt }) => {
        if (!src) return;
        insertImageRef.current(src, alt, file.type);
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
  // 用 document 捕获阶段监听：在 ProseMirror 处理 Enter 之前拦截并 preventDefault+stopPropagation，
  // 否则回车会先触发 splitBlock 插入换行，导致“选中文档后回车不插入、反而插了个空行”的 bug。
  useEffect(() => {
    if (!wlOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setWlIndex(i => Math.min(i + 1, filteredDocs.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setWlIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const d = filteredDocs[wlIndex]; if (d) insertWl(d); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setWlOpen(false); }
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
  // 说明：必须用 document 捕获阶段（capture=true）监听，才能在 ProseMirror 处理 Enter/Arrow 之前
  // 拦截并 preventDefault。若挂在 editor.view.dom 上（冒泡阶段），ProseMirror 的 splitBlock 会先
  // 执行插入换行，导致“回车后命令不执行、反而插了个空行”的 bug。与双向链接浮层同一套可靠方案。
  useEffect(() => {
    if (!editor) return;

    const editorEl = editor.view.dom;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 仅响应编辑器（含已渲染的斜杠菜单）内的按键，避免影响标题输入框等
      const inEditor = editorEl.contains(e.target as Node);

      // 输入 / 打开命令菜单（需在 / 被解析插入前判断，故用捕获阶段）
      if (inEditor && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
          e.stopPropagation();
          setSlashIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setSlashIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const cmd = filteredCommands[slashIndex];
          if (cmd) executeCommand(cmd);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
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

    document.addEventListener('keydown', handleKeyDown, true);
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
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

  // 组件卸载时清理未执行的 rAF
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);

  const headingButtons = [
    { level: 1 as const, icon: Heading1, title: '标题 1' },
    { level: 2 as const, icon: Heading2, title: '标题 2' },
    { level: 3 as const, icon: Heading3, title: '标题 3' },
    { level: 4 as const, icon: Heading4, title: '标题 4' },
    { level: 5 as const, icon: Heading5, title: '标题 5' },
  ];

  return (
    <div className="relative" style={{ ['--editor-fs']: `${1 * fontScale}rem` } as CSSProperties}>
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
      <div className="sticky top-0 z-20 -mx-2 mb-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2 py-1.5 shadow-sm backdrop-blur animate-slide-down flex-nowrap">
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)"><Undo2 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="前进 (Ctrl+Y)"><Redo2 className="w-4 h-4" /></ToolbarBtn>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        {headingButtons.map(({ level, icon: Icon, title }) => (
          <ToolbarBtn
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            active={isActive('heading', { level })}
            title={title}
          >
            <Icon className="w-4 h-4" />
          </ToolbarBtn>
        ))}
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
              insertImageFromDataUrl(src, f.name, f.type);
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
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-95 ${
        disabled
          ? 'opacity-30 cursor-not-allowed text-[var(--color-text-tertiary)]'
          : active
            ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
      }`}
    >
      {children}
    </button>
  );
}

// memo：onChange/onAIAction/onWikilinkClick 已由父组件 useCallback 稳定化，
// 避免 title/侧栏等无关状态变化时编辑器整体重渲染
export default memo(RichTextEditor);
