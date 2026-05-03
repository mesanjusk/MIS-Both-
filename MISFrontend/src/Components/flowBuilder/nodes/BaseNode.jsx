import React from 'react';

export default function BaseNode({ title, badge, children, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-60 rounded-xl border bg-white p-3 text-left shadow-sm transition ${
        selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {badge}
        </span>
      </div>
      {children}
    </button>
  );
}
