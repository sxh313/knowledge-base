import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type JournalEntry, type DocumentLink } from '../lib/db/schema';
import { Search, RefreshCw, Unlink, Focus, ListFilter } from 'lucide-react';
import KnowledgeGraph, { type GraphNode, type GraphEdge } from '../components/KnowledgeGraph';

export default function KnowledgeMap() {
  const navigate = useNavigate();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [links, setLinks] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState(''); // '' = 全部分类
  const [showIsolated, setShowIsolated] = useState(true);
  const [centerId, setCenterId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [js, ls] = await Promise.all([
      db.journals.filter((j) => !j.deletedAt).toArray(),
      db.documentLinks.toArray(),
    ]);
    setJournals(js);
    setLinks(ls);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subjects = useMemo(
    () => Array.from(new Set(journals.map((j) => j.subject).filter(Boolean))) as string[],
    [journals],
  );

  // 各节点的入链数（仅计入已解析、未失效的链接）
  const inDegree = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) {
      if (l.targetId && !l.broken) m.set(l.targetId, (m.get(l.targetId) ?? 0) + 1);
    }
    return m;
  }, [links]);

  const { nodes, edges, brokenCount, isolatedCount, filteredTotal } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = journals.filter((j) => {
      if (subject && j.subject !== subject) return false;
      if (q) {
        const hitTitle = (j.title || '').toLowerCase().includes(q);
        const hitAlias = (j.aliases ?? []).some((a) => a.toLowerCase().includes(q));
        if (!hitTitle && !hitAlias) return false;
      }
      return true;
    });
    const nodeSet = new Set(filtered.map((j) => j.id));

    // 仅保留两端都存在且未失效的链接作为正常边（失效链接单独统计，不入图）
    const edgeList: GraphEdge[] = [];
    for (const l of links) {
      if (l.broken || !l.targetId) continue;
      if (!nodeSet.has(l.sourceId) || !nodeSet.has(l.targetId)) continue;
      edgeList.push({ id: l.id, sourceId: l.sourceId, targetId: l.targetId, relationType: 'related', weight: 1 });
    }

    const connected = new Set<string>();
    for (const e of edgeList) {
      connected.add(e.sourceId);
      connected.add(e.targetId);
    }

    const nodeList: GraphNode[] = (showIsolated ? filtered : filtered.filter((j) => connected.has(j.id))).map((j) => ({
      id: j.id,
      label: j.title || '无标题',
      entryIds: [j.id],
      weight: inDegree.get(j.id) ?? 0,
      subject: j.subject,
    }));

    // 失效链接：来源在当前筛选范围内、且 broken
    const broken = links.filter((l) => l.broken && nodeSet.has(l.sourceId)).length;
    const isolated = filtered.filter((j) => !connected.has(j.id)).length;

    return { nodes: nodeList, edges: edgeList, brokenCount: broken, isolatedCount: isolated, filteredTotal: filtered.length };
  }, [journals, links, query, subject, showIsolated, inDegree]);

  const handleNodeClick = (node: GraphNode) => {
    // 单击：聚焦(高亮 1-hop)；若已聚焦同一节点则打开文档
    if (centerId === node.id) {
      navigate(`/edit/${node.id}`);
    } else {
      setCenterId(node.id);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">知识图谱</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {nodes.length} 个文档 · {edges.length} 条双链关联 · {isolatedCount} 个孤立 · {brokenCount} 条失效链接
          </p>
        </div>
        <button className="btn-ghost text-xs flex items-center gap-1" onClick={load} title="刷新图谱">
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </button>
      </div>

      {/* 工具条：搜索 / 分类过滤 / 孤立开关 / 聚焦清除 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          <input
            className="input-field pl-8 text-sm"
            placeholder="搜索节点（标题/别名）…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="relative">
          <ListFilter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          <select
            className="input-field pl-8 pr-7 text-sm appearance-none"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            title="按分类过滤"
          >
            <option value="">全部分类</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          className={`btn-ghost text-xs flex items-center gap-1 ${showIsolated ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]' : ''}`}
          onClick={() => setShowIsolated((v) => !v)}
          title="显示/隐藏无连接的孤立文档"
        >
          <Unlink className="h-3.5 w-3.5" /> 孤立({isolatedCount})
        </button>
        {centerId && (
          <button
            className="btn-ghost text-xs flex items-center gap-1 text-[var(--color-accent)]"
            onClick={() => setCenterId(null)}
            title="退出聚焦视图"
          >
            <Focus className="h-3.5 w-3.5" /> 取消聚焦
          </button>
        )}
      </div>

      {centerId && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          聚焦视图：高亮「{journals.find((j) => j.id === centerId)?.title ?? ''}」及其直接关联文档，再次点击该节点可打开文档。
        </p>
      )}

      <KnowledgeGraph
        nodes={nodes}
        edges={edges}
        loading={loading}
        onNodeClick={handleNodeClick}
        centerId={centerId ?? undefined}
      />

      {filteredTotal === 0 && !loading && (
        <p className="text-center text-sm text-[var(--color-text-tertiary)] py-4">没有符合条件的文档</p>
      )}
    </div>
  );
}