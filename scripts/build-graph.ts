import type { NoteFull, GraphData, GraphNode, GraphEdge } from './types.js';

// Helper to determine which wing a subject tag belongs to
const getSubjectWing = (subjectTag: string): string => {
  const name = (subjectTag.split('/')[1] || '').toLowerCase();
  
  const formal = ['math', 'discrete', 'linear-algebra', 'statistics', 'logic'];
  const social = ['economics', 'psychology', 'cognitive-science', 'pak-studies', 'history', 'russia', 'law'];
  const humanities = ['philosophy', 'fiqh', 'literature', 'music'];
  
  if (formal.some(s => name.includes(s))) return 'formal-sciences';
  if (social.some(s => name.includes(s))) return 'social-sciences';
  if (humanities.some(s => name.includes(s))) return 'humanities-arts';
  
  return 'science-tech';
};

/**
 * Build the graph data structure for the Night Sky visualizer.
 *
 * Rules:
 *  - One node per public note, colored by field/
 *  - One edge per unique resolved link between two public notes (deduplicated)
 *  - linkCount reflects total degree (incoming + outgoing connections)
 */
export function buildGraphData(notes: NoteFull[]): GraphData {
  const slugSet = new Set(notes.map((n) => n.slug));
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>(); // canonical "smaller::larger" string to deduplicate
  const edges: GraphEdge[] = [];

  // Initialize one node per note
  for (const note of notes) {
    const subjectTag = note.tags.find((t) => t.startsWith('subject/'));
    const wing = subjectTag ? getSubjectWing(subjectTag) : 'science-tech';
    nodeMap.set(note.slug, {
      id: note.slug,
      title: note.title,
      field: wing,
      linkCount: 0,
    });
  }

  // Build edges from backlinks (backlinks already encode all resolved outgoing links)
  for (const note of notes) {
    for (const backlink of note.backlinks) {
      const source = backlink.slug;
      const target = note.slug;

      // Both endpoints must be public notes
      if (!slugSet.has(source) || !slugSet.has(target)) continue;

      // Canonical edge representation (lexicographic order) to deduplicate A→B and B→A
      const canonical = source < target ? `${source}::${target}` : `${target}::${source}`;
      if (edgeSet.has(canonical)) continue;
      edgeSet.add(canonical);

      edges.push({ source, target });

      // Increment degree on both endpoints
      const srcNode = nodeMap.get(source);
      const tgtNode = nodeMap.get(target);
      if (srcNode) srcNode.linkCount++;
      if (tgtNode) tgtNode.linkCount++;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}
