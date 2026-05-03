const NODE_COLORS = {
  text: 'border-green-200 bg-green-50 text-green-900',
  delay: 'border-amber-200 bg-amber-50 text-amber-900',
  condition: 'border-blue-200 bg-blue-50 text-blue-900',
  end: 'border-slate-300 bg-slate-100 text-slate-800',
};

const NODE_TITLES = {
  text: 'Text Message',
  delay: 'Delay',
  condition: 'Condition',
  end: 'End',
};

export default function FlowNodeCard({ type, data, selected, HandleComponent, PositionMap }) {
  const summary =
    type === 'text'
      ? data?.message || 'Type a message...'
      : type === 'delay'
        ? `Wait ${data?.delay || 1} sec`
        : type === 'condition'
          ? (data?.options || []).join(', ') || (data?.keyword ? `Keyword: ${data.keyword}` : 'Set keyword options')
          : 'Flow ends here';

  return (
    <div
      className={`w-56 rounded-xl border p-3 shadow-sm ${NODE_COLORS[type] || NODE_COLORS.text} ${
        selected ? 'ring-2 ring-emerald-300' : ''
      }`}
    >
      {HandleComponent && PositionMap ? <HandleComponent type="target" position={PositionMap.Left} /> : null}
      <p className="text-[11px] uppercase tracking-wide opacity-80">{NODE_TITLES[type] || 'Node'}</p>
      <p className="mt-1 text-sm font-semibold">{data?.label || NODE_TITLES[type]}</p>
      <p className="mt-1 text-xs opacity-90 break-words">{summary}</p>
      {HandleComponent && PositionMap ? <HandleComponent type="source" position={PositionMap.Right} /> : null}
    </div>
  );
}
