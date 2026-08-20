import type { SyncConfig } from '../../lib/db/schema';
import type { SyncStatus } from '../../stores/syncStore';
import SyncConflicts from '../SyncConflicts';

interface Props {
  config: SyncConfig;
  status: SyncStatus;
  errorMessage: string | null;
  testing: boolean;
  testMessage: string | null;
  onUpdate: (patch: Partial<SyncConfig>) => void;
  onTest: () => Promise<void>;
  onPull: () => Promise<boolean>;
  onSync: () => Promise<boolean>;
}

export default function SyncSettingsSection({ config, status, errorMessage, testing, testMessage, onUpdate, onTest, onPull, onSync }: Props) {
  return (
    <section id="cloud-sync" className="scroll-mt-6 space-y-3">
      <h2 className="text-lg font-semibold">☁️ 云同步（GitHub）</h2>
      <p className="text-xs text-gray-400">数据推送到你的 GitHub 私有仓库，跨设备同步、免费、带版本历史</p>
      <div className="card space-y-3">
        <label className="flex items-center justify-between cursor-pointer"><span className="text-sm font-medium">启用云同步</span><input type="checkbox" checked={config.enabled} onChange={e => onUpdate({ enabled: e.target.checked })} className="h-4 w-4 rounded border-[var(--color-border)]" /></label>
        {config.enabled && <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-400">GitHub 用户名或组织<input className="input-field mt-1" value={config.owner} onChange={e => onUpdate({ owner: e.target.value.trim() })} placeholder="your-name" /></label>
            <label className="text-xs text-gray-400">私有仓库名<input className="input-field mt-1" value={config.repo} onChange={e => onUpdate({ repo: e.target.value.trim() })} placeholder="knowledge-base" /></label>
            <label className="text-xs text-gray-400">分支<input className="input-field mt-1" value={config.branch} onChange={e => onUpdate({ branch: e.target.value.trim() })} placeholder="main" /></label>
            <label className="text-xs text-gray-400">数据文件路径<input className="input-field mt-1" value={config.path} onChange={e => onUpdate({ path: e.target.value.trim() })} placeholder="data.json" /></label>
          </div>
          <label className="block text-xs text-gray-400">GitHub Fine-grained Token（仅授予该私有仓库 Contents 读写权限）<input type="password" className="input-field mt-1 font-mono" value={config.token} onChange={e => onUpdate({ token: e.target.value.trim() })} placeholder="github_pat_..." autoComplete="off" /></label>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">Token 仅保存在当前设备的 IndexedDB，不进入安装包、普通备份或云同步。</p>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.autoSync} onChange={e => onUpdate({ autoSync: e.target.checked })} className="h-4 w-4 rounded border-[var(--color-border)]" /><span className="text-sm">编辑停顿 10 秒后自动同步</span></label>
          <label className="flex items-center gap-2 cursor-pointer" title="同步 Agent 会话、消息与运行记录（含撤销快照，可能含敏感内容）"><input type="checkbox" checked={config.syncAgentData ?? false} onChange={e => onUpdate({ syncAgentData: e.target.checked })} className="h-4 w-4 rounded border-[var(--color-border)]" /><span className="text-sm">同步 Agent 运行记录（含敏感内容，默认关闭）</span></label>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-secondary text-sm" onClick={() => void onTest()} disabled={testing}>{testing ? '测试中...' : '测试连接'}</button>
            <button className="btn-secondary text-sm" onClick={() => void onPull()} disabled={status === 'syncing'}>{status === 'syncing' ? '拉取中...' : '⬇️ 从云端拉取'}</button>
            <button className="btn-primary text-sm" onClick={() => void onSync()} disabled={status === 'syncing'}>{status === 'syncing' ? '同步中...' : '立即同步（推+拉）'}</button>
            {config.lastSyncAt && <span className="text-xs text-gray-400">上次同步：{new Date(config.lastSyncAt).toLocaleString('zh-CN')}</span>}
          </div>
          {testMessage && <p className="text-xs text-gray-500">{testMessage}</p>}
          {status === 'success' && <p className="text-xs text-green-500">同步成功</p>}
          {status === 'error' && <p className="text-xs text-red-500">同步失败：{errorMessage || '请检查配置与网络'}</p>}
          <SyncConflicts refreshKey={config.lastSyncAt ?? 0} />
        </>}
      </div>
    </section>
  );
}
