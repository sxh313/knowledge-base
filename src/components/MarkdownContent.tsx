import { Children, isValidElement, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Expand, Maximize2, Minimize2, ChevronDown, ChevronUp } from 'lucide-react';
import type { RetrievedChunk } from '../lib/ai/retrieval';
import SourcePreviewModal from './SourcePreviewModal';

type MarkdownContentProps = ComponentProps<typeof ReactMarkdown> & { citationItems?: RetrievedChunk[] };

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return '';
}

function CodeBlock({ children }: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const child = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(child) ? child.props.className || '' : '';
  const language = className.match(/language-([^\s]+)/)?.[1] || 'text';
  const source = textContent(child).replace(/\n$/, '');
  const long = source.split('\n').length > 28;

  const copy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`markdown-code-block ${fullscreen ? 'markdown-code-fullscreen' : ''}`}>
      <div className="markdown-code-toolbar">
        <span className="markdown-code-note">备注：{language === 'text' ? '代码片段' : `${language} 代码`}</span>
        {long && <button type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? '展开代码' : '折叠代码'}>{collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}{collapsed ? '展开' : '折叠'}</button>}
        <button type="button" onClick={() => setFullscreen((value) => !value)} title={fullscreen ? '退出全屏' : '全屏查看'}>{fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={copy} title="复制代码">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      {!collapsed && <pre>{children}</pre>}
    </div>
  );
}

function linkCitations(markdown: string): string {
  return markdown.replace(/(^|[^\]!])\[((?:[KW])?\d+)\](?!\()/gi, (_match, prefix: string, ref: string) => `${prefix}[${ref}](citation:${ref})`);
}

function resolveCitation(ref: string, citationItems: RetrievedChunk[]): RetrievedChunk | null {
  const normalized = ref.toUpperCase();
  const typed = normalized.match(/^([KW])(\d+)$/);
  if (typed) {
    const sourceItems = citationItems.filter((item) => typed[1] === 'W' ? item.source === 'web' : item.source !== 'web');
    return sourceItems[Number(typed[2]) - 1] ?? null;
  }
  const numeric = normalized.match(/^\d+$/);
  if (!numeric) return null;
  return citationItems[Number(normalized) - 1] ?? null;
}

function safeUrlTransform(url: string): string {
  if (/^citation:/i.test(url)) return url;
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^(\/|#|\.)/.test(url)) return url;
  return '';
}

export default function MarkdownContent({ components, citationItems = [], children, ...props }: MarkdownContentProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [citationPreview, setCitationPreview] = useState<RetrievedChunk | null>(null);
  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview]);
  return <>
    <div className="answer-markdown prose-custom">
      <ReactMarkdown {...props} remarkPlugins={[remarkGfm]} urlTransform={safeUrlTransform} children={typeof children === 'string' ? linkCitations(children) : children} components={{
        ...components,
        pre: CodeBlock,
        a: ({ href, children: linkChildren, ...rest }) => {
          const match = href?.match(/^citation:((?:[KW])?\d+)$/i);
          if (match) {
            const item = resolveCitation(match[1], citationItems);
            const label = `[${textContent(linkChildren)}]`;
            return item ? <button className="inline-citation" type="button" onClick={() => setCitationPreview(item)} title="查看回答依据">{label}</button> : <span className="inline-citation opacity-60" title="没有找到对应来源">{label}</span>;
          }
          return <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer' : undefined} {...rest}>{linkChildren}</a>;
        },
        img: ({ src, alt, title, ...rest }) => <figure className="answer-image-figure"><button className="answer-image-button" type="button" onClick={() => setPreview(src || '')} aria-label={`放大查看：${alt || '图片'}`}><img {...rest} src={src} alt={alt || ''} title={title} loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = 'true'; }} /></button>{(alt || title) && <figcaption>{title || alt}</figcaption>}<span className="answer-image-error">图片加载失败 · 请检查来源地址</span></figure>,
        table: ({ children, ...rest }) => <div className="answer-table-scroll"><table {...rest}>{children}</table></div>,
      }} />
    </div>
    {preview && <div className="image-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><div className="image-preview-dialog" role="dialog" aria-label="图片预览"><button className="btn-ghost image-preview-close" onClick={() => setPreview(null)} aria-label="关闭图片预览" type="button">×</button><img src={preview} alt="放大预览" /><span><Expand className="h-3.5 w-3.5" /> 点击遮罩或按 Esc 关闭</span></div></div>}
    <SourcePreviewModal citation={citationPreview} onClose={() => setCitationPreview(null)} />
  </>;
}
