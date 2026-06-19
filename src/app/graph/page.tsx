/* src/app/graph/page.tsx */
import { readJsonFile, GraphData } from '../../lib/notes';
import GraphContainer from '../../components/GraphContainer';

export const metadata = {
  title: 'Knowledge Graph Map — Maktaba',
  description: 'Interactive force-directed graph visualizer mapping connections across the personal library.',
};

export default async function GraphPage() {
  // Fetch pre-built graph node and edge list
  const graphData = await readJsonFile<GraphData>('graph.json');

  if (!graphData) {
    return (
      <div style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
        <h2>Graph map data not found</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
          Please make sure the content build pipeline has run: <code>npm run build:content</code>
        </p>
      </div>
    );
  }

  return <GraphContainer graphData={graphData} />;
}
export const dynamic = 'force-static';
