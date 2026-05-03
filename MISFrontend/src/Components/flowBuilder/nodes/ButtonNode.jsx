import React from 'react';
import BaseNode from './BaseNode';

export default function ButtonNode({ node, selected, onSelect }) {
  const buttons = node.data.buttons || [];

  return (
    <BaseNode title={node.data.label || 'Buttons'} badge="button" selected={selected} onSelect={onSelect}>
      {buttons.length === 0 ? (
        <p className="text-xs text-gray-500">Add quick-reply buttons in the config panel.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {buttons.map((item, index) => {
            const safeItemLabel =
              typeof item === 'object' && item !== null
                ? item.Task || item.name || JSON.stringify(item)
                : item;

            return (
              <span
                key={`${safeItemLabel}-${index}`}
                className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700"
              >
                {safeItemLabel}
              </span>
            );
          })}
        </div>
      )}
    </BaseNode>
  );
}
