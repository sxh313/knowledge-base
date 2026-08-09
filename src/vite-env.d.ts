/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

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
  // 云同步（来自 .env.local，不入库；实现“零手填”同步）
  readonly VITE_SYNC_TOKEN?: string;
  readonly VITE_SYNC_OWNER?: string;
  readonly VITE_SYNC_REPO?: string;
  readonly VITE_SYNC_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 构建时注入的应用版本号(来自 package.json)
declare const __APP_VERSION__: string;