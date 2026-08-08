import type { Editor } from '@tiptap/react';

// ─── 斜杠命令 ───
// 在 RichTextEditor 中通过 DOM 事件监听 / 输入，弹出命令菜单

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  keywords?: string;
  action: (editor: Editor) => void;
}

// 命令列表
export function getSlashCommands(): SlashCommandItem[] {
  return [
    {
      title: '标题 1',
      description: '大标题',
      icon: 'H1',
      keywords: 'h1 标题 大标题',
      action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: '标题 2',
      description: '中标题',
      icon: 'H2',
      keywords: 'h2 标题 中标题',
      action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: '标题 3',
      description: '小标题',
      icon: 'H3',
      keywords: 'h3 标题 小标题',
      action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: '正文',
      description: '普通段落',
      icon: '¶',
      keywords: '正文 段落 文本',
      action: (editor) => editor.chain().focus().setParagraph().run(),
    },
    {
      title: '有序列表',
      description: '编号列表',
      icon: '1.',
      keywords: '有序 列表 编号',
      action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: '无序列表',
      description: '项目符号列表',
      icon: '•',
      keywords: '无序 列表 项目',
      action: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: '引用',
      description: '引用一段文字',
      icon: '❝',
      keywords: '引用 引言 quote',
      action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: '代码块',
      description: '插入代码',
      icon: '</>',
      keywords: '代码 编程 code',
      action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      title: '分隔线',
      description: '水平分割线',
      icon: '—',
      keywords: '分割线 水平线 hr',
      action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      title: '图片',
      description: '插入图片',
      icon: '🖼',
      keywords: '图片 图像 image',
      action: (editor) => {
        const url = window.prompt('输入图片 URL');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      },
    },
    {
      title: '链接',
      description: '插入链接',
      icon: '🔗',
      keywords: '链接 超链接 link',
      action: (editor) => {
        const url = window.prompt('输入链接 URL');
        if (url) editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
      },
    },
  ];
}