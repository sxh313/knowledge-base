import { useRef, useState } from 'react';
import { CloudUpload, Download, FolderArchive, Loader2, Upload } from 'lucide-react';
import type { SyncConfig } from '../../lib/db/schema';
import type { ImportProgress } from '../../lib/services/export';

interface Props {
  sync?: SyncConfig;
}

export default function DataManagementSection({ sync }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'markdown' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const importBackup = async (file: File) => {
    setBusy('import');
    setMessage(null);
    setProgress({ completed: 0, total: 100, message: '准备导入' });
    try {
      const { importData } = await import('../../lib/services/export');
      await importData(file, setProgress);
      setProgress({ completed: 100, total: 100, message: '导入完成' });
      setMessage('数据导入成功，索引已重建');
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : '文件格式错误'}`);
    } finally {
      setBusy(null);
    }
  };

  const pushMarkdown = async () => {
    if (!sync?.enabled || !sync.token) {
      setMessage('请先在“云同步”中配置并启用');
      return;
    }
    setBusy('markdown');
    setMessage(null);
    try {
      const { pushJournalsAsMarkdown } = await import('../../lib/sync/markdownSync');
      const result = await pushJournalsAsMarkdown(sync);
      setMessage(`已推送 ${result.pushed} 篇文档到 GitHub docs/`);
    } catch (error) {
      setMessage(`推送失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setBusy(null);
    }
  };

  const progressPercent = progress ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;

  return (
    <section id="data-management" className="scroll-mt-6 space-y-3">
      <h2 className="text-lg font-semibold">数据管理</h2>
      <p className="text-xs text-gray-400">JSON 备份包含文档、附件、对话、分类、版本、学习目标、业务偏好和 Agent 历史；不包含 API Key、GitHub Token 与设备级界面设置。</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button className="btn-secondary inline-flex items-center justify-center gap-2" disabled={busy !== null} onClick={() => void import('../../lib/services/export').then((module) => module.exportAllData())} type="button">
          <Download className="h-4 w-4" />导出数据
        </button>
        <button className="btn-secondary inline-flex items-center justify-center gap-2" disabled={busy !== null} onClick={() => inputRef.current?.click()} type="button">
          {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}导入数据
        </button>
        <button className="btn-secondary inline-flex items-center justify-center gap-2" disabled={busy !== null} onClick={() => void import('../../lib/services/export').then((module) => module.exportJournalsAsMarkdownZip())} title="每篇文档导出为独立 Markdown 文件并打包下载" type="button">
          <FolderArchive className="h-4 w-4" />导出 Markdown
        </button>
        <button className="btn-secondary inline-flex items-center justify-center gap-2" disabled={busy !== null} onClick={() => void pushMarkdown()} title="把每篇文档推送到 GitHub 仓库 docs/ 目录" type="button">
          {busy === 'markdown' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}{busy === 'markdown' ? '正在推送' : '推送 Markdown 到 GitHub'}
        </button>
        <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importBackup(file);
          event.target.value = '';
        }} />
      </div>
      {progress && busy === 'import' && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)]"><span>{progress.message}</span><span>{progressPercent}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full bg-[var(--color-primary)] transition-[width]" style={{ width: `${progressPercent}%` }} /></div>
        </div>
      )}
      {message && <p className="text-xs text-[var(--color-text-secondary)]">{message}</p>}
    </section>
  );
}
