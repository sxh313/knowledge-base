import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';
import { useUpdateStore, setUpdateSW } from '../stores/updateStore';

/**
 * 全局更新提示组件（PWA Service Worker 版本检测）。
 * - 检测到新版本时弹出 Toast，点击「立即更新」即激活新版本并刷新页面（安装）。
 * - 已注册的 SW 每小时自动检查一次更新。
 * 仅渲染一次（挂载在 App 根节点）。
 */
export default function UpdatePrompt() {
  const { needRefresh, offlineReady, setNeedRefresh, setOfflineReady } = useUpdateStore();
  const {
    needRefresh: [nr, setNr],
    offlineReady: [or, setOr],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // 注册成功后每小时检查一次更新
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] Service Worker 注册失败', error);
    },
  });

  // 用 ref 稳定保存 updateServiceWorker(Electron 桩模块下该函数每次渲染都会新建,
  // 若直接放进 effect 依赖会导致无限重渲染 React error #185)
  const updateSWRef = useRef(updateServiceWorker);
  updateSWRef.current = updateServiceWorker;

  // 同步 hook 状态到全局 store，供设置页共享
  useEffect(() => {
    setUpdateSW(updateSWRef.current);
    setNeedRefresh(nr);
    setOfflineReady(or);
  }, [nr, or, setNeedRefresh, setOfflineReady]);

  const close = () => {
    setNr(false);
    setOr(false);
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-[320px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg animate-fade-in">
      <div className="flex items-start gap-3 p-3">
        <div className="shrink-0 mt-0.5">
          {needRefresh ? (
            <Download className="h-5 w-5 text-indigo-500" />
          ) : (
            <RefreshCw className="h-5 w-5 text-green-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {needRefresh ? '✨ 发现新版本' : '📦 应用已可离线使用'}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            {needRefresh ? '点击「立即更新」安装最新版本' : '所有功能均可在无网络时使用'}
          </p>
          {needRefresh && (
            <button
              className="btn-primary text-xs mt-2 px-3 py-1.5"
              onClick={() => updateServiceWorker(true)}
            >
              立即更新
            </button>
          )}
        </div>
        <button
          className="shrink-0 p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]"
          onClick={close}
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
