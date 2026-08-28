import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';

import client from '../../apiClient';
import { isSuperAdminRole } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { invalidatePageToggles } from '../../hooks/usePageToggles';
import { count, percent } from './reportFormat';

/**
 * Which endpoints and pages are actually used, how fast they are, and a switch
 * for each one.
 *
 * The switch is a database row, not a commented-out block. Commented code
 * needs a developer, a commit and a deploy to bring back — the opposite of
 * switching it on again from here — and a mistake stays broken until someone
 * is free to fix it. Unticking a box takes effect within thirty seconds.
 *
 * A reviewed set of duplicate pages and one-time maintenance endpoints starts
 * off. An administrator can switch any unlocked row back on here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long ago, in words. `null` means never seen since recording began. */
function ago(value) {
  if (!value) return 'never';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const API_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'idle', label: 'Unused' },
  { value: 'used', label: 'Used' },
  { value: 'errors', label: 'Failing' },
  { value: 'disabled', label: 'Switched off' },
];

const PAGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unlinked', label: 'Not in menu' },
  { value: 'disabled', label: 'Switched off' },
];

export default function ApiPerformance() {
  const { userGroup } = useAuth();
  const allowed = isSuperAdminRole(userGroup);

  const [tab, setTab] = useState('apis');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [idleDays, setIdleDays] = useState(45);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const { data: payload } = await client.get(`/api/api-usage/report?idleDays=${idleDays}`);
      setData(payload);
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'This report is limited to the Admin User group.'
          : err?.response?.data?.message || 'Could not load the report.'
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [allowed, idleDays]);

  useEffect(() => {
    load();
  }, [load]);

  /** Tick / untick. Optimistic, reverted if the server refuses. */
  async function setEnabled(row, kind, enabled) {
    if (row.locked) {
      toast.error('This one keeps the app reachable and cannot be switched off.');
      return;
    }
    if (!enabled) {
      const target = row.label || row.key;
      const warning = kind === 'api'
        ? `Switch off ${target}? Any workflow that still calls it will stop until it is switched on again.`
        : `Switch off ${target}? It will disappear from navigation and direct links until it is switched on again.`;
      if (!window.confirm(warning)) return;
    }
    setSaving(row.key);
    const collection = kind === 'api' ? 'apis' : 'pages';
    const previous = data;

    setData((current) => ({
      ...current,
      [collection]: current[collection].map((item) =>
        item.key === row.key ? { ...item, disabled: !enabled } : item
      ),
    }));

    try {
      await client.post('/api/api-usage/toggle', { key: row.key, kind, disabled: !enabled });
      invalidatePageToggles();
      toast.success(`${row.label || row.key} ${enabled ? 'switched on' : 'switched off'}.`);
    } catch (err) {
      setData(previous);
      toast.error(err?.response?.data?.message || 'Could not save that change.');
    } finally {
      setSaving('');
    }
  }

  const apis = useMemo(() => {
    const rows = data?.apis || [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !row.key.toLowerCase().includes(term)) return false;
      if (filter === 'idle') return row.idle;
      if (filter === 'used') return row.hits > 0;
      if (filter === 'errors') return row.errorRate > 0;
      if (filter === 'disabled') return row.disabled;
      return true;
    });
  }, [data, filter, search]);

  const pages = useMemo(() => {
    const rows = data?.pages || [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !`${row.path} ${row.label}`.toLowerCase().includes(term)) return false;
      if (filter === 'unlinked') return row.linked === false;
      if (filter === 'disabled') return row.disabled;
      return true;
    });
  }, [data, filter, search]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-gray-400" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admins only</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          This page lists every endpoint in the system and can take them offline, so it is
          limited to the Admin User group.
        </p>
      </div>
    );
  }

  const totals = data?.totals || {};
  const stillLearning = data && data.observedDays < data.idleDays;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            API performance &amp; usage
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data
              ? `${count(totals.endpoints)} endpoints · ${count(totals.pages)} pages · recording for ${count(data.observedDays)} day${data.observedDays === 1 ? '' : 's'}`
              : 'Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {stillLearning && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Usage recording started {count(data.observedDays)} day
            {data.observedDays === 1 ? '' : 's'} ago, so &ldquo;unused for {data.idleDays} days&rdquo;
            cannot be true yet. Nothing was being recorded before that — an endpoint showing no
            hits may simply not have been called since recording began. Treat this list as
            provisional until {data.idleDays} days have passed, and check anything you intend to
            switch off against what you know of the business.
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile label="Endpoints" value={count(totals.endpoints)} />
        <Tile label="Called" value={count(totals.called)} />
        <Tile label="Never called" value={count(totals.neverCalled)} tone="text-amber-600" />
        <Tile label={`Idle ${data?.idleDays ?? 45}d`} value={count(totals.idle)} />
        <Tile label="Switched off" value={count(totals.disabled)} />
        <Tile label="Pages off" value={count(totals.pagesDisabled)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['apis', 'pages'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setTab(value); setFilter('all'); }}
            aria-pressed={tab === value}
            className={`rounded-md border px-3 py-1 text-xs ${
              tab === value ? 'border-blue-600 bg-blue-600 text-white' : 'text-gray-500'
            }`}
          >
            {value === 'apis' ? `APIs (${data?.apis?.length ?? 0})` : `Pages (${data?.pages?.length ?? 0})`}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-300" />
        {(tab === 'apis' ? API_FILTERS : PAGE_FILTERS).map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setFilter(entry.value)}
            aria-pressed={filter === entry.value}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              filter === entry.value ? 'border-blue-600 bg-blue-600 text-white' : 'text-gray-500'
            }`}
          >
            {entry.label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
        />
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
          Idle after
          <input
            type="number"
            min={1}
            max={365}
            value={idleDays}
            onChange={(e) => setIdleDays(Number(e.target.value) || 45)}
            className="h-8 w-16 rounded-md border bg-transparent px-2 text-xs"
          />
          days
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-6 text-center text-sm text-red-700 dark:bg-red-950/30">
          {error}
        </p>
      ) : tab === 'apis' ? (
        <ApiTable rows={apis} loading={loading} saving={saving} onToggle={setEnabled} />
      ) : (
        <PageTable rows={pages} loading={loading} saving={saving} onToggle={setEnabled} />
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Off is reversible and does not delete data. Locked rows keep login and this control page reachable.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className="rounded-lg border bg-white p-3 dark:bg-gray-800">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone || 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}

function EnabledBox({ row, kind, saving, onToggle }) {
  const enabled = !row.disabled;
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={enabled}
        disabled={row.locked || saving === row.key}
        onChange={(e) => onToggle(row, kind, e.target.checked)}
        className="h-4 w-4 accent-blue-600 disabled:opacity-40"
        aria-label={`${enabled ? 'Switch off' : 'Switch on'} ${row.label || row.key}`}
      />
      {row.locked ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
          <Lock className="h-3 w-3" aria-hidden="true" /> locked
        </span>
      ) : (
        <span className="text-[11px] text-gray-500">{enabled ? 'On' : 'Off'}</span>
      )}
    </label>
  );
}

function Empty({ colSpan, loading }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-gray-500">
        {loading ? 'Loading…' : 'Nothing matches this filter.'}
      </td>
    </tr>
  );
}

function ApiTable({ rows, loading, saving, onToggle }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Endpoint</th>
            <th className="px-3 py-2 text-right font-medium">Hits</th>
            <th className="px-3 py-2 text-right font-medium">Last used</th>
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">Max</th>
            <th className="px-3 py-2 text-right font-medium">Errors</th>
            <th className="px-3 py-2 font-medium">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {(loading || rows.length === 0) && <Empty colSpan={7} loading={loading} />}
          {!loading &&
            rows.map((row) => (
              <tr key={row.key} className={`border-b last:border-0 ${row.disabled ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">
                    <span className="text-gray-500">{row.method}</span> {row.path}
                  </div>
                  {row.defaultOff && <span className="text-[11px] text-gray-400">maintenance default</span>}
                  {row.neverCalled && (
                    <span className="text-[11px] text-amber-600">not called since recording began</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{count(row.hits)}</td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">{ago(row.lastUsedAt)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.avgMs === null ? '—' : `${row.avgMs}ms`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {row.maxMs ? `${Math.round(row.maxMs)}ms` : '—'}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${row.status5xx > 0 ? 'text-red-600' : ''}`}
                >
                  {percent(row.errorRate, 0)}
                </td>
                <td className="px-3 py-2">
                  <EnabledBox row={row} kind="api" saving={saving} onToggle={onToggle} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function PageTable({ rows, loading, saving, onToggle }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Page</th>
            <th className="px-3 py-2 font-medium">Path</th>
            <th className="px-3 py-2 font-medium">In a menu</th>
            <th className="px-3 py-2 font-medium">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {(loading || rows.length === 0) && <Empty colSpan={4} loading={loading} />}
          {!loading &&
            rows.map((row) => (
              <tr key={row.key} className={`border-b last:border-0 ${row.disabled ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 font-medium">
                  {row.label}
                  {row.defaultOff && <span className="ml-2 text-[11px] font-normal text-gray-400">default off</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.path}</td>
                <td className="px-3 py-2 text-xs">
                  {row.linked === false ? (
                    <span className="text-amber-600">no menu links here</span>
                  ) : (
                    <span className="text-gray-400">yes</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <EnabledBox row={row} kind="page" saving={saving} onToggle={onToggle} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

const toggleRowPropType = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string,
  disabled: PropTypes.bool,
  locked: PropTypes.bool,
});

Tile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  tone: PropTypes.string,
};

EnabledBox.propTypes = {
  row: toggleRowPropType.isRequired,
  kind: PropTypes.oneOf(['api', 'page']).isRequired,
  saving: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
};

Empty.propTypes = {
  colSpan: PropTypes.number.isRequired,
  loading: PropTypes.bool.isRequired,
};

ApiTable.propTypes = {
  rows: PropTypes.arrayOf(toggleRowPropType).isRequired,
  loading: PropTypes.bool.isRequired,
  saving: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
};

PageTable.propTypes = ApiTable.propTypes;
