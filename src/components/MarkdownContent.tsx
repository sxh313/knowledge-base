import { Children, isValidElement, useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';
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

export function normalizeMermaidSource(source: string): string {
  let normalized = source
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // 模型常把标签内换行输出成两个字符 “\\n”；Mermaid 不会将其当作换行，
    // 还会把后续内容解析成非法 token。使用 Mermaid 支持的 <br/> 保留可读性。
    .replace(/\\n/g, '<br/>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+(subgraph\s+[A-Za-z_][\w-]*(?:\[[^\]]*\])?)/gi, '\n$1')
    .replace(/(subgraph\s+[A-Za-z_][\w-]*(?:\[[^\]]*\])?)\s+(?=[A-Za-z_][\w-]*(?:\[|\(|\{))/gi, '$1\n')
    .replace(/\s+end(?=\s|$)/gi, '\nend\n')
    .replace(/(\]|\)|\}|\b[A-Za-z_][\w-]*\b)\s+(?=[A-Za-z_][\w-]*\s*(?:-->|---|==>|-\.->))/g, '$1\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // 传统 RAG 与 Agentic RAG 是横向对比，不应在 TB 布局中把第二组推到图表底部。
  if (/subgraph\s+(?:trad|traditional)\b/i.test(normalized) && /subgraph\s+agentic\b/i.test(normalized)) {
    normalized = normalized.replace(/^flowchart\s+TB\b/i, 'flowchart LR');
  }
  return normalized;
}

function MermaidBlock({ source }: { source: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [darkMode, setDarkMode] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const formatted = normalizeMermaidSource(source);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDarkMode(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([import('mermaid'), import('dompurify')])
      .then(async ([mermaidModule, purifierModule]) => {
        const mermaid = mermaidModule.default;
        // htmlLabels 必须放在顶层配置；放在 flowchart 内在 Mermaid 11 中仍会生成空的 foreignObject。
        // 顶层关闭后使用纯 SVG <text>，可安全清洗且不会丢失节点文字。
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          htmlLabels: false,
          themeVariables: {
            primaryColor: darkMode ? '#302b59' : '#eeeaff',
            primaryTextColor: darkMode ? '#f0f1fa' : '#24263a',
            primaryBorderColor: darkMode ? '#9b8cff' : '#6f5bd3',
            lineColor: darkMode ? '#8991ae' : '#7a819b',
            secondaryColor: darkMode ? '#19384e' : '#e4f1f8',
            tertiaryColor: darkMode ? '#49301f' : '#fff0df',
            clusterBkg: darkMode ? '#191d31' : '#f7f8fc',
            clusterBorder: darkMode ? '#47506f' : '#aeb4ca',
            edgeLabelBackground: darkMode ? '#12172a' : '#ffffff',
            background: darkMode ? '#12172a' : '#ffffff',
            mainBkg: darkMode ? '#302b59' : '#eeeaff',
            textColor: darkMode ? '#f0f1fa' : '#24263a',
            fontFamily: 'Inter, Noto Sans SC, Microsoft YaHei, sans-serif',
          },
          flowchart: { curve: 'basis', nodeSpacing: 42, rankSpacing: 52, padding: 12 },
        });
        const rendered = await mermaid.render(`mermaid-${reactId}-${Date.now()}`, formatted);
        // Mermaid 节点文字通常位于 foreignObject；仅启用 svg profile 会将其整段清掉，
        // 最终只剩空矩形和连线。Mermaid 已使用 strict 安全级别，这里仅放行文字容器标签。
        const clean = purifierModule.default.sanitize(rendered.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ['foreignObject', 'div', 'span'],
        });
        if (!cancelled) { setSvg(clean); setError(''); }
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '流程图语法无法解析'); });
    return () => { cancelled = true; };
  }, [darkMode, formatted, reactId]);

  const copy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return <div className="mermaid-diagram">
    <div className="markdown-code-toolbar"><span className="markdown-code-note">流程图 · Mermaid</span><button type="button" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? '已复制' : '复制源码'}</button></div>
    {svg ? <div className="mermaid-diagram-canvas" dangerouslySetInnerHTML={{ __html: svg }} /> : error ? <div className="mermaid-diagram-error"><p>流程图渲染失败：{error}</p><pre><code>{formatted}</code></pre></div> : <div className="mermaid-diagram-loading">正在绘制流程图…</div>}
  </div>;
}

function AsciiFlowBlock({ source }: { source: string }) {
  const rows = source.split('\n').filter((line) => line.includes('→')).map((line) => Array.from(line.matchAll(/│\s*([^│]+?)\s*│/g)).map((match) => match[1].trim()).filter(Boolean));
  const labels = rows[0] ?? [];
  const subtitles = rows[1] ?? [];
  const copy = () => void navigator.clipboard.writeText(source);
  return <div className="ascii-flow-diagram">
    <div className="ascii-flow-toolbar"><span>流程图</span><button type="button" onClick={copy}><Copy className="h-3.5 w-3.5" />复制</button></div>
    <div className="ascii-flow-track">
      {labels.map((label, index) => <div key={`${label}-${index}`} className="ascii-flow-step"><div className="ascii-flow-card"><strong>{label}</strong>{subtitles[index] && <small>{subtitles[index]}</small>}</div>{index < labels.length - 1 && <span className="ascii-flow-arrow">→</span>}</div>)}
    </div>
  </div>;
}

