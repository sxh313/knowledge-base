import { useEffect, useRef, useState, useCallback, useReducer, memo, type CSSProperties } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { createLowlight, common } from 'lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  Bold, Italic, Strikethrough,
  Code, Link as LinkIcon, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, Heading4, Heading5, Pilcrow, CodeXml, Minus, Image as ImageIcon,
  Undo2, Redo2, ListChecks, ZoomIn, ZoomOut, Copy, Table2, ImageDown, X,
  Lightbulb, Languages, Sparkles, BookOpen, Search, PaintRoller, MoreHorizontal,
} from 'lucide-react';
import { markdownToHtml, htmlToMarkdown } from '../lib/markdownUtils';
import { putAttachment, getAttachment } from '../lib/db/queries';
import { useJournalStore } from '../stores/journalStore';
import { getSlashCommands, type SlashCommandItem } from './tiptap/slashCommand';
import { Callout } from './tiptap/callout';
import { Wikilink } from './tiptap/wikilink';
import { CollapsibleHeading } from './tiptap/collapsibleHeading';
import SearchReplaceBar from './SearchReplaceBar';
import { EnhancedCodeBlock } from './tiptap/enhancedCodeBlock';

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
  /** 可选的 TipTap JSON 快照，用于恢复合并单元格和列宽等高级结构。 */
  editorState?: Record<string, unknown>;
  onEditorStateChange?: (state: Record<string, unknown>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** 选中→AI 操作：翻译/解释/润色 */
  onAIAction?: (action: 'translate' | 'explain' | 'polish', selectedText: string) => void;
  /** 点击双向链接 [[目标]] 时触发（父组件负责跳转到目标文档） */
  onWikilinkClick?: (target: string) => void;
  /** 当前文档 id（有值时粘贴/拖入图片会落库为附件并用 attachment://id 引用；未保存的新文档退化为 base64） */
  journalId?: string;
}

// Tiptap 可能先返回 Editor 实例、稍后才挂载 ProseMirror view。访问 view.dom 前必须确认已初始化，
// 否则重载/HMR 期间会触发“editor view is not available”并让编辑器短暂空白。
function getEditorDom(editor: any): HTMLElement | null {
  if (!editor || editor.isDestroyed || !editor.isInitialized) return null;
  try {
    return editor.view?.dom ?? null;
  } catch {
    return null;
  }
}

function whenEditorDomReady(editor: any, callback: (dom: HTMLElement) => void): () => void {
  let cancelled = false;
  let frame = 0;
  const check = () => {
    if (cancelled || editor.isDestroyed) return;
    const dom = getEditorDom(editor);
    if (dom) {
      callback(dom);
      return;
    }
    frame = requestAnimationFrame(check);
  };
  check();
  return () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
  };
}

