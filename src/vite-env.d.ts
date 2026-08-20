/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare module '*.md' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 构建时注入的应用版本号(来自 package.json)
declare const __APP_VERSION__: string;

// ─── Electron 桌面端暴露的 API(通过 preload.cjs) ───
interface ElectronUpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'error' | 'downloaded' | 'installing';
  version?: string;
  message?: string;
  info?: unknown;
}
interface ElectronUpdateProgress { percent: number; transferred: number; total: number; }

interface Window {
  electronAPI?: {
    platform: string;
    isElectron: boolean;
    update: {
      check: () => Promise<void>;
      download: () => Promise<void>;
      install: () => Promise<void>;
      onStatus: (cb: (data: ElectronUpdateStatus) => void) => () => void;
      onProgress: (cb: (data: ElectronUpdateProgress) => void) => () => void;
    };
  };
}
