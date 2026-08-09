import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronUp, ChevronDown, Replace, CheckCheck, CaseSensitive } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface SearchReplaceBarProps {
  editor: Editor;
  onClose: () => void;
}

/**
 * 富文本编辑器搜索/替换栏（Ctrl+H 触发）
 * 基于 TipTap 的文档文本遍历，逐个匹配并高亮选中。
 * 支持：区分大小写、上一个/下一个、替换、全部替换、匹配计数。
 */
export default function SearchReplaceBar({ editor, onClose }: SearchReplaceBarProps) {
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const queryRef = useRef<HTMLInputElement>(null);

  // 全文文本 + 每个匹配在文档中的全局位置偏移映射
  type Match = { from: number; to: number };
  const matchesRef = useRef<Match[]>([]);

  useEffect(() => {
    queryRef.current?.focus();
  }, []);

  /** 把文档展开成 { text, pos } 段落数组（仅取可编辑文本节点） */
  const buildIndex = useCallback(() => {
    const editor2 = editor;
    const segments: { text: string; pos: number }[] = [];
    editor2.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        segments.push({ text: node.text, pos });
      }
      return true;
    });
    // 拼接为完整文本，并记录每个字符对应的文档 pos
    let fullText = '';
    const charToPos: number[] = [];
    for (const seg of segments) {
      for (let i = 0; i < seg.text.length; i++) {
        charToPos.push(seg.pos + i);
        fullText += seg.text[i];
      }
    }
    return { fullText, charToPos };
  }, [editor]);

  /** 执行搜索，更新匹配列表并定位到第一个匹配 */
  const runSearch = useCallback((q: string, cs: boolean) => {
    if (!q) {
      matchesRef.current = [];
      setMatchCount(0);
      setMatchIndex(0);
      return;
    }
    const { fullText, charToPos } = buildIndex();
    const hay = cs ? fullText : fullText.toLowerCase();
    const needle = cs ? q : q.toLowerCase();
    const result: Match[] = [];
    let idx = hay.indexOf(needle);
    while (idx >= 0) {
      const from = charToPos[idx];
      const to = charToPos[idx + needle.length - 1] + 1;
      if (from !== undefined && to !== undefined) result.push({ from, to });
      idx = hay.indexOf(needle, idx + needle.length);
    }
    matchesRef.current = result;
    setMatchCount(result.length);
    setMatchIndex(0);
    if (result.length > 0) {
      const m = result[0];
      editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run();
    }
  }, [buildIndex, editor]);

  // 输入变化时重新搜索
  useEffect(() => {
    runSearch(query, caseSensitive);
  }, [query, caseSensitive, runSearch]);

  const goto = useCallback((i: number) => {
    const ms = matchesRef.current;
    if (ms.length === 0) return;
    const next = (i % ms.length + ms.length) % ms.length;
    setMatchIndex(next);
    const m = ms[next];
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run();
  }, [editor]);

  const replaceCurrent = useCallback(() => {
    const ms = matchesRef.current;
    if (ms.length === 0) return;
    const m = ms[matchIndex];
    editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, replace).run();
    // 替换后重新搜索定位下一个
    setTimeout(() => runSearch(query, caseSensitive), 0);
  }, [editor, replace, matchIndex, query, caseSensitive, runSearch]);

  const replaceAll = useCallback(() => {
    const ms = matchesRef.current;
    if (ms.length === 0) return;
    // 从后往前替换，避免位置偏移；用单个 chain 合并为一个事务
    const sorted = [...ms].sort((a, b) => b.from - a.from);
    const chain = editor.chain().focus();
    for (const m of sorted) {
      chain.insertContentAt({ from: m.from, to: m.to }, replace);
    }
    chain.run();
    setTimeout(() => runSearch(query, caseSensitive), 0);
  }, [editor, replace, query, caseSensitive, runSearch]);

  return (
    <div className="absolute right-0 top-0 z-40 w-80 max-w-[90vw] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg animate-slide-down">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">查找与替换</span>
        <button className="btn-ghost p-1" onClick={onClose} title="关闭 (Esc)">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-3">
        {/* 查找 */}
        <div className="flex items-center gap-1">
          <input
            ref={queryRef}
            className="input-field flex-1 text-sm"
            placeholder="查找内容"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); goto(matchIndex + 1); }
              if (e.key === 'Escape') onClose();
            }}
          />
          <button
            className={`btn-ghost p-1.5 ${caseSensitive ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : ''}`}
            onClick={() => setCaseSensitive(v => !v)}
            title="区分大小写"
          >
            <CaseSensitive className="h-4 w-4" />
          </button>
        </div>
        {/* 替换 */}
        <div className="flex items-center gap-1">
          <input
            className="input-field flex-1 text-sm"
            placeholder="替换为"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
          <button className="btn-ghost p-1.5" onClick={() => goto(matchIndex - 1)} title="上一个" disabled={matchCount === 0}>
            <ChevronUp className="h-4 w-4" />
          </button>
          <button className="btn-ghost p-1.5" onClick={() => goto(matchIndex + 1)} title="下一个" disabled={matchCount === 0}>
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        {/* 操作 */}
        <div className="flex items-center gap-1.5 pt-1">
          <button className="btn-ghost text-xs flex items-center gap-1 px-2 py-1" onClick={replaceCurrent} disabled={matchCount === 0}>
            <Replace className="h-3.5 w-3.5" /> 替换
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1 px-2 py-1" onClick={replaceAll} disabled={matchCount === 0}>
            <CheckCheck className="h-3.5 w-3.5" /> 全部替换
          </button>
          <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)] tabular-nums">
            {matchCount > 0 ? `${matchIndex + 1} / ${matchCount}` : query ? '无匹配' : '输入关键词'}
          </span>
        </div>
      </div>
    </div>
  );
}