function RichTextEditor({ value, onChange, editorState, onEditorStateChange, placeholder, autoFocus, onAIAction, onWikilinkClick, journalId }: RichTextEditorProps) {
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
  const [showSvgDialog, setShowSvgDialog] = useState(false);
  const [svgSource, setSvgSource] = useState('');
  const [svgError, setSvgError] = useState('');
  const [svgRendering, setSvgRendering] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
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
      EnhancedCodeBlock.configure({ lowlight }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Callout,
      Wikilink,
    ],
    content: editorState ?? markdownToHtml(value),
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'prose-custom max-w-none focus:outline-none min-h-[58vh] px-1 py-3',
        spellcheck: 'false',
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Tab') return false;
        const { state } = view;
        const { $from, from, to } = state.selection;
        // 表格用 Tab 切换单元格，保持原生行为。
        // 列表项：无选区时走原生 Tab 调整层级；有选区时也支持"所有选中行缩进"。
        for (let depth = $from.depth; depth >= 0; depth--) {
          const type = $from.node(depth).type.name;
          if (type === 'tableCell' || type === 'tableHeader') return false;
        }
        let inList = false;
        for (let depth = $from.depth; depth >= 0; depth--) {
          const type = $from.node(depth).type.name;
          if (type === 'listItem' || type === 'taskItem') { inList = true; break; }
        }
        // 列表项无选区时走原生 Tab（调整层级）；有选区时继续走下面的"所有选中行缩进"。
        if (inList && from === to) return false;
        event.preventDefault();
        const inCodeBlock = $from.parent.type.name === 'codeBlock';
        // 正文使用两个全角空格，视觉约等于四个半角空格，Markdown 往返后也不会被合并或裁掉。
        const indentation = inCodeBlock ? '    ' : '\u3000'.repeat(2);
        // 有选区：给选区覆盖的每一行添加/减少缩进，而不是替换掉选中内容
        if (from !== to) {
          const doc = state.doc;
          const tr = state.tr;
          // 收集与选区相交的所有文本块（行）的起始位置。
          // 用 doc.descendants 遍历，避免 resolve(from).start() 在 from 恰好位于
          // 段落边界时 depth=0 而错误指向文档开头的问题。
          const lineStarts: number[] = [];
          doc.descendants((node, pos) => {
            if (node.isTextblock) {
              const nodeStart = pos + 1; // 文本块内第一个字符位置
              const nodeEnd = pos + node.nodeSize - 1; // 文本块内最后一个字符位置
              if (nodeEnd >= from && nodeStart <= to) lineStarts.push(nodeStart);
              return false; // 不深入文本块内部
            }
            return true;
          });
          if (event.shiftKey) {
            // Shift+Tab：减少每行缩进（从后往前删，避免位置偏移）
            for (let i = lineStarts.length - 1; i >= 0; i--) {
              const lineStart = lineStarts[i];
              const lineText = doc.textBetween(lineStart, lineStart + 4, '\n');
              const match = lineText.match(/^[ \u00a0\u3000]{1,4}/);
              if (match) tr.delete(lineStart, lineStart + match[0].length);
            }
          } else {
            // Tab：在每行开头插入缩进（从后往前插，避免位置偏移）
            for (let i = lineStarts.length - 1; i >= 0; i--) {
              tr.insertText(indentation, lineStarts[i]);
            }
          }
          // 缩进后保留选区（映射到缩进后的位置），便于连续 Tab / Shift+Tab 操作
          const newFrom = tr.mapping.map(from);
          const newTo = tr.mapping.map(to);
          tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo));
          view.dispatch(tr);
          return true;
        }
        if (event.shiftKey) {
          const before = state.doc.textBetween(Math.max(0, from - 4), from, '\n');
          const indentationBefore = before.match(/[ \u00a0\u3000]{1,4}$/)?.[0] || '';
          if (indentationBefore) view.dispatch(state.tr.delete(from - indentationBefore.length, from));
          return true;
        }
        // 无选区 Tab：在光标处插入缩进。
        // 当光标恰好位于段落开头（$from.depth === 0）时，直接 insertText 会在边界
        // 创建新段落，改为插入到段落内第一个字符位置（from + 1）。
        const insertPos = $from.depth === 0 ? from + 1 : from;
        view.dispatch(state.tr.insertText(indentation, insertPos, insertPos));
        return true;
      },
      handleDOMEvents: {
        dragstart: (_view: unknown, event: DragEvent) => {
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
        if (editor.isDestroyed || !editor.isInitialized) return;
        const md = htmlToMarkdown(editor.getHTML());
        onEditorStateChange?.(editor.getJSON() as Record<string, unknown>);
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
    if (!editor || editor.isDestroyed || !editor.isInitialized) return;
    if (value !== lastEmittedRef.current) {
      const newHtml = markdownToHtml(value);
      if (editor.getHTML() !== newHtml) {
        editor.commands.setContent(newHtml);
      }
      lastEmittedRef.current = value;
    }
  }, [value, editor]);

  // 文档切换时优先恢复 TipTap JSON；仅当快照与当前文档不同才写入，避免每次输入都清空撤销历史。
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.isInitialized || !editorState) return;
    try {
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(editorState)) {
        editor.commands.setContent(editorState, { emitUpdate: false });
      }
    } catch {
      // 旧版本或损坏快照无法恢复时，保留 Markdown 内容作为兼容回退。
    }
  }, [editor, editorState]);

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

  const openSvgDialog = () => {
    if (!editor) return;
    const { from, to, $from } = editor.state.selection;
    let source = from !== to ? editor.state.doc.textBetween(from, to, '\n') : '';
    if (!source) {
      for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'codeBlock') {
          source = node.textContent;
          break;
        }
      }
    }
    setSvgSource(source);
    setSvgError('');
    setShowSvgDialog(true);
  };

  const insertSvgAsImage = async () => {
    setSvgRendering(true);
    setSvgError('');
    try {
      const png = await svgToPngDataUrl(svgSource);
      await insertImageFromDataUrl(png, 'svg-render.png', 'image/png');
      setShowSvgDialog(false);
      setSvgSource('');
    } catch (error) {
      setSvgError((error as Error).message);
    } finally {
      setSvgRendering(false);
    }
  };

  // 用 ref 暴露最新插入函数给粘贴/拖拽监听（监听只绑定一次，避免依赖变化重建）
  const insertImageRef = useRef(insertImageFromDataUrl);
  useEffect(() => { insertImageRef.current = insertImageFromDataUrl; }, [insertImageFromDataUrl]);

  // 解析正文里 attachment://<id> 图片为可渲染 dataUrl（content 保持引用，仅渲染层替换 src）
  useEffect(() => {
    if (!editor) return;
    const run = () => { const dom = getEditorDom(editor); if (dom) resolveAttachmentImages(dom); };
    run();
    const raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [editor, value]);

  // 折叠状态下输入内容自动展开：
  // 当光标落在被折叠隐藏（data-hidden）的内容里并发生内容变化（输入/回车/粘贴）时，
  // 自动展开包含该内容的折叠标题，避免新内容被隐藏看不到。
  useEffect(() => {
    if (!editor) return;
    const onTransaction = ({ transaction }: { transaction: any }) => {
      if (!transaction.docChanged) return;
      if (editor.isDestroyed || !editor.isInitialized) return;
      let view: any;
      try { view = editor.view; } catch { return; }
      if (!view) return;
      const root: HTMLElement = view.dom as HTMLElement;
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

  // 粘贴截图 / 拖拽图片自动插入（DOM 级监听，HMR 友好）
  useEffect(() => {
    if (!editor) return;
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
    let dom: HTMLElement | null = null;
    const stop = whenEditorDomReady(editor, (readyDom) => {
      dom = readyDom;
      dom.addEventListener('paste', onPaste);
      dom.addEventListener('drop', onDrop);
      dom.addEventListener('dragstart', onDragStart);
    });
    return () => {
      stop();
      dom?.removeEventListener('paste', onPaste);
      dom?.removeEventListener('drop', onDrop);
      dom?.removeEventListener('dragstart', onDragStart);
    };
  }, [editor]);

  // 编辑器事务变化时刷新撤销/重做的可用状态
  useEffect(() => {
    if (!editor) return;
    const handler = () => force();
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
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
    const onClick = (e: MouseEvent) => {
      const wl = (e.target as HTMLElement).closest('.wikilink') as HTMLElement | null;
      if (wl) {
        e.preventDefault();
        onWikilinkClick(wl.getAttribute('data-wikilink') || wl.textContent || '');
      }
    };
    let dom: HTMLElement | null = null;
    const stop = whenEditorDomReady(editor, (readyDom) => {
      dom = readyDom;
      dom.addEventListener('click', onClick);
    });
    return () => {
      stop();
      dom?.removeEventListener('click', onClick);
    };
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

    let editorEl: HTMLElement | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 仅响应编辑器（含已渲染的斜杠菜单）内的按键，避免影响标题输入框等
      const inEditor = !!editorEl?.contains(e.target as Node);

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

    const stop = whenEditorDomReady(editor, (dom) => {
      editorEl = dom;
      document.addEventListener('keydown', handleKeyDown, true);
      editor.on('update', handleUpdate);
      editor.on('selectionUpdate', handleUpdate);
    });

    return () => {
      stop();
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
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);

  // 代码块切换：选中多行时，把整个选区合并成一个外层代码块（而非每行一个）
  const toggleCodeBlockSmart = () => {
    const { state } = editor;
    const { from, to, empty } = state.selection;

    // 无选区，或当前已在代码块内：走原生 toggleCodeBlock（处理创建/取消）
    if (empty || editor.isActive('codeBlock')) {
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }

    // 有选区且不在代码块内：把整个选区合并成一个代码块
    const selectedText = state.doc.textBetween(from, to, '\n');
    const tr = state.tr;
    tr.delete(from, to);
    const codeBlock = state.schema.nodes.codeBlock.create(null, state.schema.text(selectedText));
    tr.insert(from, codeBlock);
    tr.setSelection(TextSelection.create(tr.doc, from, from + codeBlock.nodeSize - 1));
    editor.view.dispatch(tr);
    editor.commands.focus();
  };

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
      <div className="sticky top-0 z-20 -mx-2 mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 shadow-sm animate-slide-down">
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
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={isActive('blockquote')} title="提示框（引用格式，再次点击取消）"><Lightbulb className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => {
          const docs = useJournalStore.getState().entries.filter(e => !e.deletedAt);
          if (docs.length === 0) { window.alert('还没有文档，先创建一篇吧'); return; }
          const list = docs.slice(0, 25).map(d => d.title || '无标题').join('、');
          const target = window.prompt(`输入要链接的文档标题（双向链接）。\n\n可用文档：\n${list}`, '');
          if (target && target.trim()) editor.chain().focus().insertWikilink(target.trim()).run();
        }} title="插入双向链接 [[]]"><LinkIcon className="w-4 h-4" /></ToolbarBtn>
        <button type="button" className={`editor-more-tools inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs ${showMoreTools ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'}`} onClick={() => setShowMoreTools((value) => !value)} aria-expanded={showMoreTools} aria-label="更多编辑工具"><MoreHorizontal className="h-4 w-4" /><span className="hidden sm:inline">更多</span></button>
        {showMoreTools && <>
        <ToolbarBtn onClick={toggleCodeBlockSmart} active={isActive('codeBlock')} title="代码块"><CodeXml className="w-4 h-4" /></ToolbarBtn>
        <div className="relative">
          <ToolbarBtn onClick={() => setTablePickerOpen((open) => !open)} title="插入表格"><Table2 className="w-4 h-4" /></ToolbarBtn>
          {tablePickerOpen && <div className="table-picker-popover absolute left-0 top-[calc(100%+0.4rem)] z-50 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-xl" onMouseDown={(event) => event.preventDefault()}>
            <p className="mb-1.5 text-[10px] text-[var(--color-text-tertiary)]">选择表格大小</p>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 64 }, (_, index) => { const row = Math.floor(index / 8) + 1; const col = (index % 8) + 1; return <button key={`${row}-${col}`} type="button" className="table-picker-cell h-4 w-4 rounded-sm border border-[var(--color-border)]" title={`${row} × ${col}`} onClick={() => { editor.chain().focus().insertTable({ rows: row, cols: col, withHeaderRow: true }).run(); setTablePickerOpen(false); }} />; })}
            </div>
          </div>}
        </div>
        {isActive('table') && <div className="editor-table-tools flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1" role="group" aria-label="表格编辑">
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => editor.chain().focus().addRowAfter().run()}>加行</button>
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => editor.chain().focus().addColumnAfter().run()}>加列</button>
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()}>删行</button>
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()}>删列</button>
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor.can().mergeCells()}>合并</button>
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor.can().splitCell()}>拆分</button>
          <button type="button" className="btn-ghost h-7 px-2 text-[11px] text-[var(--color-danger)]" onClick={() => editor.chain().focus().deleteTable().run()}>删表</button>
        </div>}
        <ToolbarBtn onClick={openSvgDialog} title="SVG 代码转 PNG 图片"><ImageDown className="w-4 h-4" /></ToolbarBtn>
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
        </>}
      </div>

      {showSearch && editor && <SearchReplaceBar editor={editor} onClose={() => setShowSearch(false)} />}

      {showSvgDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onMouseDown={() => setShowSvgDialog(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="SVG 代码转图片"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">SVG 代码转 PNG 图片</h3>
              <button className="btn-ghost h-8 w-8 p-0" onClick={() => setShowSvgDialog(false)} title="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
              <textarea
                className="input-field min-h-64 resize-y font-mono text-xs leading-5"
                value={svgSource}
                onChange={(event) => { setSvgSource(event.target.value); setSvgError(''); }}
                placeholder="粘贴完整的 <svg>...</svg> 代码"
                spellCheck={false}
              />
              <div className="flex min-h-64 items-center justify-center overflow-auto border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                {safeSvgPreviewUrl(svgSource) ? (
                  <img
                    src={safeSvgPreviewUrl(svgSource)}
                    alt="SVG 预览"
                    className="max-h-[420px] max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">输入有效 SVG 后显示预览</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3">
              <span className="min-w-0 text-xs text-[var(--color-danger)]">{svgError}</span>
              <div className="flex shrink-0 gap-2">
                <button className="btn-secondary text-sm" onClick={() => setShowSvgDialog(false)}>取消</button>
                <button className="btn-primary text-sm" onClick={insertSvgAsImage} disabled={svgRendering || !svgSource.trim()}>
                  {svgRendering ? '转换中...' : '转为 PNG 并插入'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

function svgToPngDataUrl(source: string, maxSize = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    let svg = '';
    try { svg = sanitizeSvgSource(source); }
    catch (error) { reject(error); return; }
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = document.createElement('img');
    image.onload = () => {
      const naturalWidth = image.naturalWidth || 800;
      const naturalHeight = image.naturalHeight || 600;
      const scale = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('当前环境无法创建图片画布'));
        return;
      }
      try {
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        reject(new Error('SVG 包含无法转换的外部资源'));
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('SVG 无法解析，请检查标签和属性'));
    };
    image.src = blobUrl;
  });
}

function sanitizeSvgSource(source: string): string {
  const raw = source.trim();
  if (!/^<svg[\s>]/i.test(raw) || !/<\/svg>\s*$/i.test(raw)) {
    throw new Error('请输入完整的 <svg>...</svg> 代码');
  }
  const documentNode = new DOMParser().parseFromString(raw, 'image/svg+xml');
  if (documentNode.querySelector('parsererror') || documentNode.documentElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('SVG 无法解析，请检查标签和属性');
  }
  documentNode.querySelectorAll('script, foreignObject').forEach((element) => element.remove());
  documentNode.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name.endsWith(':href')) && /^(https?:|\/\/|javascript:)/.test(value))) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(documentNode.documentElement);
}

function safeSvgPreviewUrl(source: string): string {
  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizeSvgSource(source))}`;
  } catch {
    return '';
  }
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
