
import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import { useStore } from '../store';
import { COLORS, COMMUNITY_COLORS } from '../constants';
import { NodeData } from '../types';

// Register the Cola extension
cytoscape.use(cola);

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const { filteredGraph, activeCommunityColoring, selectedNodeIds, toggleNodeSelection, clearSelection } = useStore();

  useEffect(() => {
    if (!containerRef.current) return;

    cyRef.current = cytoscape({
      container: containerRef.current,
      selectionType: 'additive',
      boxSelectionEnabled: true,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': '12px',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-background-opacity': 0.7,
            'text-background-color': '#000',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'border-color': '#fff',
            'border-width': 1,
          }
        },
        {
          selector: 'edge',
          style: {
            // Dynamic width based on weight (default 1.5 if undefined)
            'width': (ele: any) => {
              const weight = ele.data('weight');
              // Scale: 0.1->1.2px, 1.0->3px, 2.0->5px
              return weight ? Math.max(1, 1 + (weight * 2)) : 1.5;
            },
            // Triadic Balance Coloring
            'line-color': (ele) => ele.data('sign') === 'negative' ? '#ef4444' : '#10b981', 
            'target-arrow-color': (ele) => ele.data('sign') === 'negative' ? '#ef4444' : '#10b981',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            // Dynamic opacity based on weight
            'opacity': (ele: any) => {
               const weight = ele.data('weight');
               // Range: 0.4 to 1.0 based on weight
               return weight ? Math.min(1, 0.4 + (weight * 0.6)) : 0.6;
            }
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 3,
            'border-color': '#facc15', // yellow-400
            'background-color': '#facc15'
          }
        }
      ],
      wheelSensitivity: 0.2,
    });

    const cy = cyRef.current;

    cy.on('tap', 'node', (evt) => {
      // Handle multi-select with shift/ctrl check if needed, 
      // but here we rely on box selection or click toggling if simple.
      // Let's assume standard click = select single, shift+click = toggle (handled by cytoscape mostly)
      // We'll sync with store.
      const node = evt.target;
      const isMulti = evt.originalEvent.shiftKey || evt.originalEvent.ctrlKey;
      toggleNodeSelection(node.id(), isMulti);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        clearSelection();
      }
    });

    // Sync box selection events
    cy.on('boxselect', 'node', (evt) => {
      toggleNodeSelection(evt.target.id(), true);
    });

    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
  }, []);

  // Sync Graph Data
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.batch(() => {
      // Smart diffing or full redraw? For stability in this demo, full redraw but preserve positions if possible.
      const currentNodes = new Set(cy.nodes().map(n => n.id()));
      
      const newNodes = filteredGraph.nodes.map(n => ({
        group: 'nodes',
        data: n.data,
        position: n.position
      }));
      const newEdges = filteredGraph.edges.map(e => ({
        group: 'edges',
        data: e.data
      }));

      // Simple brute force update for demo stability
      cy.elements().remove();
      cy.add([...newNodes, ...newEdges] as any);
    });

    // Run Cola Layout
    cy.layout({
      name: 'cola',
      animate: true,
      refresh: 2, // number of ticks per frame; higher is faster but jerkier
      maxSimulationTime: 3000,
      ungrabifyWhileSimulating: false,
      fit: true,
      padding: 30,
      randomize: false, // keep existing positions if available
      nodeSpacing: (node: any) => {
        // give important nodes more space
        const importance = node.data('importance') || 0.5;
        return 20 + (importance * 20);
      },
      edgeLength: (edge: any) => {
        // Lighter edges are longer, heavier edges pull tighter
        const weight = edge.data('weight') || 0.5;
        return 150 - (weight * 50); 
      },
      nodeDimensionsIncludeLabels: true,
      gravity: 0.5, // gravity to center
      friction: 0.5,
    } as any).run();

  }, [filteredGraph]);

  // Sync Selection from Store to Graph
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.batch(() => {
      cy.nodes().unselect();
      selectedNodeIds.forEach(id => {
        cy.$id(id).select();
      });
    });
  }, [selectedNodeIds]);

  // Update Styling
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.batch(() => {
      cy.nodes().forEach(ele => {
        const data = ele.data() as NodeData;
        const baseSize = 20;
        
        // Use 'importance' (0-1 range) for size
        // Default to 0.5 if missing
        const importance = typeof data.importance === 'number' ? data.importance : 0.5;
        const size = baseSize + (importance * 40); 
        
        ele.style('width', size);
        ele.style('height', size);

        let color = '#9ca3af';
        if (activeCommunityColoring && data.community !== undefined) {
          color = COMMUNITY_COLORS[data.community % COMMUNITY_COLORS.length];
        } else {
          color = COLORS[data.type] || color;
        }
        ele.style('background-color', color);
      });
    });

  }, [filteredGraph, activeCommunityColoring]);

  return (
    <div className="w-full h-full bg-zinc-950 relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="text-zinc-500 text-xs font-mono bg-black/50 p-1 rounded">
          Nodes: {filteredGraph.nodes.length} | Edges: {filteredGraph.edges.length} | 
          Global Balance: {((filteredGraph.meta?.globalBalance || 1) * 100).toFixed(1)}%
        </div>
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
