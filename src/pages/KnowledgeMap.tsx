import { useEffect, useState } from 'react';
import { db, type KnowledgeNode, type KnowledgeEdge } from '../lib/db/schema';
import { Loader2, Search } from 'lucide-react';
import KnowledgeGraph from '../components/KnowledgeGraph';

export default function KnowledgeMap() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadGraph(); }, []);

  async function loadGraph() {
    setLoading(true);
    const [allNodes, allEdges] = await Promise.all([
      db.graphNodes.toArray(),
      db.graphEdges.toArray(),
    ]);
    setNodes(allNodes);
    setEdges(allEdges);
    setLoading(false);
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">知识图谱</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {nodes.length} 个概念 · {edges.length} 条关联
          </p>
        </div>
      </div>

      <KnowledgeGraph
        nodes={nodes}
        edges={edges}
        loading={loading}
        onNodeClick={(node) => console.log('clicked:', node)}
      />
    </div>
  );
}