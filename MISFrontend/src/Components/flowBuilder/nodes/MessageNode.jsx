import React from 'react';
import BaseNode from './BaseNode';

export default function MessageNode({ node, selected, onSelect }) {
  return (
    <BaseNode title={node.data.label || 'Message'} badge="message" selected={selected} onSelect={onSelect}>
      <p className="line-clamp-3 text-xs text-gray-600">{node.data.message || 'Type your outgoing message.'}</p>
    </BaseNode>
  );
}
