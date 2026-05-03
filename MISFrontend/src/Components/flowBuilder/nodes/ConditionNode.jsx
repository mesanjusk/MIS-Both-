import React from 'react';
import BaseNode from './BaseNode';

export default function ConditionNode({ node, selected, onSelect }) {
  const conditions = node.data.conditions || [];

  return (
    <BaseNode title={node.data.label || 'Condition'} badge="condition" selected={selected} onSelect={onSelect}>
      {conditions.length === 0 ? (
        <p className="text-xs text-gray-500">Add one or more rule checks.</p>
      ) : (
        <ul className="space-y-1 text-[11px] text-gray-600">
          {conditions.slice(0, 3).map((rule, idx) => (
            <li key={`${rule.key}-${idx}`}>
              {rule.key || 'field'} {rule.operator || 'equals'} {rule.value || 'value'}
            </li>
          ))}
        </ul>
      )}
    </BaseNode>
  );
}
