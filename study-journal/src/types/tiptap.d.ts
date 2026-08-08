// TipTap 类型声明回退
// 当包自带的类型声明因安装不完整而无法解析时使用。
// 在正常完成 npm install 的机器上，TypeScript 会优先使用包自带的类型，
// 此文件仅作为兜底，不会覆盖真实类型。

declare module '@tiptap/react' {
  import * as React from 'react';
  export interface EditorOptions {
    extensions?: any[];
    content?: string;
    autofocus?: boolean | string;
    editorProps?: any;
    onUpdate?: (args: { editor: Editor }) => void;
    onCreate?: (args: { editor: Editor }) => void;
    onSelectionUpdate?: (args: { editor: Editor }) => void;
  }
  export class Editor {
    chain(): any;
    commands: any;
    getHTML(): string;
    getText(): string;
    isActive(name?: string, attrs?: any): boolean;
    state: any;
    view: any;
    on(event: string, handler: (...args: any[]) => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
    destroy(): void;
  }
  export declare function useEditor(options: EditorOptions): Editor | null;
  export declare function EditorContent(props: any): React.ReactElement;
  export declare function BubbleMenu(props: any): React.ReactElement | null;
}

declare module '@tiptap/starter-kit' {
  const StarterKit: any;
  export default StarterKit;
}

declare module '@tiptap/extension-placeholder' {
  const Placeholder: any;
  export default Placeholder;
}

declare module '@tiptap/extension-link' {
  const Link: any;
  export default Link;
}

declare module '@tiptap/extension-image' {
  const Image: any;
  export default Image;
}