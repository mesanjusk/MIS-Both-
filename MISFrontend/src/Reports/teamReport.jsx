import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { fetchAssignees, fetchAssigneeReport } from '../services/assigneeService';
import { STAGE_LABELS, LEGACY_STAGE_LABELS } from '../constants/orderStages';
import { ReportFilterBar, ReportPageShell, ReportTableCard } from '../Components/reports/ReportShell';
import { EmptyState, LoadingState } from '../Components/ui';

// A party with no assigned order in this many days reads as dormant — some
// Account Payable parties get 1-5 tasks a day, others go 2-3 months without
// one, so the "Active only" toggle needs a concrete cutoff rather than a
// vague label.
const ACTIVE_WINDOW_DAYS = 90;

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function activityLabel(party) {
  const days = daysSince(party.lastActivityAt);
  if (days === null) return 'No tasks yet';
  const recency = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return `${party.taskCount} task${party.taskCount === 1 ? '' : 's'} · last ${recency}`;
}

// Employees are deliberately excluded here — they already have their own
// pending-work views (Workflow board's "By User" tab, My Tasks). This page
// is specifically for Account Payable parties (vendors/freelancers/
// contractors/anyone paid this way), so their pending work and real
// accounts-payable/receivable balance are easy to look up in one place
// instead of hunting across the Workflow board and the Outstanding Report.
export default function TeamReport() {
  const [assignees, setAssignees] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    setLoadingList(true);
    fetchAssignees()
      .then((res) => setAssignees((res?.data?.result || []).filter((a) => a.type === 'payable')))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load Account Payable list.'))
      .finally(() => setLoadingList(false));
  }, []);

  const filtered = useMemo(
    () =>
      assignees.filter((a) => {
        if (!activeOnly) return true;
        const days = daysSince(a.lastActivityAt);
        return days !== null && days <= ACTIVE_WINDOW_DAYS;
      }),
    [assignees, activeOnly]
  );

  useEffect(() => {
    if (!selected) { setReport(null); return; }
    setLoadingReport(true);
    setError('');
    fetchAssigneeReport('vendor', selected.id)
      .then((res) => setReport(res?.data?.result || null))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load report for this person.'))
      .finally(() => setLoadingReport(false));
  }, [selected]);

  const stageLabel = (task) => STAGE_LABELS[task.stage] || LEGACY_STAGE_LABELS[task.stage] || task.task || '-';

  return (
    <ReportPageShell
      title="Team & Partners Report"
      subtitle="Pending work and billing for Account Payable parties — in one place."
      count={filtered.length}
    >
      <ReportFilterBar>
        <Grid item xs={12} sm={7} md={8}>
          <Autocomplete
            options={filtered}
            value={selected}
            inputValue={inputValue}
            onInputChange={(_, val) => setInputValue(val)}
            onChange={(_, val) => setSelected(val)}
            getOptionLabel={(option) => option?.name || ''}
            isOptionEqualToValue={(option, val) => option?.id === val?.id}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Stack>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{activityLabel(option)}</Typography>
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Search Account Payable party" placeholder="Type a name" size="small" />
            )}
          />
        </Grid>
        <Grid item xs={12} sm={5} md={4}>
          <FormControlLabel
            control={<Switch checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />}
            label={`Active only (task in last ${ACTIVE_WINDOW_DAYS} days)`}
          />
        </Grid>
      </ReportFilterBar>

      {error && <Alert severity="error">{error}</Alert>}
      {loadingList && <LoadingState label="Loading Account Payable list" />}

      {!loadingList && !selected ? (
        <EmptyState title="Search for a party above" description="Type a name, then pick someone to see their pending work and billing balance. Toggle 'Active only' to hide parties with no recent task." />
      ) : null}

      {selected && (
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
            <Typography variant="h6" fontWeight={800}>{selected.name}</Typography>
            <Chip size="small" color="primary" label="Account Payable" />
            {selected.mobile && <Chip size="small" variant="outlined" label={selected.mobile} />}
            <Chip size="small" variant="outlined" label={activityLabel(selected)} />
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
            <EmptyState title="Nothing pending" description="No open orders assigned to this party right now." />
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
