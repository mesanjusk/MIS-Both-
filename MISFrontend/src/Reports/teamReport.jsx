import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { fetchAssignees, fetchAssigneeReport } from '../services/assigneeService';
import { ASSIGNEE_TYPE_LABELS, STAGE_LABELS, LEGACY_STAGE_LABELS } from '../constants/orderStages';
import { ReportFilterBar, ReportPageShell, ReportTableCard } from '../Components/reports/ReportShell';
import { EmptyState, LoadingState } from '../Components/ui';

const TYPE_FILTERS = ['all', 'employee', 'payable'];

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

// One picker, any assignee — the report backing this page (GET /api/assignees
// and GET /api/assignees/:type/:id/report) is id-based, not name-based, so it
// stays correct even if two people share a name. This is deliberately the
// single place "how much pending work / how much do we owe them" is easy to
// pull up for an employee or Account Payable party, instead of hunting
// across the Workflow board and the Outstanding Report separately.
export default function TeamReport() {
  const [assignees, setAssignees] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    setLoadingList(true);
    fetchAssignees()
      .then((res) => setAssignees(res?.data?.result || []))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load team & partners list.'))
      .finally(() => setLoadingList(false));
  }, []);

  const filtered = useMemo(
    () =>
      assignees
        .filter((a) => typeFilter === 'all' || a.type === typeFilter)
        .filter((a) => !searchTerm || a.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [assignees, typeFilter, searchTerm]
  );

  const selected = useMemo(() => assignees.find((a) => a.id === selectedId) || null, [assignees, selectedId]);

  useEffect(() => {
    if (!selected) { setReport(null); return; }
    setLoadingReport(true);
    setError('');
    const backendType = selected.type === 'employee' ? 'user' : 'vendor';
    fetchAssigneeReport(backendType, selected.id)
      .then((res) => setReport(res?.data?.result || null))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load report for this person.'))
      .finally(() => setLoadingReport(false));
  }, [selected]);

  const stageLabel = (task) => STAGE_LABELS[task.stage] || LEGACY_STAGE_LABELS[task.stage] || task.task || '-';

  return (
    <ReportPageShell
      title="Team & Partners Report"
      subtitle="Pending work and billing, per employee or Account Payable party — in one place."
      count={filtered.length}
    >
      <ReportFilterBar>
        <Grid item xs={12} sm={6} md={4}>
          <TextField fullWidth size="small" label="Search by name" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField fullWidth size="small" select label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <MenuItem value="all">All types</MenuItem>
            {TYPE_FILTERS.slice(1).map((t) => (
              <MenuItem key={t} value={t}>{ASSIGNEE_TYPE_LABELS[t]}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField fullWidth size="small" select label="Select person" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <MenuItem value="">Pick someone</MenuItem>
            {filtered.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name} · {ASSIGNEE_TYPE_LABELS[a.type] || a.type}</MenuItem>
            ))}
          </TextField>
        </Grid>
      </ReportFilterBar>

      {error && <Alert severity="error">{error}</Alert>}
      {loadingList && <LoadingState label="Loading team & partners" />}

      {!loadingList && !selected ? (
        <EmptyState title="Pick a person above" description="Search or filter by type, then select someone to see their pending work and (for Account Payable parties) their billing balance." />
      ) : null}

      {selected && (
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
            <Typography variant="h6" fontWeight={800}>{selected.name}</Typography>
            <Chip size="small" color="primary" label={ASSIGNEE_TYPE_LABELS[selected.type] || selected.type} />
            {selected.mobile && <Chip size="small" variant="outlined" label={selected.mobile} />}
            {loadingReport && <Chip size="small" label="Loading…" />}
          </Stack>

          {report?.billing && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
              <Chip label={`Debit ${currency(report.billing.totalDebit)}`} />
              <Chip label={`Credit ${currency(report.billing.totalCredit)}`} />
              <Chip
                color={report.billing.balanceNature === 'payable' ? 'warning' : report.billing.balanceNature === 'receivable' ? 'info' : 'success'}
                label={`Balance ${currency(report.billing.balance)} ${report.billing.balanceNature}`}
              />
            </Stack>
          )}

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            Pending ({report?.pending?.length || 0})
          </Typography>
          {report && report.pending.length === 0 ? (
            <EmptyState title="Nothing pending" description="No open orders assigned to this person right now." />
          ) : (
            <ReportTableCard>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Order</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Stage</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Due</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(report?.pending || []).map((task) => (
                    <TableRow key={task.orderId} hover>
                      <TableCell>#{task.orderNumber}</TableCell>
                      <TableCell>{stageLabel(task)}</TableCell>
                      <TableCell>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ReportTableCard>
          )}
        </Box>
      )}
    </ReportPageShell>
  );
}
