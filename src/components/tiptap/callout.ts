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
    } as any;
  },
});

// 声明到 TipTap 命令类型，避免 TS 报错
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant: CalloutVariant) => ReturnType;
    };
  }
}