function CodeBlock({ children }: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const child = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(child) ? child.props.className || '' : '';
  const language = className.match(/language-([^\s]+)/)?.[1] || 'text';
  const rawSource = textContent(child).replace(/\n$/, '');
  const source = language.toLowerCase() === 'mermaid' ? normalizeMermaidSource(rawSource) : rawSource;
  const long = source.split('\n').length > 28;

  if (language.toLowerCase() === 'mermaid') return <MermaidBlock source={source} />;
  if (language.toLowerCase() === 'text' && /┌[─-]+┐/.test(source) && source.includes('→')) return <AsciiFlowBlock source={source} />;

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

/** 修复模型常见的单行 Markdown：HTML 空格、粘连表格、错误粗体和内联 Mermaid。 */
export function normalizeAIResponseMarkdown(markdown: string): string {
  let value = markdown
    .replace(/&(?:#xA0|#160|nbsp);/gi, ' ')
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ')
    .replace(/\r\n?/g, '\n');

  value = value.replace(
    /^>\s*\*\*来源：(.+?)\s+新手答[：:]\s*/m,
    (_match, source: string) => `> **来源：${source.trim()}**\n\n**新手答：** `,
  );
  value = value.replace(/\s+高手答[：:]\s*/g, '\n\n**高手答：** ');

  // 部分模型用四个星号包裹块级内容，CommonMark 会把后续内容全部吞进粗体。
  value = value.replace(/\*{4,}/g, '\n\n');

  // Mermaid 不应放在单反引号内；即使尚未启用图形渲染，也应作为完整代码块展示。
  value = value.replace(/`mermaid\s+([\s\S]*?)`/gi, (_match, source: string) => {
    const formatted = normalizeMermaidSource(source);
    return `\n\n\`\`\`mermaid\n${formatted}\n\`\`\`\n\n`;
  });

  // GFM 表格从模型流式输出后经常变成 “| ... | | ... |”，恢复真实行边界。
  value = value
    // 模型偶尔在表格前后残留 `` / ```，只在围栏紧贴表格边界时移除，避免破坏真正代码块。
    .replace(/(^|\n)[ \t]*`{2,3}[ \t]*(?=\|)/g, '$1')
    .replace(/(\|)[ \t]*`{2,3}(?=\s*(?:\n|$|[。！？]))/g, '$1')
    .replace(/\|\s+\|(?=[^|\n])/g, '|\n|')
    .replace(/([^\n])\s*(\|\s*维度\s*\|)/g, '$1\n\n$2')
    .replace(/(^|\n)([^|\n]*?)\s*(`{2,3})?\s*(\|\s*(?:问题类型|类型|方案|原因)\s*\|)/g, (_match, prefix: string, lead: string, _fence: string, tableStart: string) => `${prefix}${lead.trim()}\n\n${tableStart}`)
    .replace(/(\|[^\n]+\|)\s*([\p{Script=Han}A-Za-z][^\n]{0,40}[：:])/gu, '$1\n\n$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // 流式服务偶尔会在完整引用后重复输出最后一个编号，例如 “[1] [2]。2。”。
  // 仅当裸数字与最后一个引用编号相同且位于行尾时清理，避免误删正文数字。
  value = value.replace(
    /((?:\[(?:[KW])?\d+\]\s*)+)([。.!！?？]?)\s*(\d+)([。.!！?？])(?=\s*(?:\n|$))/gi,
    (match, refs: string, punctuation: string, orphan: string, ending: string) => {
      const lastRef = Array.from(refs.matchAll(/\[(?:[KW])?(\d+)\]/gi)).at(-1)?.[1];
      return lastRef === orphan ? `${refs.trimEnd()}${punctuation || ending}` : match;
    },
  );

  return value.trim();
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
      <ReactMarkdown {...props} remarkPlugins={[remarkGfm]} urlTransform={safeUrlTransform} children={typeof children === 'string' ? linkCitations(normalizeAIResponseMarkdown(children)) : children} components={{
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
        table: ({ children, node: _node, ...rest }) => <div className="answer-table-scroll"><table {...rest}>{children}</table></div>,
      }} />
    </div>
    {preview && <div className="image-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><div className="image-preview-dialog" role="dialog" aria-label="图片预览"><button className="btn-ghost image-preview-close" onClick={() => setPreview(null)} aria-label="关闭图片预览" type="button">×</button><img src={preview} alt="放大预览" /><span><Expand className="h-3.5 w-3.5" /> 点击遮罩或按 Esc 关闭</span></div></div>}
    <SourcePreviewModal citation={citationPreview} onClose={() => setCitationPreview(null)} />
  </>;
}
