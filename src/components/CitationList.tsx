import { BookOpen, ExternalLink } from 'lucide-react';
import type { RetrievedChunk } from '../lib/ai/retrieval';

interface CitationListProps {
  citations: RetrievedChunk[];
  onNavigate?: (journalId: string) => void;
}

/** 展示 RAG 回答的参考来源（实际发送的分块：文档标题 + 章节，点击跳转） */
export default function CitationList({ citations, onNavigate }: CitationListProps) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] mb-1.5">
        <BookOpen className="h-3 w-3" /> 参考来源（{citations.length}）
      </p>
      <div className="flex flex-col gap-1">
        {citations.map((c, i) => (
          <button
            key={`${c.journalId}-${i}`}
            onClick={() => onNavigate?.(c.journalId)}
            className="group flex items-center gap-1.5 text-left text-xs rounded px-1.5 py-1 hover:bg-[var(--color-surface-2)] transition-colors"
            title={`打开《${c.title}》`}
          >
            <span className="text-[var(--color-text-tertiary)] tabular-nums w-4 shrink-0">{i + 1}.</span>
            <span className="text-[var(--color-primary)] truncate flex-1">
              《{c.title}》
              {c.heading && <span className="text-[var(--color-text-tertiary)]">#{c.heading}</span>}
            </span>
            <ExternalLink className="h-3 w-3 text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
