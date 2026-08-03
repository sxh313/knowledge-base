import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export default function CodeBlock({ code, language, showLineNumbers = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lines = code.split('\n');

  return (
    <div className="group relative my-4 rounded-xl border border-[var(--color-border)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-[var(--color-border)]">
        <span className="text-xs font-mono text-[var(--color-text-secondary)]">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="btn-ghost text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          title="复制代码"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-green-500" /> 已复制</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> 复制</>
          )}
        </button>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className={`font-mono ${language ? `language-${language}` : ''}`}>
          {showLineNumbers ? (
            lines.map((line, i) => (
              <span key={i} className="table-row">
                <span className="table-cell text-right pr-4 text-xs text-gray-400 select-none w-8">
                  {i + 1}
                </span>
                <span className="table-cell">{line || ' '}</span>
              </span>
            ))
          ) : (
            code
          )}
        </code>
      </pre>
    </div>
  );
}