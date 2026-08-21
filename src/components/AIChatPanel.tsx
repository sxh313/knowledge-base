import MarkdownContent from './MarkdownContent';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Code2, FileText, Lightbulb, Download } from 'lucide-react';
import { useAIStore } from '../stores/aiStore';

interface AIChatPanelProps {
  onAccept?: (content: string) => void;
  onAction?: (action: string) => void;
  journalId?: string;
  /** 移动端全屏模式下的返回/关闭按钮 */
  onClose?: () => void;
}

export default function AIChatPanel({ onAccept, onAction, onClose }: AIChatPanelProps) {
  const { isProcessing, streamingContent, error } = useAIStore();
  const navigate = useNavigate();

  const actions = [
    { key: 'summarize', label: '总结', desc: '提炼核心要点', icon: FileText },
    { key: 'codeReview', label: '代码审查', desc: '审查代码', icon: Code2 },
    { key: 'codeExplain', label: '解释代码', desc: '解释代码', icon: Lightbulb },
  ] as const;

  const isConfigError = error?.includes('尚未配置');


  return (
    <div className={`glass ${onClose ? 'w-full h-full' : 'w-[336px]'} border-l border-[var(--color-border)] flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-medium flex items-center gap-2">
          {onClose && (
            <button className="btn-ghost p-1" onClick={onClose} title="返回">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-primary)] text-white text-xs"><Brain className="h-3.5 w-3.5" /></span>
          AI 助手
        </span>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-1 p-2 border-b border-[var(--color-border)]">
        {actions.map(({ key, label, desc, icon: Icon }) => (
          <button
            key={key}
            className="btn-ghost text-xs flex-col py-2 h-auto"
            onClick={() => onAction?.(key)}
            title={desc}
          >
            <Icon className="h-4 w-4 text-[var(--color-primary)]" /><span>{label}</span>
            <span className="text-[10px] text-gray-400 font-normal">{desc}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isProcessing && (
          <div className="space-y-3">
            <div className="flex gap-2 animate-pulse">
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}

        {streamingContent && (
          <div className="prose-custom text-sm">
            <MarkdownContent>{streamingContent}</MarkdownContent>
          </div>
        )}

        {/* 友好错误提示 */}
        {error && !isProcessing && (
          <div className="rounded-lg border p-3 text-center" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 30%, transparent)', backgroundColor: 'var(--color-danger-light)' }}>
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            {isConfigError && (
              <button
                className="btn-primary text-xs mt-2 px-3 py-1.5"
                onClick={() => navigate('/settings')}
              >
                前往设置
              </button>
            )}
          </div>
        )}

        {!isProcessing && !streamingContent && !error && (
          <p className="text-sm text-gray-400 text-center py-8">
            点击上方按钮，AI 将基于笔记内容自动处理
          </p>
        )}
      </div>

      {/* Action buttons area */}
      {streamingContent && !isProcessing && (
        <div className="p-3 border-t border-[var(--color-border)] space-y-2">
          {/* 采纳到笔记摘要 */}
          {onAccept && (
            <button
              className="btn-secondary text-xs w-full"
              onClick={() => onAccept(streamingContent)}
            >
              <Download className="inline h-3.5 w-3.5" /> 采纳到笔记
            </button>
          )}
        </div>
      )}
    </div>
  );
}
