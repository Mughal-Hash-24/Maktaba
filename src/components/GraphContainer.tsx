/* src/components/GraphContainer.tsx */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import styles from '../styles/graph.module.css';

// Dynamically import force graph with SSR disabled (uses canvas/window)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'var(--text-secondary)'
    }}>
      Loading constellation map...
    </div>
  )
});

interface Node {
  id: string;
  title: string;
  field: string;
  linkCount: number;
}

interface Edge {
  source: string | { id: string };
  target: string | { id: string };
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

interface GraphContainerProps {
  graphData: GraphData;
}

const DOMAINS = [
  { key: 'all', label: 'All Wings', color: 'var(--color-map)' },
  { key: 'science-tech', label: 'Science & Tech', color: 'var(--color-cs)' },
  { key: 'formal-sciences', label: 'Formal Sciences', color: 'var(--color-math)' },
  { key: 'humanities-arts', label: 'Humanities & Arts', color: 'var(--color-humanities)' },
  { key: 'social-sciences', label: 'Social Sciences', color: 'var(--color-social)' },
];

export default function GraphContainer({ graphData }: GraphContainerProps) {
  const router = useRouter();
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  // Simulation parameters (interactive sliders)
  const [nodeSizeMult, setNodeSizeMult] = useState<number>(1.0);
  const [linkDistance, setLinkDistance] = useState<number>(40);
  const [repulsionStrength, setRepulsionStrength] = useState<number>(60);
  const [gravityStrength, setGravityStrength] = useState<number>(0.06);
  const [showControls, setShowControls] = useState<boolean>(false);

  // Dynamic colors resolved from CSS variables
  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>({
    'science-tech': '#e05a47',
    'formal-sciences': '#e28743',
    'humanities-arts': '#d4a373',
    'social-sciences': '#b07d62',
    'muted': '#9d8a77',
    'bg': '#15110d',
    'link': 'rgba(244, 237, 226, 0.15)',
    'text': '#f4ede2',
  });

  useEffect(() => {
    const updateColors = () => {
      if (typeof window === 'undefined') return;
      const style = window.getComputedStyle(document.documentElement);
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      setResolvedColors({
        'science-tech': style.getPropertyValue('--color-cs').trim() || '#2ab7ca',
        'formal-sciences': style.getPropertyValue('--color-math').trim() || '#e07a5f',
        'humanities-arts': style.getPropertyValue('--color-humanities').trim() || '#81b29a',
        'social-sciences': style.getPropertyValue('--color-social').trim() || '#f2cc8f',
        'muted': style.getPropertyValue('--text-muted').trim() || '#847465',
        'bg': style.getPropertyValue('--bg-primary').trim() || '#120e0b',
        'link': isLight ? 'rgba(40, 29, 18, 0.12)' : 'rgba(230, 223, 213, 0.15)',
        'text': style.getPropertyValue('--text-primary').trim() || (isLight ? '#281d12' : '#e6dfd5'),
      });
    };

    updateColors();
    window.addEventListener('themechange', updateColors);
    return () => window.removeEventListener('themechange', updateColors);
  }, []);

  // Measure container dimensions reactively
  useEffect(() => {
    if (!containerRef.current) return;

    setDimensions({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Field color resolver
  const getFieldColor = (field: string) => {
    return resolvedColors[field?.toLowerCase()] || resolvedColors['muted'];
  };

  // Field label resolver
  const getFieldLabel = (field: string) => {
    switch (field?.toLowerCase()) {
      case 'science-tech': return 'Science & Tech';
      case 'formal-sciences': return 'Formal Sciences';
      case 'humanities-arts': return 'Humanities & Arts';
      case 'social-sciences': return 'Social Sciences';
      default: return field || 'General';
    }
  };

  // Filter nodes & edges based on toggle
  const filteredData = useMemo(() => {
    if (selectedDomain === 'all') {
      return graphData;
    }
    
    const filteredNodes = graphData.nodes.filter(
      (node) => node.field.toLowerCase() === selectedDomain.toLowerCase()
    );
    
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    
    const filteredEdges = graphData.edges.filter((edge) => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }, [graphData, selectedDomain]);

  // Setup forces once the graph engine is ready or dimensions/data changes
  const configureForces = (
    fg: any,
    width: number,
    height: number,
    linkDist: number,
    repulsion: number,
    gravity: number
  ) => {
    if (!fg) return;

    // Center force coordinates
    const centerForce = fg.d3Force('center');
    if (centerForce) {
      centerForce.x(width / 2).y(height / 2);
    }

    // Charge strength (repulsion)
    const chargeForce = fg.d3Force('charge');
    if (chargeForce) {
      chargeForce.strength(-repulsion);
    }

    // Link distance
    const linkForce = fg.d3Force('link');
    if (linkForce) {
      linkForce.distance(linkDist);
    }

    // Custom gravity towards center for all nodes (including disconnected ones)
    const customGravity = () => {
      let nodes: any[] = [];
      const force = (alpha: number) => {
        const cx = width / 2;
        const cy = height / 2;
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          node.vx += (cx - node.x) * gravity * alpha;
          node.vy += (cy - node.y) * gravity * alpha;
        }
      };
      force.initialize = (initNodes: any[]) => {
        nodes = initNodes;
      };
      return force;
    };
    fg.d3Force('custom-gravity', customGravity());

    fg.d3ReheatSimulation();
  };

  useEffect(() => {
    if (graphRef.current) {
      configureForces(
        graphRef.current,
        dimensions.width,
        dimensions.height,
        linkDistance,
        repulsionStrength,
        gravityStrength
      );
    }
  }, [dimensions, selectedDomain, linkDistance, repulsionStrength, gravityStrength]);

  // Fallback timer to initialize/reheat forces after mounting/rendering settles
  useEffect(() => {
    const timer = setTimeout(() => {
      if (graphRef.current) {
        configureForces(
          graphRef.current,
          dimensions.width,
          dimensions.height,
          linkDistance,
          repulsionStrength,
          gravityStrength
        );
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [dimensions.width, dimensions.height, linkDistance, repulsionStrength, gravityStrength]);

  const handleNodeClick = (node: any) => {
    router.push(`/notes/${node.id}`);
  };

  const handleNodeHover = (node: any) => {
    setHoveredNode(node || null);
  };

  // Track mouse position for custom tooltip inside wrapper
  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left + 15,
        y: e.clientY - rect.top + 15,
      });
    }
  };

  return (
    <div className={styles.container} onMouseMove={handleMouseMove}>
      <div className={styles.graphHeader}>
        <h1 className={styles.title}>Knowledge Constellation</h1>
        
        {/* Domain Selection Buttons */}
        <div className={styles.controls}>
          {DOMAINS.map((domain) => {
            const isActive = selectedDomain === domain.key;
            return (
              <button
                key={domain.key}
                onClick={() => setSelectedDomain(domain.key)}
                className={`${styles.filterBtn} ${isActive ? styles.filterBtnActive : ''}`}
                style={{
                  borderColor: isActive ? domain.color : 'var(--border-color)',
                  color: isActive ? domain.color : 'var(--text-secondary)'
                }}
              >
                {domain.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Graph Visualizer Canvas */}
      <div ref={containerRef} className={styles.canvasWrapper}>
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={{
            nodes: filteredData.nodes,
            links: filteredData.edges as any
          }}
          backgroundColor={resolvedColors['bg']}
          
          // Physics tuning for Night Sky Constellation
          d3AlphaDecay={0.05} // Cool down quickly
          cooldownTicks={100} // Stop simulation after 100 ticks
          
          // Nodes
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = node.title;
            const radius = (Math.log(node.linkCount + 2) * 1.5 + 2.5) * nodeSizeMult;
            const color = getFieldColor(node.field);
            const isHighlyConnected = node.linkCount >= 6; // Glow threshold

            // Glow effect
            if (isHighlyConnected) {
              ctx.shadowColor = color;
              ctx.shadowBlur = 16 / globalScale;
            } else {
              ctx.shadowBlur = 0;
            }

            // Outer ring
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fill();

            // Inner core for glow nodes
            if (isHighlyConnected) {
              ctx.shadowBlur = 0;
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius * 0.4, 0, 2 * Math.PI, false);
              ctx.fill();
            }

            // Labels visible on zoom
            if (globalScale > 1.2) {
              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px var(--font-newsreader), Georgia, serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = resolvedColors['text'];
              ctx.shadowBlur = 0;
              ctx.fillText(label, node.x, node.y + radius + 4 / globalScale);
            }
          }}
          
          // Edges
          linkColor={() => resolvedColors['link']}
          linkWidth={1}
          
          // Interactions
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          enableNodeDrag={true}
          onNodeDragEnd={() => {
            // Re-cool simulation after dragging
            if (graphRef.current) {
              graphRef.current.d3AlphaDecay(0.05);
            }
          }}
        />

        {/* Settings Collapsible Panel */}
        <div className={`${styles.settingsPanel} ${!showControls ? styles.settingsPanelClosed : ''}`}>
          <button
            onClick={() => setShowControls(!showControls)}
            className={`${styles.settingsToggle} ${showControls ? styles.settingsToggleActive : ''}`}
            aria-label="Toggle Physics Controls"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>{showControls ? 'Physics Controls' : ''}</span>
          </button>

          {showControls && (
            <div className={styles.settingsContent}>
              {/* Slider 1: Node Size */}
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>
                  <span>Node Size</span>
                  <span className={styles.settingValue}>{nodeSizeMult.toFixed(1)}x</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={nodeSizeMult}
                  onChange={(e) => setNodeSizeMult(parseFloat(e.target.value))}
                  className={styles.settingSlider}
                />
              </div>

              {/* Slider 2: Proximity/Link Distance */}
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>
                  <span>Link Distance</span>
                  <span className={styles.settingValue}>{linkDistance}px</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="150"
                  step="5"
                  value={linkDistance}
                  onChange={(e) => setLinkDistance(parseInt(e.target.value))}
                  className={styles.settingSlider}
                />
              </div>

              {/* Slider 3: Repulsion (Charge) */}
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>
                  <span>Repulsion</span>
                  <span className={styles.settingValue}>{repulsionStrength}</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={repulsionStrength}
                  onChange={(e) => setRepulsionStrength(parseInt(e.target.value))}
                  className={styles.settingSlider}
                />
              </div>

              {/* Slider 4: Center Gravity */}
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>
                  <span>Center Gravity</span>
                  <span className={styles.settingValue}>{gravityStrength.toFixed(3)}</span>
                </label>
                <input
                  type="range"
                  min="0.00"
                  max="0.20"
                  step="0.01"
                  value={gravityStrength}
                  onChange={(e) => setGravityStrength(parseFloat(e.target.value))}
                  className={styles.settingSlider}
                />
              </div>
            </div>
          )}
        </div>

        {/* Custom HTML Tooltip */}
        {hoveredNode && (
          <div
            className={styles.tooltip}
            style={{
              display: 'block',
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              borderLeft: `3px solid ${getFieldColor(hoveredNode.field)}`
            }}
          >
            <div className={styles.tooltipTitle}>{hoveredNode.title}</div>
            <div
              className={styles.tooltipDomain}
              style={{ color: getFieldColor(hoveredNode.field) }}
            >
              {getFieldLabel(hoveredNode.field)} • {hoveredNode.linkCount} links
            </div>
          </div>
        )}

        {/* Legend Overlay */}
        <div className={styles.legend}>
          {DOMAINS.filter(d => d.key !== 'all').map((d) => (
            <div key={d.key} className={styles.legendItem}>
              <span className={styles.legendColor} style={{ backgroundColor: d.color }} />
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
