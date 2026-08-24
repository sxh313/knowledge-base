import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, LocateFixed, X } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import type { RetrievedChunk } from '../lib/ai/retrieval';
import type { Zero2SourceReference } from '../lib/zero2review/types';

export type PreviewCitation = RetrievedChunk | Zero2SourceReference;

interface Props {
  citation: PreviewCitation | null;
  onClose: () => void;
}

interface KBSection { heading?: string; headingPath?: string[]; anchor?: string; content: string; startOffset: number }
interface KBDocument { id: string; path: string; title: string; module: string; sourceUrl?: string; sections?: KBSection[] }

function isRetrieved(citation: PreviewCitation): citation is RetrievedChunk {
  return 'content' in citation;
}

export default function SourcePreviewModal({ citation, onClose }: Props) {
  const [content, setContent] = useState(() => citation && (isRetrieved(citation) || citation.content) ? (citation as { content?: string }).content || '' : '正在加载对应原文片段…');
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(!!citation, dialogRef, closeRef);

  useEffect(() => {
    let active = true;
    if (citation && (isRetrieved(citation) || citation.content)) {
      setContent((citation as { content?: string }).content || '');
    }
    if (!citation || isRetrieved(citation) || citation.content || citation.source !== 'zero2agent') return () => { active = false; };
    void fetch(`${import.meta.env.BASE_URL || '/'}zero2agent-kb.json`)
      .then((response) => response.json() as Promise<{ documents?: KBDocument[] }>)
      .then((data) => {
        if (!active) return;
        for (const document of data.documents ?? []) {
          const section = (document.sections ?? []).find((item) => `${document.id}:${item.startOffset}` === citation.chunkId);
          if (section) { setContent(section.content); return; }
        }
        setContent('没有找到对应的原文片段，可能是知识库已经更新。');
      })
      .catch(() => { if (active) setContent('原文加载失败，请稍后重试。'); });
    return () => { active = false; };
  }, [citation]);

  useEffect(() => {
    if (!citation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [citation, onClose]);

  if (!citation) return null;
  const heading = citation.headingPath?.join(' > ') || citation.heading || '正文片段';
  const sourceUrl = citation.source === 'zero2agent' && citation.sourceUrl
    ? `${citation.sourceUrl}${citation.sourceAnchor ? `#${citation.sourceAnchor}` : ''}`
    : citation.source === 'web' && isRetrieved(citation)
      ? citation.sourceUrl
      : undefined;
  const localUrl = citation.source === 'zero2agent'
    ? `/source/zero2agent?chunkId=${encodeURIComponent(citation.chunkId)}`
    : isRetrieved(citation) ? citation.localUrl : undefined;
  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return <div className="source-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-preview-title">
      <header className="source-modal-header">
        <div className="min-w-0"><div className="source-modal-kicker"><LocateFixed className="h-3.5 w-3.5" /> 回答依据</div><h2 id="source-preview-title" className="truncate">{citation.title}</h2><p className="truncate">{heading}</p></div>
        <button ref={closeRef} className="btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="关闭" title="关闭" type="button"><X className="h-5 w-5" /></button>
      </header>
      <div className="source-modal-meta"><span>{citation.source === 'zero2agent' ? 'zero2Agent 原文' : citation.source === 'web' ? '联网来源' : '个人文档'}</span>{citation.path && <span className="truncate">{citation.path}</span>}{isRetrieved(citation) && citation.offset?.start != null && <span>位置 {citation.offset.start}</span>}</div>
      <div className="source-modal-content"><div className="source-modal-highlight"><MarkdownContent>{content}</MarkdownContent></div></div>
      <footer className="source-modal-actions"><button className="btn-secondary text-xs" onClick={() => void copy()} type="button">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? '已复制' : '复制片段'}</button>{localUrl && <a className="btn-secondary text-xs" href={localUrl}>在来源页查看</a>}{sourceUrl && <a className="btn-primary text-xs" href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />打开网页原文</a>}</footer>
    </section>
  </div>;
}
