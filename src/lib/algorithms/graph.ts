// ──── Graph Algorithms ────
// Simple graph operations for knowledge graph analysis

import { type KnowledgeNode, type KnowledgeEdge } from '../db/schema';

export interface GraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

/**
 * Find all prerequisite relationships — which concepts must be learned first
 */
export function findPrerequisites(
  graph: GraphData,
  nodeId: string,
): KnowledgeNode[] {
  const visited = new Set<string>();
  const result: KnowledgeNode[] = [];

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const prereqs = graph.edges.filter(
      e => e.targetId === id && e.relationType === 'prerequisite',
    );
    for (const edge of prereqs) {
      const node = graph.nodes.find(n => n.id === edge.sourceId);
      if (node) {
        result.push(node);
        walk(node.id);
      }
    }
  }

  walk(nodeId);
  return result;
}

/**
 * Detect knowledge gaps: concepts that are prerequisites but have no entries
 */
export function findKnowledgeGaps(
  graph: GraphData,
): KnowledgeNode[] {
  return graph.nodes.filter(
    node => node.entryIds.length === 0,
  );
}

/**
 * Build a learning path from foundational to advanced
 * Topological sort based on prerequisite edges
 */
export function buildLearningPath(graph: GraphData): KnowledgeNode[] {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of graph.nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    if (edge.relationType === 'prerequisite') {
      adj.get(edge.sourceId)?.push(edge.targetId);
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: KnowledgeNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = graph.nodes.find(n => n.id === id);
    if (node) sorted.push(node);

    for (const neighbor of adj.get(id) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

/**
 * Get related concepts (connected through edges)
 */
export function findRelatedConcepts(
  graph: GraphData,
  nodeId: string,
  maxDepth = 1,
): KnowledgeNode[] {
  const visited = new Set<string>([nodeId]);
  const result: KnowledgeNode[] = [];
  let currentLayer = [nodeId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLayer: string[] = [];

    for (const id of currentLayer) {
      const connected = graph.edges
        .filter(e => e.sourceId === id || e.targetId === id)
        .map(e => (e.sourceId === id ? e.targetId : e.sourceId));

      for (const neighborId of connected) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          const node = graph.nodes.find(n => n.id === neighborId);
          if (node) {
            result.push(node);
            nextLayer.push(neighborId);
          }
        }
      }
    }

    currentLayer = nextLayer;
  }

  return result;
}