import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';

export interface GraphNode {
  id: string;
  label: string;
  entryIds: string[];
  /** 入链数（用于节点大小） */
  weight?: number;
  subject?: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'prerequisite' | 'related' | 'extends' | 'example';
  weight: number;
}

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading?: boolean;
  width?: number;
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
  /** 聚焦节点 id：高亮该节点与其 1-hop 邻居，其余淡化（用于"当前文档关系"视图） */
  centerId?: string;
}

/** 由入链数计算节点半径（夹在 16~40 之间） */
function radiusOf(weight = 0): number {
  return Math.max(16, Math.min(40, 16 + weight * 2.2));
}

export default function KnowledgeGraph({
  nodes, edges, loading = false,
  width = 800, height = 500, onNodeClick, centerId,
}: KnowledgeGraphProps) {
  const positioned = useMemo(() => {
    const cx = width / 2, cy = height / 2;
    const r = Math.min(cx, cy) - 60;
    const n = nodes.length;
    return nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      const radius = n <= 1 ? 0 : r;
      return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
  }, [nodes, width, height]);

  // 聚焦模式：计算 center 的 1-hop 邻居集合
  const focusSet = useMemo(() => {
    if (!centerId) return null;
    const set = new Set<string>([centerId]);
    for (const e of edges) {
      if (e.sourceId === centerId) set.add(e.targetId);
      if (e.targetId === centerId) set.add(e.sourceId);
    }
    return set;
  }, [centerId, edges]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  }
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-text-secondary)]">
        <Loader2 className="h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">知识图谱为空</p>
        <p className="text-sm">在文档中使用 <code className="px-1 rounded bg-[var(--color-surface-2)]">[[双链]]</code> 引用其它文档即可建立关联</p>
      </div>
    );
  }

  return (
    <div className="card p-4 overflow-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {edges.map(edge => {
          const s = positioned.find(n => n.id === edge.sourceId);
          const t = positioned.find(n => n.id === edge.targetId);
          if (!s || !t) return null;
          const dimmed = focusSet && !(focusSet.has(edge.sourceId) && focusSet.has(edge.targetId));
          return (
            <line key={edge.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="var(--color-border)" strokeWidth={Math.max(1, edge.weight * 2)}
              strokeDasharray={edge.relationType === 'prerequisite' ? '4,4' : 'none'}
              opacity={dimmed ? 0.12 : 0.6} />
          );
        })}
        {positioned.map(node => {
          const radius = radiusOf(node.weight);
          const isCenter = centerId === node.id;
          const dimmed = focusSet && !focusSet.has(node.id);
          return (
            <g key={node.id} className="cursor-pointer" onClick={() => onNodeClick?.(node)} opacity={dimmed ? 0.2 : 1}>
              <circle cx={node.x} cy={node.y} r={radius}
                fill={isCenter ? 'var(--color-primary)' : 'var(--color-surface)'}
                stroke={isCenter ? 'var(--color-accent)' : 'var(--color-primary)'}
                strokeWidth={isCenter ? 3 : 2}
                className="hover:stroke-brand-500 transition-colors" />
              <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle"
                className="fill-current text-[var(--color-text)]" fontSize={radius > 28 ? 11 : 10} fontWeight={500}
                style={{ fill: isCenter ? '#fff' : undefined }}>
                {node.label.length > 6 ? node.label.slice(0, 6) + '…' : node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0 border-t-2 border-gray-400" /> 双链关联
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[var(--color-primary)]" /> 聚焦点
        </span>
        <span className="flex items-center gap-1">节点大小 = 入链数</span>
      </div>
    </div>
  );
}