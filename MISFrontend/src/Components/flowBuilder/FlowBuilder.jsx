import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toast } from '../../Components';
import FlowNodeCard from './nodes/FlowNodeCard';
import { createFlow, deleteFlow, getFlows, updateFlow } from '../../services/flowService';

const NODE_LIBRARY = [
  { type: 'text', label: 'Text Message' },
  { type: 'delay', label: 'Delay' },
  { type: 'condition', label: 'Options / Branch' },
  { type: 'end', label: 'End' },
];

const NODE_DEFAULTS = {
  text: { label: 'Text Message', message: 'Hi! Welcome to Sanju Sk Digital 👋', delay: 0, options: [] },
  delay: { label: 'Delay', message: '', delay: 2, options: [] },
  condition: { label: 'Options / Branch', message: 'Please choose an option', delay: 0, keyword: '', options: ['yes', 'no'] },
  end: { label: 'End', message: 'Thanks! Conversation completed.', delay: 0, options: [] },
};

const deriveEdgesFromFlow = (flow) => {
  const explicitEdges = Array.isArray(flow.edges) ? flow.edges : [];
  if (explicitEdges.length > 0) {
    return explicitEdges.map((edge) => ({
      id: edge.id || crypto.randomUUID(),
      source: edge.source,
      target: edge.target,
    }));
  }

  const derived = [];
  (flow.nodes || []).forEach((node) => {
    if (node.nextNodeId) {
      derived.push({ id: `${node.id}-${node.nextNodeId}`, source: node.id, target: node.nextNodeId });
    }

    const options = Array.isArray(node.options) ? node.options : Array.isArray(node.buttons) ? node.buttons : [];
    options.forEach((option, index) => {
      if (option?.nextNodeId) {
        derived.push({ id: `${node.id}-${option.nextNodeId}-${index}`, source: node.id, target: option.nextNodeId });
      }
    });
  });

  return derived;
};

const normalizeFlows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.flows)) return payload.flows;
  return [];
};

const mapBackendNodeToCanvasType = (node) => {
  if (node?.type === 'button') return 'condition';
  return node?.type || 'text';
};

const mapFlowToCanvas = (flow) => ({
  id: flow.id || flow._id,
  name: flow.name || 'Untitled flow',
  triggerKeywords: flow.triggerKeywords || [],
  isActive: Boolean(flow.isActive),
  nodes: (flow.nodes || []).map((node, index) => {
    const canvasType = mapBackendNodeToCanvasType(node);
    const nodeDefaults = NODE_DEFAULTS[canvasType] || NODE_DEFAULTS.text;
    const optionLabels = Array.isArray(node.options)
      ? node.options.map((item) => item?.label).filter(Boolean)
      : Array.isArray(node.buttons)
      ? node.buttons.map((item) => item?.label).filter(Boolean)
      : [];

    return {
      id: node.id || crypto.randomUUID(),
      type: canvasType,
      position: node.position || { x: 80 + index * 70, y: 120 + index * 60 },
      data: {
        ...nodeDefaults,
        label: node?.data?.label || node.label || nodeDefaults.label || 'Node',
        message: node?.message || node?.data?.message || nodeDefaults.message || '',
        delay: Number(node?.delayMs || 0) / 1000,
        keyword: node?.data?.keyword || '',
        options: optionLabels.length ? optionLabels : nodeDefaults.options,
      },
    };
  }),
  edges: deriveEdgesFromFlow(flow),
});

const getOutgoingEdges = (edges, nodeId) => edges.filter((edge) => edge.source === nodeId);

const mapCanvasToPayload = ({ flowName, triggerKeywords, nodes, edges, isActive }) => {
  const nodeIdsWithIncomingEdges = new Set(edges.map((edge) => edge.target));

  return {
    name: flowName,
    triggerKeywords,
    isActive,
    nodes: nodes.map((node, index) => {
      const outgoingEdges = getOutgoingEdges(edges, node.id);
      const isStart = !nodeIdsWithIncomingEdges.has(node.id) || index === 0;

      if (node.type === 'condition') {
        return {
          id: node.id,
          type: 'button',
          position: node.position,
          message: node.data?.message || 'Please choose an option',
          options: (Array.isArray(node.data?.options) ? node.data.options : []).map((label, optionIndex) => ({
            label,
            value: label,
            nextNodeId: outgoingEdges[optionIndex]?.target || null,
          })),
          variableKey: node.data?.keyword || `${node.id}_selection`,
          isStart,
        };
      }

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        message: node.data?.message || '',
        delayMs: node.type === 'delay' ? Math.max(0, Number(node.data?.delay || 0)) * 1000 : 0,
        nextNodeId: outgoingEdges[0]?.target || null,
        isStart,
      };
    }),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  };
};

