import type { Zero2SourceReference } from '../../lib/zero2review/types';

export default function SourceList({ citations }: { citations: Zero2SourceReference[] }) {
  if (citations.length === 0) return null;
  return <div className="border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-secondary)]">
    <div className="mb-1 font-medium">zero2Agent 来源</div>
    {citations.map((citation) => <div key={citation.chunkId}>[{citation.chunkId}] {citation.title}{citation.heading ? ` · ${citation.heading}` : ''}</div>)}
  </div>;
}
