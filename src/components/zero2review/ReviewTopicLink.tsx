import { useEffect, useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getTopicById, type Zero2CatalogTopic } from '../../lib/zero2review/catalog';

function fallbackTitle(topicId: string): string {
  const parts = topicId.replace(/^zero2agent:/, '').split('/').filter(Boolean);
  const segment = parts.at(-1) === 'index.md' ? parts.at(-2) : parts.at(-1)?.replace(/\.md$/i, '');
  return (segment || '课程资料').replace(/^\d+[-_]?/, '').replace(/[-_]+/g, ' ');
}

export default function ReviewTopicLink({ topicId, compact = false, muted = false }: { topicId: string; compact?: boolean; muted?: boolean }) {
  const [topic, setTopic] = useState<Zero2CatalogTopic>();

  useEffect(() => {
    let active = true;
    void getTopicById(topicId).then((result) => {
      if (active) setTopic(result);
    });
    return () => { active = false; };
  }, [topicId]);

  const title = topic?.title || fallbackTitle(topicId);
  return (
    <Link
      className={`group/topic flex min-w-0 items-center gap-2 rounded-md text-left transition-colors hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 ${compact ? 'py-0.5' : 'px-1 py-1'} ${muted ? 'text-[var(--color-text-tertiary)]' : ''}`}
      to={`/source/zero2agent?topicId=${encodeURIComponent(topicId)}`}
      aria-label={`查看课程原文：${title}`}
      title="打开课程原文"
    >
      <BookOpen className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0 text-[var(--color-primary)]`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {!compact && topic?.module && <span className="mt-0.5 block truncate text-xs font-normal text-[var(--color-text-tertiary)]">{topic.module}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover/topic:translate-x-0.5 group-hover/topic:text-[var(--color-primary)]" aria-hidden="true" />
    </Link>
  );
}
