import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';

function EnhancedCodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = node.attrs.language || 'text';
  const note = node.attrs.note || '';
  const copyCode = async () => {
    await navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <NodeViewWrapper className="code-block-shell">
      <div className="code-block-toolbar" contentEditable={false}>
        <span className="code-block-language">{language}</span>
        <label className="code-block-note"><span>备注</span><input value={note} onChange={(event) => updateAttributes({ note: event.target.value })} placeholder="添加这段代码的说明..." /></label>
        <button type="button" className="code-block-copy" onMouseDown={(event) => event.preventDefault()} onClick={copyCode} title="复制代码">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}<span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre><NodeViewContent as={'code' as never} className={`language-${language}`} /></pre>
    </NodeViewWrapper>
  );
}

export const EnhancedCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      note: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-code-note') || '',
        renderHTML: (attributes) => attributes.note ? { 'data-code-note': attributes.note } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(EnhancedCodeBlockView);
  },
});
