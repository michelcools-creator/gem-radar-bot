import React, { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CheckCircle, Clock, AlertCircle, Search, FileText, Brain, Calculator, Trophy, Plus, Link, Download, BarChart3, CircleDot } from 'lucide-react';

interface AnalysisPipelineFlowProps {
  coinData: {
    status: string;
    official_links?: any;
    pages?: Array<{ status: string }>;
    facts?: Array<any>;
    scores?: Array<any>;
    deep_analysis?: Array<any>;
  };
}

const AnalysisPipelineFlow: React.FC<AnalysisPipelineFlowProps> = ({ coinData }) => {
  // Determine pipeline stage based on coin data
  const getCurrentStage = () => {
    if (coinData.status === 'analyzed' && coinData.deep_analysis?.length > 0) return 7;
    if (coinData.status === 'deep_analysis_pending' && coinData.scores?.length > 0) return 6;
    if (coinData.scores?.length > 0) return 5;
    if (coinData.facts?.length > 0) return 4;
    if (coinData.pages?.some(p => p.status === 'fetched')) return 3;
    if (coinData.official_links && Object.keys(coinData.official_links || {}).length > 0) return 2;
    return 1;
  };

  const currentStage = getCurrentStage();

  const getNodeStyle = (stageNumber: number) => {
    if (stageNumber < currentStage) {
      return {
        background: '#22c55e',
        color: 'white',
        border: '2px solid #16a34a',
      };
    } else if (stageNumber === currentStage) {
      return {
        background: '#3b82f6',
        color: 'white',
        border: '2px solid #2563eb',
        animation: 'pulse 2s ease-in-out infinite',
      };
    } else {
      return {
        background: '#f3f4f6',
        color: '#6b7280',
        border: '2px solid #d1d5db',
      };
    }
  };

  const getNodeIcon = (stageNumber: number) => {
    if (stageNumber < currentStage) {
      return <CheckCircle className="w-5 h-5" />;
    } else if (stageNumber === currentStage) {
      return <Clock className="w-5 h-5" />;
    } else {
      return <AlertCircle className="w-5 h-5 opacity-50" />;
    }
  };

  const getStageIcon = (stageNumber: number) => {
    const icons = {
      1: <Plus className="w-4 h-4" />,
      2: <Link className="w-4 h-4" />,
      3: <Download className="w-4 h-4" />,
      4: <Brain className="w-4 h-4" />,
      5: <BarChart3 className="w-4 h-4" />,
      6: <Search className="w-4 h-4" />,
      7: <CheckCircle className="w-4 h-4" />,
    };
    return icons[stageNumber as keyof typeof icons];
  };

  const initialNodes: Node[] = [
    {
      id: '1',
      type: 'default',
      position: { x: 50, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(1)}
              <span className="text-sm font-medium">Coin Added</span>
            </div>
            {getNodeIcon(1)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(1),
        minWidth: 120,
        borderRadius: 12,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: '2',
      type: 'default',
      position: { x: 220, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(2)}
              <span className="text-sm font-medium">Links Resolved</span>
            </div>
            {getNodeIcon(2)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(2),
        minWidth: 120,
        borderRadius: 12,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: '3',
      type: 'default',
      position: { x: 390, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(3)}
              <span className="text-sm font-medium">Pages Fetched</span>
            </div>
            {getNodeIcon(3)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(3),
        minWidth: 120,
        borderRadius: 12,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: '4',
      type: 'default',
      position: { x: 560, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(4)}
              <span className="text-sm font-medium">Facts Extracted</span>
            </div>
            {getNodeIcon(4)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(4),
        minWidth: 120,
        borderRadius: 12,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: '5',
      type: 'default',
      position: { x: 730, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(5)}
              <span className="text-sm font-medium">Scores Calculated</span>
            </div>
            {getNodeIcon(5)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(5),
        minWidth: 120,
        borderRadius: 12,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: '6',
      type: 'default',
      position: { x: 900, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(6)}
              <span className="text-sm font-medium">Deep Analysis</span>
            </div>
            {getNodeIcon(6)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(6),
        minWidth: 120,
        borderRadius: 12,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: '7',
      type: 'default',
      position: { x: 1070, y: 100 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-2">
              {getStageIcon(7)}
              <span className="text-sm font-medium">Complete</span>
            </div>
            {getNodeIcon(7)}
          </div>
        ),
      },
      style: {
        ...getNodeStyle(7),
        minWidth: 120,
        borderRadius: 12,
      },
      targetPosition: Position.Left,
    },
  ];

  const initialEdges: Edge[] = [
    {
      id: 'e1-2',
      source: '1',
      target: '2',
      type: 'smoothstep',
      animated: currentStage === 2,
      style: { stroke: currentStage > 1 ? '#22c55e' : '#d1d5db', strokeWidth: 3 },
    },
    {
      id: 'e2-3',
      source: '2',
      target: '3',
      type: 'smoothstep',
      animated: currentStage === 3,
      style: { stroke: currentStage > 2 ? '#22c55e' : '#d1d5db', strokeWidth: 3 },
    },
    {
      id: 'e3-4',
      source: '3',
      target: '4',
      type: 'smoothstep',
      animated: currentStage === 4,
      style: { stroke: currentStage > 3 ? '#22c55e' : '#d1d5db', strokeWidth: 3 },
    },
    {
      id: 'e4-5',
      source: '4',
      target: '5',
      type: 'smoothstep',
      animated: currentStage === 5,
      style: { stroke: currentStage > 4 ? '#22c55e' : '#d1d5db', strokeWidth: 3 },
    },
    {
      id: 'e5-6',
      source: '5',
      target: '6',
      type: 'smoothstep',
      animated: currentStage === 6,
      style: { stroke: currentStage > 5 ? '#22c55e' : '#d1d5db', strokeWidth: 3 },
    },
    {
      id: 'e6-7',
      source: '6',
      target: '7',
      type: 'smoothstep',
      animated: currentStage === 7,
      style: { stroke: currentStage > 6 ? '#22c55e' : '#d1d5db', strokeWidth: 3 },
    },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when coinData changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [coinData, currentStage]);

  return (
    <div className="w-full h-64 bg-gray-50 rounded-lg border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-left"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
      >
        <Background />
        <style>
          {`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.7; }
            }
          `}
        </style>
      </ReactFlow>
    </div>
  );
};

export default AnalysisPipelineFlow;