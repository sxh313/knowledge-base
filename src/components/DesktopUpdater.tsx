import { useEffect, useState } from 'react';
import { RefreshCw, Download, RotateCcw, CheckCircle2 } from 'lucide-react';

/**
 * 桌面端(Electron)自动更新组件。
 * 通过 preload 暴露的 window.electronAPI.update 与主进程通信,
 * 支持:检查更新 → 下载 → 重启安装。
 * 浏览器端自动隐藏(无 electronAPI)。
 */
export default function DesktopUpdater() {
  const [state, setState] = useState<string>('idle'); // idle|checking|available|not-available|downloading|downloaded|error
  const [version, setVersion] = useState<string>('');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');

  const api = window.electronAPI;

  useEffect(() => {
    if (!api?.update) return;
    const offStatus = api.update.onStatus((d) => {
      if (d.status === 'checking') setState('checking');
      else if (d.status === 'available') { setState('available'); setVersion(d.version || ''); }
      else if (d.status === 'not-available') { setState('not-available'); setMessage('已是最新版本'); }
      else if (d.status === 'downloaded') { setState('downloaded'); setVersion(d.version || ''); }
      else if (d.status === 'error') { setState('error'); setMessage(d.message || '检查更新失败'); }
    });
    const offProgress = api.update.onProgress((p) => {
      setState('downloading');
      setPercent(Math.round(p.percent));
    });
    return () => { offStatus(); offProgress(); };
  }, [api]);

  // 非 Electron 环境不渲染
  if (!api?.isElectron || !api.update) return null;

  const handleCheck = () => { setState('checking'); setMessage(''); api.update.check(); };
  const handleDownload = () => { api.update.download(); };
  const handleInstall = () => { api.update.install(); };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">自动更新</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            当前版本 v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
          </p>
        </div>
        {state === 'idle' && (
          <button className="btn-secondary text-sm" onClick={handleCheck}>
            <RefreshCw className="h-4 w-4" /> 检查更新
          </button>
        )}
      </div>

      {/* 状态展示 */}
      {state === 'checking' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <RefreshCw className="h-4 w-4 animate-spin" /> 正在检查更新...
        </div>
      )}

      {state === 'available' && (
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-3">
          <p className="text-sm text-indigo-700 dark:text-indigo-300">✨ 发现新版本 v{version}</p>
          <button className="btn-primary text-xs mt-2" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" /> 下载并更新
          </button>
        </div>
      )}

      {state === 'downloading' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-text-secondary)]">⌛ 正在下载更新... {percent}%</p>
          <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {state === 'downloaded' && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 p-3">
          <p className="text-sm text-green-700 dark:text-green-300">✅ 更新已下载完成(v{version})</p>
          <button className="btn-primary text-xs mt-2" onClick={handleInstall}>
            <RotateCcw className="h-3.5 w-3.5" /> 重启并安装
          </button>
        </div>
      )}

      {state === 'not-available' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-500">
          <span>⚠️ {message}</span>
          <button className="btn-secondary text-xs" onClick={handleCheck}>重试</button>
        </div>
      )}
    </div>
  );
}