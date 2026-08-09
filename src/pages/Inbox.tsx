import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox as InboxIcon, Plus, Check, Trash2, ExternalLink, Link2 } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import type { JournalEntry } from '../lib/db/schema';

const URL_RE = /^https?:\/\/[^\s]+$/i;

export default function Inbox() {
  const navigate = useNavigate();
  const { entries, loadAll, create, update, remove } = useJournalStore();

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const inboxItems = useMemo(
    () => entries.filter((e) => !e.deletedAt && e.status === 'inbox').sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );
  const subjects = useMemo(
    () => Array.from(new Set(entries.map((e) => e.subject).filter(Boolean))) as string[],
    [entries],
  );

  // 网址自动识别：若标题是一行纯网址，自动搬到 url 字段
  const handleTitleChange = (v: string) => {
    const trimmed = v.trim();
    if (URL_RE.test(trimmed) && !url) {
      setUrl(trimmed);
      setTitle('');
      return;
    }
    setTitle(v);
  };

  const handleAdd = async () => {
    const t = title.trim() || (url ? new URL(url).hostname.replace(/^www\./, '') : '');
    if (!t && !body.trim()) return;
    setBusy(true);
    try {
      const isClip = !!url;
      await create({
        title: t || '未命名收集',
        content: body.trim(),
        contentPlain: body.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim(),
        tags: [],
        subject: '',
        status: 'inbox',
        sourceType: isClip ? 'webclip' : 'manual',
        sourceRef: url ? { url, capturedAt: Date.now() } : undefined,
      });
      setTitle(''); setUrl(''); setBody('');
    } finally {
      setBusy(false);
    }
  };

  const handleOrganize = useCallback(async (id: string) => {
    await update(id, { status: 'active' });
  }, [update]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('移到回收站？')) return;
    await remove(id);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center gap-2">
        <InboxIcon className="h-5 w-5 text-[var(--color-primary)]" />
        <h1 className="text-2xl font-bold text-[var(--color-text)]">收集箱</h1>
        <span className="text-sm text-[var(--color-text-secondary)]">快速捕捉想法 / 网页剪藏，稍后整理</span>
      </div>

      {/* 快速收集 / 网页剪藏表单 */}
      <div className="card p-4 space-y-2">
        <input
          className="input-field text-sm"
          placeholder="标题（粘贴网址会自动识别为来源）"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
        />
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
            <input
              className="input-field pl-8 text-sm"
              placeholder="来源网址（可选，用于网页剪藏）"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>
        <textarea
          className="input-field text-sm min-h-[72px] resize-y"
          placeholder="粘贴正文 / 想法 / 摘抄…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <button className="btn-primary text-sm flex items-center gap-1" onClick={handleAdd} disabled={busy || (!title.trim() && !url && !body.trim())}>
            <Plus className="h-4 w-4" /> 添加到收集箱
          </button>
        </div>
      </div>

      {/* 收集箱列表 */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-secondary)]">待整理（{inboxItems.length}）</p>
        {inboxItems.length === 0 && (
          <div className="card p-8 text-center text-sm text-[var(--color-text-tertiary)]">
            收集箱已清空 🎉
          </div>
        )}
        {inboxItems.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            subjects={subjects}
            docTitles={entries.filter((e) => !e.deletedAt && e.title).map((e) => e.title)}
            onOrganize={handleOrganize}
            onDelete={handleDelete}
            onUpdate={update}
            onOpen={(id) => navigate(`/edit/${id}`)}
          />
        ))}
      </div>
    </div>
  );
}

interface InboxRowProps {
  item: JournalEntry;
  subjects: string[];
  docTitles: string[];
  onOrganize: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<JournalEntry>) => void;
  onOpen: (id: string) => void;
}

function InboxRow({ item, subjects, docTitles, onOrganize, onDelete, onUpdate, onOpen }: InboxRowProps) {
  const [title, setTitle] = useState(item.title);
  const [subject, setSubject] = useState(item.subject ?? '');
  const [tagsStr, setTagsStr] = useState((item.tags ?? []).join(', '));

  useEffect(() => {
    setTitle(item.title);
    setSubject(item.subject ?? '');
    setTagsStr((item.tags ?? []).join(', '));
  }, [item.id, item.title, item.subject, item.tags]);

  const commitMeta = () => {
    const tags = tagsStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    onUpdate(item.id, {
      title: title.trim() || item.title,
      subject,
      tags,
    });
  };

  // 建立双链：选择目标文档标题，追加 [[双链]] 到正文
  const handleAddLink = () => {
    const list = docTitles.slice(0, 25).join('、');
    const target = window.prompt(`输入要建立双链的文档标题：\n\n可用文档：\n${list}`, '');
    const t = target?.trim();
    if (!t) return;
    onUpdate(item.id, { content: `${item.content ? item.content + '\n\n' : ''}[[${t}]]` });
  };

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <input
          className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-transparent focus:border-[var(--color-primary)]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitMeta}
        />
        {item.sourceRef?.url && (
          <a
            href={item.sourceRef.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost p-1 text-[var(--color-text-tertiary)]"
            title={item.sourceRef.url}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {item.content && (
        <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">{item.content}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="input-field text-xs py-0.5 max-w-[140px]"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); }}
          onBlur={commitMeta}
        >
          <option value="">选择分类</option>
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          className="input-field text-xs py-0.5 flex-1 min-w-[120px]"
          placeholder="标签，逗号分隔"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          onBlur={commitMeta}
        />
      </div>

      <div className="flex items-center justify-end gap-1.5 pt-1">
        <button className="btn-ghost text-xs flex items-center gap-1" onClick={handleAddLink} title="追加一条 [[双链]] 到正文">
          <Link2 className="h-3.5 w-3.5" /> 双链
        </button>
        <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => onOpen(item.id)} title="在编辑器中打开">
          打开
        </button>
        <button className="btn-ghost text-xs flex items-center gap-1 text-[var(--color-danger)]" onClick={() => onDelete(item.id)} title="移到回收站">
          <Trash2 className="h-3.5 w-3.5" /> 删除
        </button>
        <button className="btn-primary text-xs flex items-center gap-1" onClick={() => onOrganize(item.id)} title="标记为已整理（转为正式文档）">
          <Check className="h-3.5 w-3.5" /> 标记已整理
        </button>
      </div>
    </div>
  );
}