export default function FlowBuilder() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [flowName, setFlowName] = useState('');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  const loadFlows = useCallback(async () => {
    try {
      const payload = await getFlows();
      const normalized = normalizeFlows(payload).map(mapFlowToCanvas);
      setFlows(normalized);
    } catch {
      toast.error('Unable to fetch flows from server.');
    }
  }, []);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  const onDragStart = (event, type) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const position = reactFlowInstance?.screenToFlowPosition
      ? reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : { x: event.clientX - bounds.left - 80, y: event.clientY - bounds.top - 20 };

    const newNode = {
      id: crypto.randomUUID(),
      type,
      position,
      data: { ...NODE_DEFAULTS[type] },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  }, [reactFlowInstance]);

  const resetBuilder = () => {
    setSelectedFlowId('');
    setFlowName('');
    setTriggerKeywords('');
    setIsActive(true);
    setNodes([]);
    setEdges([]);
    setSelectedNodeId('');
  };

  const loadFlowIntoCanvas = (flowId) => {
    setSelectedFlowId(flowId);
    const found = flows.find((flow) => flow.id === flowId);
    if (!found) return;

    setFlowName(found.name || '');
    setTriggerKeywords((found.triggerKeywords || []).join(', '));
    setIsActive(Boolean(found.isActive));
    setNodes(found.nodes || []);
    setEdges(found.edges || []);
    setSelectedNodeId(found.nodes?.[0]?.id || '');
  };

  const updateNodeData = (patch) => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.map((node) => (node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node)));
  };

  const handleSave = async () => {
    if (!flowName.trim()) {
      toast.error('Flow name is required.');
      return;
    }

    if (nodes.length === 0) {
      toast.error('Please add at least one node.');
      return;
    }

    const payload = mapCanvasToPayload({
      flowName: flowName.trim(),
      triggerKeywords: triggerKeywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
      isActive,
      nodes,
      edges,
    });

    setIsSaving(true);

    try {
      if (selectedFlowId) {
        await updateFlow(selectedFlowId, payload);
        toast.success('Flow updated successfully.');
      } else {
        await createFlow(payload);
        toast.success('Flow saved successfully.');
      }
      await loadFlows();
    } catch {
      toast.error('Failed to save flow.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFlowId) {
      toast.error('Select a flow to delete.');
      return;
    }

    try {
      await deleteFlow(selectedFlowId);
      toast.success('Flow deleted.');
      resetBuilder();
      await loadFlows();
    } catch {
      toast.error('Failed to delete flow.');
    }
  };

  const nodeTypes = useMemo(() => ({
    text: (props) => <FlowNodeCard {...props} type="text" HandleComponent={Handle} PositionMap={Position} />,
    delay: (props) => <FlowNodeCard {...props} type="delay" HandleComponent={Handle} PositionMap={Position} />,
    condition: (props) => <FlowNodeCard {...props} type="condition" HandleComponent={Handle} PositionMap={Position} />,
    end: (props) => <FlowNodeCard {...props} type="end" HandleComponent={Handle} PositionMap={Position} />,
  }), []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">WhatsApp Flow Builder</h2>
            <p className="text-sm text-gray-500">Build drag-and-drop reply journeys with trigger keywords.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/whatsapp-cloud')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Back to Auto Reply</button>
            <button type="button" onClick={resetBuilder} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">New Flow</button>
            <button type="button" onClick={handleDelete} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Delete</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? 'Saving...' : 'Save Flow'}</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Existing Flows
            <select value={selectedFlowId} onChange={(event) => loadFlowIntoCanvas(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
              <option value="">Select a flow</option>
              {flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 md:col-span-2">
            Flow Name
            <input value={flowName} onChange={(event) => setFlowName(event.target.value)} placeholder="Support Flow" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
          </label>

          <label className="flex items-end gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            <span className="text-sm font-medium text-gray-700">Flow Active</span>
          </label>
        </div>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Trigger Keywords (comma separated)
          <input value={triggerKeywords} onChange={(event) => setTriggerKeywords(event.target.value)} placeholder="hi, hello, support" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_1fr_320px]">
        <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Nodes</h3>
          <div className="space-y-2">
            {NODE_LIBRARY.map((node) => (
              <div key={node.type} draggable onDragStart={(event) => onDragStart(event, node.type)} className="cursor-grab rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50">{node.label}</div>
            ))}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Flow Preview</h4>
            <p className="mt-1 text-xs text-gray-500">{nodes.length} nodes · {edges.length} connections</p>
            <div className="mt-2 max-h-52 space-y-1 overflow-auto pr-1">
              {nodes.map((node, index) => <p key={node.id} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">{index + 1}. {node.data?.label || node.type}</p>)}
            </div>
          </div>
        </aside>

        <section onDrop={onDrop} onDragOver={(event) => event.preventDefault()} className="relative h-[620px] overflow-hidden rounded-xl border border-gray-200 bg-slate-50 shadow-sm">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            onInit={setReactFlowInstance}
            onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
            onEdgesChange={(changes) => setEdges((current) => applyEdgeChanges(changes, current))}
            onConnect={(params) => setEdges((current) => addEdge(params, current))}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          >
            <MiniMap />
            <Controls />
            <Background gap={20} size={1} />
          </ReactFlow>
        </section>

        <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Node Properties</h3>
          {!selectedNode ? (
            <p className="mt-2 text-sm text-gray-500">Select a node to edit message, delay, and options.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Label
                <input value={selectedNode.data?.label || ''} onChange={(event) => updateNodeData({ label: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>

              {(selectedNode.type === 'text' || selectedNode.type === 'condition' || selectedNode.type === 'end') && (
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Message
                  <textarea rows={4} value={selectedNode.data?.message || ''} onChange={(event) => updateNodeData({ message: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              )}

              {selectedNode.type === 'delay' && (
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Delay (seconds)
                  <input type="number" min="0" value={selectedNode.data?.delay || 0} onChange={(event) => updateNodeData({ delay: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              )}

              {selectedNode.type === 'condition' && (
                <>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Save Selection As
                    <input value={selectedNode.data?.keyword || ''} onChange={(event) => updateNodeData({ keyword: event.target.value })} placeholder="optional_variable_name" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>

                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Options (comma separated)
                    <input value={(selectedNode.data?.options || []).join(', ')} onChange={(event) => updateNodeData({ options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>
                  <p className="text-xs text-gray-500">Connect outgoing edges in the same order as the options above.</p>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
