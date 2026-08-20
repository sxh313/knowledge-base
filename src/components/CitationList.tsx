import { useState } from 'react';
import { BookOpen, FileText, Globe2, ChevronDown, ChevronUp, LocateFixed } from 'lucide-react';
import type { RetrievedChunk } from '../lib/ai/retrieval';

interface CitationListProps {
  citations: RetrievedChunk[];
  onNavigate?: (citation: RetrievedChunk) => void;
}

/** 展示 RAG 回答的参考来源（实际发送的分块：文档标题 + 章节，点击跳转） */
export default function CitationList({ citations, onNavigate }: CitationListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (citations.length === 0) return null;
  return (
    <div className="citation-card mt-3 rounded-lg border p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">
        <BookOpen className="h-3 w-3" /> 参考来源（{citations.length}）
      </p>
      <div className="flex flex-col gap-1">
        {citations.map((c, i) => {
          // 兼容早期未保存 sourceId/chunkId 的历史对话引用。
          const citationKey = c.chunkId || `${c.source}-${c.sourceId || c.journalId || c.knowledgeDocId || 'legacy'}-${c.offset?.start ?? i}`;
          return (
          <div key={citationKey} className="rounded px-1.5 py-1.5 hover:bg-[var(--color-surface-2)] transition-colors">
            <div className="flex items-start gap-1.5 text-left text-xs">
            <span className="text-[var(--color-text-tertiary)] tabular-nums w-4 shrink-0">{i + 1}.</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => onNavigate?.(c)} title={c.source === 'zero2agent' ? `定位 zero2Agent：${c.path || c.title}` : `定位《${c.title}》`} type="button">
              <span className="flex items-center gap-1 text-[var(--color-primary)] truncate">
                {c.source === 'zero2agent' || c.source === 'web' ? <Globe2 className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
                <span className="truncate">{c.source === 'zero2agent' ? 'zero2Agent · ' : c.source === 'web' ? '联网来源 · ' : '个人文档 · '}《{c.title}》
                {c.heading && <span className="text-[var(--color-text-tertiary)]">#{c.heading}</span>}
                </span>
                <LocateFixed className="h-3 w-3 shrink-0 opacity-70" />
              </span>
              <span className="block mt-0.5 text-[10px] leading-4 text-[var(--color-text-tertiary)] line-clamp-2">
                {c.path ? `${c.path} · ` : ''}{c.confidence != null ? `匹配度 ${Math.round(c.confidence * 100)}% · ` : ''}{c.content.replace(/\s+/g, ' ').slice(0, 180)}
              </span>
            </button>
            <button className="btn-ghost shrink-0 p-1" onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(citationKey)) next.delete(citationKey); else next.add(citationKey); return next; })} title={expanded.has(citationKey) ? '收起原文片段' : '查看原文片段'} aria-label={expanded.has(citationKey) ? '收起原文片段' : '查看原文片段'} type="button">
              {expanded.has(citationKey) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            </div>
            {expanded.has(citationKey) && <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">{c.content}</pre>}
          </div>
          );
        })}
      </div>
    </div>
  );
}
