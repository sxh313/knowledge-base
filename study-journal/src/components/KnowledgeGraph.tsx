import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  entryIds: string[];
}

interface GraphEdge {
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
}

export default function KnowledgeGraph({
  nodes, edges, loading = false,
  width = 800, height = 500, onNodeClick,
}: KnowledgeGraphProps) {
  const positioned = useMemo(() => {
    const cx = width / 2, cy = height / 2;
    const r = Math.min(cx, cy) - 60;
    return nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      return { ...node, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
  }, [nodes, width, height]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  }
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-text-secondary)]">
        <Loader2 className="h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">知识图谱为空</p>
        <p className="text-sm">创建日记时使用 AI 自动提取概念即可构建知识图谱</p>
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
          return (
            <line key={edge.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="var(--color-border)" strokeWidth={Math.max(1, edge.weight * 2)}
              strokeDasharray={edge.relationType === 'prerequisite' ? '4,4' : 'none'} opacity={0.6} />
          );
        })}
        {positioned.map(node => (
          <g key={node.id} className="cursor-pointer" onClick={() => onNodeClick?.(node)}>
            <circle cx={node.x} cy={node.y} r={28}
              fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth={2}
              className="hover:stroke-brand-500 transition-colors" />
            <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle"
              className="fill-current text-[var(--color-text)]" fontSize="10" fontWeight={500}>
              {node.label.length > 6 ? node.label.slice(0, 6) + '…' : node.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0 border-t-2 border-gray-400" /> 关联
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0 border-t-2 border-dashed border-gray-400" /> 前置依赖
        </span>
      </div>
    </div>
  );
}