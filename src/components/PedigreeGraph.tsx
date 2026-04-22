"use client";

import React, { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface Profile {
  id: string;
  name: string;
  relationship: string;
}

const getRelationIcon = (rel: string) => {
  const icons: Record<string, string> = {
    self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫",
    friend: "🤝", colleague: "💼", other: "👤",
  };
  return icons[rel] || "👤";
};

const CustomNode = ({ data }: { data: { label: string, rel: string } }) => {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      padding: '10px 15px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: 'var(--text-primary)',
      minWidth: '120px',
      boxShadow: 'var(--shadow-md)',
    }}>
      <Handle type="target" position={Position.Top} />
      <span style={{ fontSize: '1.2rem' }}>{getRelationIcon(data.rel)}</span>
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{data.label}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{data.rel}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

export default function PedigreeGraph({ profiles }: { profiles: Profile[] }) {
  const { nodes, edges } = useMemo(() => {
    const parentNodes: Node[] = [];
    const siblingNodes: Node[] = [];
    const spouseNodes: Node[] = [];
    const childrenNodes: Node[] = [];
    const friendNodes: Node[] = [];
    let selfNode: Node | null = null;

    // Is there a self node?
    const selfExists = profiles.find(p => p.relationship === 'self');
    if (selfExists) {
      selfNode = {
        id: selfExists.id,
        type: 'custom',
        position: { x: 400, y: 300 },
        data: { label: selfExists.name, rel: 'self' },
      };
    } else {
      selfNode = {
        id: 'self',
        type: 'custom',
        position: { x: 400, y: 300 },
        data: { label: 'You', rel: 'self' },
      };
    }

    profiles.forEach(p => {
      if (p.relationship === 'self') return; // already handled
      
      const node: Node = {
        id: p.id,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: p.name, rel: p.relationship },
      };
      
      switch(p.relationship) {
        case 'parent': parentNodes.push(node); break;
        case 'spouse': spouseNodes.push(node); break;
        case 'sibling': siblingNodes.push(node); break;
        case 'child': childrenNodes.push(node); break;
        default: friendNodes.push(node); break; // friends, colleagues, other
      }
    });

    const finalNodes: Node[] = [selfNode];
    const finalEdges: Edge[] = [];

    const ROOT_X = 400;
    const ROOT_Y = 300;
    
    // Position parents above
    parentNodes.forEach((node, i) => {
      node.position = { x: ROOT_X - 100 + (i * 200), y: ROOT_Y - 150 };
      finalNodes.push(node);
      finalEdges.push({ id: `e-${node.id}-self`, source: node.id, target: selfNode!.id, type: 'smoothstep' });
    });

    // Position siblings beside
    siblingNodes.forEach((node, i) => {
      node.position = { x: ROOT_X - 250 - (i * 150), y: ROOT_Y };
      finalNodes.push(node);
      finalEdges.push({ id: `e-self-${node.id}`, source: selfNode!.id, target: node.id, type: 'straight', animated: true });
    });

    // Position spouses beside right
    spouseNodes.forEach((node, i) => {
      node.position = { x: ROOT_X + 250 + (i * 150), y: ROOT_Y };
      finalNodes.push(node);
      finalEdges.push({ id: `e-self-${node.id}`, source: selfNode!.id, target: node.id, type: 'straight', style: { stroke: 'var(--accent-primary)', strokeWidth: 2 } });
    });

    // Position children below
    childrenNodes.forEach((node, i) => {
      node.position = { x: ROOT_X - 100 + (i * 200), y: ROOT_Y + 150 };
      finalNodes.push(node);
      finalEdges.push({ id: `e-self-${node.id}`, source: selfNode!.id, target: node.id, type: 'smoothstep' });
    });

    // Position friends / colleagues far below
    friendNodes.forEach((node, i) => {
      node.position = { x: ROOT_X - 150 + (i * 150), y: ROOT_Y + 300 };
      finalNodes.push(node);
      finalEdges.push({ id: `e-self-${node.id}`, source: selfNode!.id, target: node.id, type: 'bezier', animated: true, style: { stroke: 'var(--text-muted)' } });
    });

    return { nodes: finalNodes, edges: finalEdges };
  }, [profiles]);

  return (
    <div style={{ width: '100%', height: '500px', background: 'var(--bg-deep)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
