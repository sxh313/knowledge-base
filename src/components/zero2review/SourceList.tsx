import type { Zero2SourceReference } from '../../lib/zero2review/types';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, LocateFixed } from 'lucide-react';

export default function SourceList({ citations }: { citations: Zero2SourceReference[] }) {
  const navigate = useNavigate();
  if (citations.length === 0) return null;
  return <div className="border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-secondary)]">
    <div className="mb-1 font-medium">zero2Agent 来源</div>
    {citations.map((citation, index) => <div key={citation.chunkId} className="flex items-center gap-1.5 py-1">
      <span className="w-5 shrink-0 text-[var(--color-text-tertiary)]">[{index + 1}]</span>
      <button className="flex min-w-0 flex-1 items-center gap-1 text-left text-[var(--color-primary)] hover:underline" type="button" onClick={() => navigate(citation.localUrl || `/source/zero2agent?chunkId=${encodeURIComponent(citation.chunkId)}`)}>
        <LocateFixed className="h-3 w-3 shrink-0" />
        <span className="truncate">{citation.title}{citation.headingPath?.length ? ` · ${citation.headingPath.join(' > ')}` : citation.heading ? ` · ${citation.heading}` : ''}</span>
      </button>
      {citation.sourceUrl && <a className="shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]" href={`${citation.sourceUrl}${citation.sourceAnchor ? `#${citation.sourceAnchor}` : ''}`} target="_blank" rel="noreferrer" title="打开原始网页"><ExternalLink className="h-3 w-3" /></a>}
    </div>)}
  </div>;
}
