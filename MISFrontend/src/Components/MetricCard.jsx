import React from 'react';
import PropTypes from 'prop-types';
import { ResponsiveContainer, LineChart, Line } from 'recharts';

export default function MetricCard({ label, value, icon: Icon, data, onClick }) {
  const Component = onClick ? 'button' : 'article';
  return (
    <Component
      aria-label={label}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`flex flex-col justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {Icon ? <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {data && data.length > 0 && (
        <div className="mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Component>
  );
}

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  icon: PropTypes.elementType,
  data: PropTypes.arrayOf(PropTypes.object),
  onClick: PropTypes.func
};
