import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Lock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import client from '../../apiClient';
import { isSuperAdminRole } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import {
  GRANULARITIES,
  RANGE_PRESETS,
  REPORT_TABS,
  amountTone,
  buildReportQuery,
  count,
  money,
  percent,
  toCsv,
} from './reportFormat';

/**
 * The admin business reports — one filter, six views over the same orders.
 *
 * Deliberately separate from the reports in `src/Reports/*`, which each answer
 * one operational question for whoever is doing that job. These six answer
 * "how is the business doing", show margins and what every supplier and person
 * is worth, and are restricted to the Admin User group accordingly.
 *
 * All aggregation happens on the server (`GET /api/reports/admin/:report`), so
 * every table here is a rendering of numbers the backend computed once. That
 * is what stops a screen and its export from disagreeing.
 */

const EMPTY_TOTALS = { revenue: 0, cost: 0, profit: 0, margin: null, orders: 0, quantity: 0 };

export default function BusinessReports() {
  const { userGroup } = useAuth();
  // The gate here is presentational — the API enforces it for real. Rendering
  // the tabs to someone who would only get 403s from every one of them is a
  // worse experience than saying so plainly.
  const allowed = isSuperAdminRole(userGroup);

  const [tab, setTab] = useState('summary');
  const [preset, setPreset] = useState('30d');
  const [granularity, setGranularity] = useState('');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const query = useMemo(
    () => buildReportQuery({ preset, granularity, from: custom.from, to: custom.to }),
    [preset, granularity, custom.from, custom.to]
  );

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const url = `/api/reports/admin/${tab}${query ? `?${query}` : ''}`;
      const { data: payload } = await client.get(url);
      setData(payload);
    } catch (err) {
      const message =
        err?.response?.status === 403
          ? 'These reports are limited to the Admin User group.'
          : err?.response?.data?.message || 'Could not load the report.';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [allowed, tab, query]);

  useEffect(() => {
    load();
  }, [load]);

  /** Both ends are required for a custom range, so one edit carries the other. */
  const setCustomDate = (field, value) => {
    if (!value) return;
    const resolved = data?.filter || {};
    setCustom((prev) => ({
      from: field === 'from' ? value : prev.from || resolved.from || value,
      to: field === 'to' ? value : prev.to || resolved.to || value,
    }));
    setPreset('');
  };

  const selectPreset = (value) => {
    setPreset(value);
    // A preset and a custom range answer the same question; picking one has to
    // clear the other or the dates keep winning.
    setCustom({ from: '', to: '' });
  };

  const exportCsv = () => {
    const table = TABLES[tab];
    if (!data?.rows?.length) {
      toast.error('Nothing to export for this period.');
      return;
    }
    const csv = toCsv(
      table.columns.map((c) => c.label),
      data.rows.map((row) => table.columns.map((c) => c.csv(row)))
    );
    const filter = data.filter || {};
    // The leading U+FEFF byte-order mark is deliberate: without it Excel
    // opens a UTF-8 CSV as the local codepage and mangles every non-ASCII
    // name in the export. It is flagged as irregular whitespace, which is
    // exactly what it is — and exactly what is needed here.
    // eslint-disable-next-line no-irregular-whitespace
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tab}-${filter.from || 'start'}-to-${filter.to || 'end'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-gray-400" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admins only</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Business reports show margins, vendor costs and per-person figures, so they are
          limited to the Admin User group.
        </p>
      </div>
    );
  }

  const totals = data?.totals || EMPTY_TOTALS;
  const filter = data?.filter || {};
  const table = TABLES[tab];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Business reports
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {filter.label || 'Loading…'}
            {filter.granularity ? ` · ${filter.granularity}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </header>

      <nav className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max min-w-full gap-1 border-b">
          {REPORT_TABS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setTab(entry.value)}
              aria-current={tab === entry.value ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === entry.value
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500">Period</span>
          {RANGE_PRESETS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => selectPreset(entry.value)}
              aria-pressed={filter.preset === entry.value}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                filter.preset === entry.value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            From
            <input
              type="date"
              value={custom.from || filter.from || ''}
              max={custom.to || filter.to || undefined}
              onChange={(e) => setCustomDate('from', e.target.value)}
              className="h-8 rounded-md border bg-transparent px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            To
            <input
              type="date"
              value={custom.to || filter.to || ''}
              min={custom.from || filter.from || undefined}
              onChange={(e) => setCustomDate('to', e.target.value)}
              className="h-8 rounded-md border bg-transparent px-2 text-xs"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Group by</span>
            <div className="flex gap-1">
              {GRANULARITIES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setGranularity(entry.value)}
                  aria-pressed={filter.granularity === entry.value}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    filter.granularity === entry.value
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {data?.truncated && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30">
          This range holds more orders than one report can read. The totals below cover the most
          recent ones only — narrow the dates for exact figures.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile label="Revenue" value={money(totals.revenue)} />
        <Tile label="Cost" value={money(totals.cost)} />
        <Tile label="Profit" value={money(totals.profit)} tone={amountTone(totals.profit)} />
        <Tile label="Margin" value={percent(totals.margin)} />
        <Tile label="Orders" value={count(totals.orders)} />
        <Tile
          label="Unmapped"
          value={count(totals.unmappedOrders)}
          hint="orders with no vendor behind them"
        />
      </div>

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-6 text-center text-sm text-red-700 dark:bg-red-950/30">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-gray-500">
              <tr>
                {table.columns.map((column) => (
                  <th
                    key={column.label}
                    className={`whitespace-nowrap px-3 py-2 font-medium ${
                      column.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={table.columns.length} className="px-3 py-8 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && (data?.rows?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={table.columns.length} className="px-3 py-8 text-center text-gray-500">
                    {table.empty}
                  </td>
                </tr>
              )}
              {!loading &&
                (data?.rows || []).map((row, index) => (
                  <tr key={row.key || index} className="border-b last:border-0">
                    {table.columns.map((column) => (
                      <td
                        key={column.label}
                        className={`px-3 py-2 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'items' && (data?.rows?.length ?? 0) > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          An order&apos;s vendor bill covers the whole job, so item cost is apportioned across
          that order&apos;s items by their share of its revenue. Item margin is a guide to which
          items carry their weight, not a costing.
        </p>
      )}
      {tab === 'employees' && (data?.rows?.length ?? 0) > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          An order worked by several people is shared between them, so these rows add up to the
          period&apos;s revenue rather than to a multiple of it.
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, tone, hint }) {
  return (
    <div className="rounded-lg border bg-white p-3 dark:bg-gray-800">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone || 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
// Each column carries both its on-screen renderer and its CSV cell, so the
// download can never drift from the table it was taken from.

const moneyCol = (label, key) => ({
  label,
  align: 'right',
  render: (row) => <span className={amountTone(row[key])}>{money(row[key])}</span>,
  csv: (row) => Number(row[key] ?? 0).toFixed(2),
});

const countCol = (label, key) => ({
  label,
  align: 'right',
  render: (row) => count(row[key]),
  csv: (row) => Math.round(Number(row[key] ?? 0)),
});

const rateCol = (label, key) => ({
  label,
  align: 'right',
  render: (row) => percent(row[key]),
  csv: (row) => percent(row[key]),
});

const GROUP_COLUMNS = (first) => [
  {
    label: first,
    render: (row) => (
      <div>
        <div className="font-medium">{row.label}</div>
        {row.detail && <div className="text-xs text-gray-500">{row.detail}</div>}
      </div>
    ),
    csv: (row) => row.label,
  },
  countCol('Orders', 'orders'),
  countCol('Qty', 'quantity'),
  moneyCol('Revenue', 'revenue'),
  moneyCol('Cost', 'cost'),
  moneyCol('Profit', 'profit'),
  rateCol('Margin', 'margin'),
];

const PERIOD_COLUMNS = [
  { label: 'Period', render: (row) => row.label, csv: (row) => row.key },
  countCol('Orders', 'orders'),
  countCol('Qty', 'quantity'),
  moneyCol('Revenue', 'revenue'),
  moneyCol('Cost', 'cost'),
  moneyCol('Profit', 'profit'),
  rateCol('Margin', 'margin'),
];

const TABLES = {
  summary: { columns: PERIOD_COLUMNS, empty: 'No orders in this period.' },
  items: { columns: GROUP_COLUMNS('Item'), empty: 'No items sold in this period.' },
  orders: {
    columns: [
      {
        label: 'Order',
        render: (row) => (
          <div>
            <div className="font-medium">{row.label}</div>
            <div className="text-xs text-gray-500">
              {row.detail}
              {row.vendors?.length ? ` · ${row.vendors.join(', ')}` : ' · no vendor'}
            </div>
          </div>
        ),
        csv: (row) => row.label,
      },
      { label: 'Stage', render: (row) => row.detail, csv: (row) => row.detail },
      {
        label: 'Vendors',
        render: (row) => (row.vendors?.length ? row.vendors.join(', ') : '—'),
        csv: (row) => (row.vendors || []).join(' | '),
      },
      countCol('Qty', 'quantity'),
      moneyCol('Revenue', 'revenue'),
      moneyCol('Cost', 'cost'),
      moneyCol('Profit', 'profit'),
      rateCol('Margin', 'margin'),
    ],
    empty: 'No orders in this period.',
  },
  vendors: { columns: GROUP_COLUMNS('Vendor'), empty: 'No vendor activity in this period.' },
  employees: { columns: GROUP_COLUMNS('Team member'), empty: 'No work recorded in this period.' },
  performance: {
    columns: [
      { label: 'Period', render: (row) => row.label, csv: (row) => row.key },
      countCol('Orders', 'orders'),
      countCol('Delivered', 'delivered'),
      rateCol('Delivered %', 'deliveryRate'),
      countCol('Billed', 'billed'),
      rateCol('On time', 'onTimeRate'),
      countCol('Unmapped', 'unmapped'),
      moneyCol('Avg order', 'avgOrderValue'),
      moneyCol('Revenue', 'revenue'),
      moneyCol('Profit', 'profit'),
    ],
    empty: 'No orders in this period.',
  },
};
