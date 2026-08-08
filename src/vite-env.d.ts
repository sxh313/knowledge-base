/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.md' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_SHENGSUANYUN_API_KEY?: string;
  readonly VITE_RELAY_BASE_URL?: string;
  readonly VITE_RELAY_API_KEY?: string;
  readonly VITE_SILICONFLOW_API_KEY?: string;
  readonly VITE_ZHIPU_API_KEY?: string;
  readonly VITE_DEEPSEEK_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}