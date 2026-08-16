import { mergeAttributes } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const collapsibleHeadingKey = new PluginKey('collapsibleHeadingSections');

function buildCollapsedDecorations(doc: any) {
  const decorations: Decoration[] = [];
  const collapsedLevels: number[] = [];
  doc.forEach((node: any, pos: number) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level) || 1;
      while (collapsedLevels.length && collapsedLevels[collapsedLevels.length - 1] >= level) collapsedLevels.pop();
      if (collapsedLevels.length) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'heading-section-hidden', 'data-hidden': 'true' }));
      }
      if (node.attrs.collapsed) collapsedLevels.push(level);
      return;
    }
    if (collapsedLevels.length) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'heading-section-hidden', 'data-hidden': 'true' }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

function isHeadingArrowClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const heading = target?.closest<HTMLElement>(
    'h1.collapsible-heading, h2.collapsible-heading, h3.collapsible-heading, h4.collapsible-heading, h5.collapsible-heading',
  );
  if (!heading) return false;

  const rect = heading.getBoundingClientRect();
  return event.clientX - rect.left <= 24;
}

// ─── 可折叠标题节点 ───
// 在 Heading 基础上增加 collapsed 属性：
//   - 点击标题左侧的折叠箭头可折叠/展开该标题下的内容
//   - 折叠时用 ProseMirror Decoration 隐藏本标题之后、下一个同级或更高级标题之前的内容
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

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collapsibleHeadingKey,
        props: {
          decorations: (state) => buildCollapsedDecorations(state.doc),
          handleClickOn: (view, _pos, node, nodePos, event, direct) => {
            if (!direct || node.type.name !== 'heading' || !isHeadingArrowClick(event)) return false;
            event.preventDefault();
            view.dispatch(view.state.tr.setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              collapsed: !node.attrs.collapsed,
            }));
            return true;
          },
        },
      }),
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsibleHeading: {
      toggleHeadingCollapse: () => ReturnType;
    };
  }
}
