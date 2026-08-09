import { useState, useEffect, useMemo, useCallback } from 'react';
import { List, Link2, FileText, AlertCircle, ArrowUpRight } from 'lucide-react';
import DocOutline from './DocOutline';
import { useJournalStore } from '../stores/journalStore';
import {
  getBacklinks,
  getBrokenOutgoingLinks,
  updateJournal,
  createJournal,
  type BacklinkInfo,
} from '../lib/db/queries';
import type { DocumentLink } from '../lib/db/schema';
import { linkifyFirstMention } from '../lib/markdownUtils';

type Tab = 'outline' | 'backlinks' | 'mentions';

interface DocumentSidebarProps {
  journalId?: string;
  title: string;
  aliases?: string[];
  content: string;
  /** 跳转到指定文档 */
  onNavigate: (id: string) => void;
}

interface MentionCandidate {
  entry: {
    id: string;
    title: string;
    content: string;
    contentPlain?: string;
    updatedAt: number;
  };
  matchedName: string;
}

/**
 * 判断 content 中是否存在未被 [[ ]] 包裹的目标标题提及；
 * 命中则返回首个匹配的标题名，否则返回 null。
 */
function findUnlinkedMention(content: string, names: string[]): string | null {
  if (!content) return null;
  // 先剥离所有双链，剩下的纯文本里若仍含目标标题，即视为"未链接提及"
  const stripped = content.replace(/\[\[[^\]]*\]\]/g, '');
  for (const name of names) {
    if (name && stripped.includes(name)) return name;
  }
  return null;
}

/**
 * 文档侧栏：大纲 / 反向链接 / 未链接提及 三个页签。
 * - 反向链接：从 documentLinks 持久化数据派生（where targetId = 当前文档）
 * - 未链接提及：扫描其它文档正文/标题中出现的当前文档标题或 alias（非 [[链接]]），
 *   只展示候选，用户点击"转为 [[双链]]"后才会改写目标文档。
 * - 失效链接：当前文档中指向不存在目标的 [[链接]]（broken=true），可一键创建目标文档。
 */
export default function DocumentSidebar({ journalId, title, aliases, content, onNavigate }: DocumentSidebarProps) {
  const { entries } = useJournalStore();
  const [tab, setTab] = useState<Tab>('outline');
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [brokenLinks, setBrokenLinks] = useState<DocumentLink[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!journalId) {
      setBacklinks([]);
      setBrokenLinks([]);
      return;
    }
    const [bl, br] = await Promise.all([
      getBacklinks(journalId),
      getBrokenOutgoingLinks(journalId),
    ]);
    setBacklinks(bl);
    setBrokenLinks(br);
  }, [journalId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 当前文档可用于匹配的名称集合（标题 + 别名）
  const names = useMemo(() => {
    const all = [title?.trim(), ...(aliases ?? [])].filter(Boolean) as string[];
    return Array.from(new Set(all));
  }, [title, aliases]);

  const mentions = useMemo<MentionCandidate[]>(() => {
    if (!journalId || names.length === 0) return [];
    const list: MentionCandidate[] = [];
    for (const e of entries) {
      if (e.deletedAt || e.id === journalId) continue;
      const hit = findUnlinkedMention(e.content, names);
      if (hit) list.push({ entry: e, matchedName: hit });
    }
    return list.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt).slice(0, 30);
  }, [entries, journalId, names]);

  // 把目标文档中第一处裸提及转为 [[双链]]（改写目标文档，触发链接重建）
  const handleLinkify = async (entryId: string, matchedName: string) => {
    const target = entries.find((e) => e.id === entryId);
    if (!target) return;
    const newContent = linkifyFirstMention(target.content, matchedName);
    if (newContent === target.content) return;
    setBusy(true);
    try {
      await updateJournal(entryId, { content: newContent });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // 为失效链接一键创建目标文档（创建后 rebuildBrokenLinkSources 会自动消除断链）
  const handleCreateTarget = async (targetTitle: string) => {
    setBusy(true);
    try {
      const entry = await createJournal({
        title: targetTitle,
        content: '',
        tags: [],
        subject: '',
        sourceType: 'manual',
      });
      onNavigate(entry.id);
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof List; count?: number }[] = [
    { key: 'outline', label: '大纲', icon: List },
    { key: 'backlinks', label: '反链', icon: Link2, count: backlinks.length },
    { key: 'mentions', label: '提及', icon: FileText, count: mentions.length },
  ];

  return (
    <div className="w-60 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
      {/* 页签头 */}
      <div className="flex border-b border-[var(--color-border)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs transition-colors border-b-2 ${
                active
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
              }`}
              title={t.label}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span className={`ml-0.5 px-1 rounded-full text-[10px] leading-none py-0.5 ${active ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'outline' && <DocOutline content={content} embedded />}

        {tab === 'backlinks' && (
          <div className="p-2 space-y-1">
            {backlinks.length === 0 && brokenLinks.length === 0 && (
              <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-3">暂无反向链接</p>
            )}

            {backlinks.map(({ link, source }) => (
              <button
                key={link.id}
                onClick={() => onNavigate(source.id)}
                className="block w-full text-left rounded-md p-2 hover:bg-[var(--color-surface-2)] transition-colors"
                title={`来自《${source.title}》`}
              >
                <p className="text-sm font-medium text-[var(--color-primary)] truncate">{source.title || '无标题'}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                  {source.contentPlain?.slice(0, 60) || '（空文档）'}
                </p>
              </button>
            ))}

            {brokenLinks.length > 0 && (
              <>
                <div className="pt-2 pb-1 px-1 flex items-center gap-1 text-[11px] font-medium text-[var(--color-danger)]">
                  <AlertCircle className="h-3 w-3" /> 失效链接（{brokenLinks.length}）
                </div>
                {brokenLinks.map((l) => (
                  <div key={l.id} className="rounded-md p-2 hover:bg-[var(--color-surface-2)]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm text-[var(--color-text)] truncate">[[{l.linkText}]]</span>
                      <button
                        onClick={() => handleCreateTarget(l.linkText)}
                        disabled={busy}
                        className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
                        title="创建该目标文档"
                      >
                        + 创建
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'mentions' && (
          <div className="p-2 space-y-1">
            {names.length === 0 && (
              <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-3">当前文档无标题，无法查找提及</p>
            )}
            {names.length > 0 && mentions.length === 0 && (
              <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-3">暂无未链接提及</p>
            )}
            {mentions.map(({ entry, matchedName }) => (
              <div key={entry.id} className="rounded-md p-2 hover:bg-[var(--color-surface-2)]">
                <button
                  onClick={() => onNavigate(entry.id)}
                  className="block w-full text-left"
                  title="打开该文档"
                >
                  <p className="text-sm font-medium text-[var(--color-primary)] truncate flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
                    {entry.title || '无标题'}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                    提及「{matchedName}」
                  </p>
                </button>
                <button
                  onClick={() => handleLinkify(entry.id, matchedName)}
                  disabled={busy}
                  className="mt-1 text-[11px] px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                  title={`把该文档中的「${matchedName}」转为 [[双链]]`}
                >
                  转为 [[双链]]
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
