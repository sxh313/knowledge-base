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
      title: '标题 4',
      description: '四级标题',
      icon: 'H4',
      keywords: 'h4 标题 四级',
      action: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    },
    {
      title: '标题 5',
      description: '五级标题',
      icon: 'H5',
      keywords: 'h5 标题 五级',
      action: (editor) => editor.chain().focus().toggleHeading({ level: 5 }).run(),
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
      title: '待办清单',
      description: '可勾选的任务列表',
      icon: '☑',
      keywords: '待办 任务 清单 checkbox todo',
      action: (editor) => editor.chain().focus().toggleTaskList().run(),
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
      title: '表格',
      description: '插入 3×3 表格',
      icon: '▦',
      keywords: '表格 table 网格',
      action: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
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
    {
      title: '提示框',
      description: '💡 提示块（Callout）',
      icon: '💡',
      keywords: '提示 callout note 提示框',
      action: (editor) => editor.chain().focus().setCallout('note').run(),
    },
    {
      title: '技巧框',
      description: '✅ 技巧块',
      icon: '✅',
      keywords: '技巧 tip callout',
      action: (editor) => editor.chain().focus().setCallout('tip').run(),
    },
    {
      title: '警告框',
      description: '⚠️ 警告块',
      icon: '⚠️',
      keywords: '警告 warning callout',
      action: (editor) => editor.chain().focus().setCallout('warning').run(),
    },
    {
      title: '危险框',
      description: '🔴 危险/重要块',
      icon: '🔴',
      keywords: '危险 重要 danger important callout',
      action: (editor) => editor.chain().focus().setCallout('danger').run(),
    },
  ];
}