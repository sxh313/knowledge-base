import { Node, mergeAttributes } from '@tiptap/core';

// ─── Callout 提示框节点 ───
// 在富文本编辑器中以 div[data-type="callout"] 形式存在，
// 支持 note / tip / warning / danger 四种变体。
// 存储层(Markdown)使用 GFM alerts 语法：> [!NOTE] / > [!TIP] / > [!WARNING] / > [!IMPORTANT]
// markdownUtils 负责与 HTML 的双向转换。

export type CalloutVariant = 'note' | 'tip' | 'warning' | 'danger';

export const CALLUT_VARIANTS: { key: CalloutVariant; emoji: string; label: string }[] = [
  { key: 'note', emoji: '💡', label: '提示' },
  { key: 'tip', emoji: '✅', label: '技巧' },
  { key: 'warning', emoji: '⚠️', label: '警告' },
  { key: 'danger', emoji: '🔴', label: '危险' },
];

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: {
        default: 'note' as CalloutVariant,
        parseHTML: (el) => (el.getAttribute('data-variant') as CalloutVariant) || 'note',
        renderHTML: (attrs) => ({ 'data-variant': (attrs as { variant: CalloutVariant }).variant || 'note' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (variant: CalloutVariant) =>
        ({ commands }: { commands: any }) =>
          commands.wrapIn(this.name, { variant }),
      toggleCallout:
        (variant: CalloutVariant = 'note') =>
        ({ commands }: { commands: any }) =>
          commands.toggleWrap(this.name, { variant }),
      unsetCallout:
        () =>
        ({ commands }: { commands: any }) =>
          commands.lift(this.name),
    } as any;
  },

  // Backspace：在 callout 第一个子块开头按，把内容 lift 出 callout（删除提示框但保留文字）
  // Enter：由 RichTextEditor 的 editorProps.handleKeyDown 统一拦截处理
  //        （默认 splitBlock 会把 callout 拆散成普通段落，必须自己插入段落）
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        if (!this.editor.isActive('callout')) return false;
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        const $from = selection.$from;
        let calloutDepth = -1;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'callout') { calloutDepth = d; break; }
        }
        if (calloutDepth < 0) return false;
        if ($from.depth !== calloutDepth + 1 || $from.parentOffset !== 0) return false;
        return this.editor.commands.lift('callout');
      },
    };
  },
});

// 声明到 TipTap 命令类型，避免 TS 报错
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant: CalloutVariant) => ReturnType;
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}
