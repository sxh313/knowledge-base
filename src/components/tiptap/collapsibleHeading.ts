import { mergeAttributes } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';

// ─── 可折叠标题节点 ───
// 在 Heading 基础上增加 collapsed 属性：
//   - 点击标题左侧的折叠箭头可折叠/展开该标题下的内容
//   - 折叠时给标题加 data-collapsed="true"，由 RichTextEditor 的 DOM 同步
//     把「本标题之后、下一个同级或更高级标题之前」的内容标记为 data-hidden
// 存储层(Markdown)不保存折叠状态（折叠是纯展示行为），故无需 markdownUtils 改动。

export const CollapsibleHeading = Heading.extend({
  name: 'heading',

  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => {
          const collapsed = (attrs as { collapsed?: boolean }).collapsed;
          return collapsed ? { 'data-collapsed': 'true' } : {};
        },
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const level = (node.attrs as { level?: number }).level || 1;
    const collapsed = (node.attrs as { collapsed?: boolean }).collapsed;
    return [
      `h${level}`,
      mergeAttributes(HTMLAttributes, {
        class: 'collapsible-heading',
        ...(collapsed ? { 'data-collapsed': 'true' } : {}),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleHeadingCollapse:
        () =>
        ({ tr, state, dispatch }: any) => {
          const { $from } = state.selection;
          let headingDepth = -1;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'heading') {
              headingDepth = d;
              break;
            }
          }
          if (headingDepth < 0) return false;
          const headingNode = $from.node(headingDepth);
          const collapsed = !(headingNode.attrs as { collapsed?: boolean }).collapsed;
          const pos = $from.before(headingDepth);
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...headingNode.attrs,
              collapsed,
            });
            dispatch(tr);
          }
          return true;
        },
    } as any;
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsibleHeading: {
      toggleHeadingCollapse: () => ReturnType;
    };
  }
}
