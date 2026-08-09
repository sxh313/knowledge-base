import { Node, mergeAttributes } from '@tiptap/core';

// ─── 双向链接 wikilink 节点 ───
// 在编辑器中以 <span data-wikilink="目标标题"> 形式存在，显示为可点击的链接 chip。
// 存储层(Markdown)使用 [[目标标题]] 语法，markdownUtils 负责双向转换。
// 点击跳转由 RichTextEditor 的 DOM 监听处理（navigate 到目标文档）。

export const Wikilink = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-wikilink') || '',
        renderHTML: (attrs) => ({ 'data-wikilink': (attrs as { target: string }).target || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = (node.attrs as { target: string }).target;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'wikilink',
        contenteditable: 'false',
        title: `点击打开：${target}`,
      }),
      target,
    ];
  },

  addCommands() {
    return {
      insertWikilink:
        (target: string) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: this.name, attrs: { target } }),
    } as any;
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikilink: {
      insertWikilink: (target: string) => ReturnType;
    };
  }
}
