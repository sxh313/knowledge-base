import { useEffect, useState } from 'react';
import { ExternalLink, LocateFixed } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import MarkdownContent from '../components/MarkdownContent';

interface SourceSection {
  heading?: string;
  headingPath?: string[];
  anchor?: string;
  content: string;
  startOffset: number;
}

interface SourceDocument {
  id: string;
  path: string;
  title: string;
  module: string;
  content: string;
  sections?: SourceSection[];
  sourceUrl?: string;
}

const indexPromises = new Map<string, Promise<SourceDocument[]>>();
function loadIndex(knowledgeBase: 'zero2agent' | 'zero2leetcode'): Promise<SourceDocument[]> {
  const existing = indexPromises.get(knowledgeBase);
  if (existing) return existing;
  const request = fetch(`${import.meta.env.BASE_URL || '/'}${knowledgeBase}-kb.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`知识库索引加载失败：${response.status}`);
        return response.json() as Promise<{ documents?: SourceDocument[] }>;
      })
      .then((data) => data.documents ?? [])
      .catch((error) => {
        indexPromises.delete(knowledgeBase);
        throw error;
      });
  indexPromises.set(knowledgeBase, request);
  return request;
}

function findSource(documents: SourceDocument[], chunkId: string) {
  for (const document of documents) {
    const sections = document.sections ?? [];
    const index = sections.findIndex((section) => `${document.id}:${section.startOffset}` === chunkId);
    if (index >= 0) return { document, section: sections[index], index, sections };
  }
  return null;
}

function findTopicSource(documents: SourceDocument[], topicId: string) {
  const document = documents.find((item) => item.id === topicId);
  if (!document) return null;
  const sections = [{ heading: document.title, content: document.content, startOffset: 0 }];
  return { document, section: sections[0], index: 0, sections };
}

export default function Zero2Source({ knowledgeBase = 'zero2agent' }: { knowledgeBase?: 'zero2agent' | 'zero2leetcode' }) {
  const [params] = useSearchParams();
  const chunkId = params.get('chunkId') || '';
  const topicId = params.get('topicId') || '';
  const [source, setSource] = useState<ReturnType<typeof findSource>>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!chunkId && !topicId) {
      setError('缺少课程或原文片段标识，无法定位来源。');
      return () => { active = false; };
    }
    void loadIndex(knowledgeBase).then((documents) => {
      if (!active) return;
      const match = chunkId ? findSource(documents, chunkId) : findTopicSource(documents, topicId);
      if (match) setSource(match);
      else setError('没有找到对应的原文片段，可能是知识库已更新。');
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : '来源加载失败');
    });
    return () => { active = false; };
  }, [chunkId, topicId, knowledgeBase]);

  if (error) return <div className="content-frame-reading"><div className="card p-6 text-sm text-red-600">{error}</div></div>;
  if (!source) return <div className="content-frame-reading"><div className="card p-6 text-sm text-[var(--color-text-secondary)]">正在定位原文…</div></div>;

  const { document, section, index, sections } = source;
  const isTopicView = Boolean(topicId && !chunkId);
  const externalUrl = document.sourceUrl ? `${document.sourceUrl}${section.anchor ? `#${section.anchor}` : ''}` : undefined;
  const nearby = sections.slice(Math.max(0, index - 1), Math.min(sections.length, index + 2));
  return (
    <div className="content-frame-reading space-y-4">
      <header className="page-hero">
        <div className="page-hero-copy">
          <div className="page-kicker flex items-center gap-1"><LocateFixed className="h-3.5 w-3.5" /> {isTopicView ? '课程原文' : '来源定位'}</div>
          <h1 className="text-xl font-bold">{document.title}</h1>
          <p className="page-subtitle">{section.headingPath?.join(' > ') || section.heading || document.path}</p>
        </div>
        {externalUrl && <a className="btn-ghost inline-flex items-center gap-1 text-xs" href={externalUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> 打开原始网页</a>}
      </header>
      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3 text-xs text-[var(--color-text-tertiary)]">
          <span>{document.module} · {document.path}</span>
          <span>{isTopicView ? '完整章节' : `片段 ${index + 1}/${sections.length}`}</span>
        </div>
        <div className="rounded-lg border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary-light)]/30 p-4">
          <MarkdownContent>{section.content}</MarkdownContent>
        </div>
        {nearby.length > 1 && <details className="text-xs text-[var(--color-text-secondary)]"><summary className="cursor-pointer">查看相邻原文片段</summary><div className="mt-3 space-y-3">{nearby.filter((item) => item !== section).map((item) => <div key={item.startOffset} className="rounded border border-[var(--color-border)] p-3"><div className="mb-1 font-medium">{item.headingPath?.join(' > ') || item.heading || '正文'}</div><MarkdownContent>{item.content}</MarkdownContent></div>)}</div></details>}
      </section>
    </div>
  );
}
