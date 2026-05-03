import React from 'react';
import BaseNode from './BaseNode';

export default function QuestionNode({ node, selected, onSelect }) {
  return (
    <BaseNode title={node.data.label || 'Question'} badge="question" selected={selected} onSelect={onSelect}>
      <p className="line-clamp-2 text-xs text-gray-600">{node.data.question || 'Ask a question to collect user input.'}</p>
      <p className="mt-2 text-[11px] text-blue-600">Response key: {node.data.responseKey || 'answer'}</p>
    </BaseNode>
  );
}
