import { Children, isValidElement, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy } from 'lucide-react';

type MarkdownContentProps = ComponentProps<typeof ReactMarkdown>;

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return '';
}

function CodeBlock({ children }: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false);
  const child = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(child) ? child.props.className || '' : '';
  const language = className.match(/language-([^\s]+)/)?.[1] || 'text';
  const source = textContent(child).replace(/\n$/, '');

  const copy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-note">备注：{language === 'text' ? '代码片段' : `${language} 代码`}</span>
        <button type="button" onClick={copy} title="复制代码">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export default function MarkdownContent({ components, ...props }: MarkdownContentProps) {
  return <ReactMarkdown {...props} components={{ ...components, pre: CodeBlock }} />;
}
