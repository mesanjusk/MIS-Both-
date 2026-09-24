import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  CheckCircleRounded,
  FactCheckRounded,
  HistoryRounded,
  ManageSearchRounded,
  RefreshRounded,
  SecurityRounded,
} from '@mui/icons-material';
import toast from 'react-hot-toast';

import client from '../apiClient';
import DatabaseIntegrityReviewDialog from '../Components/DatabaseIntegrityReviewDialog';

const API_BASE = '/api/api-usage/database-integrity';
const REVIEWABLE_KEYS = new Set([
  'staff_ledger_unresolved',
  'diary_assignment_unresolved',
  'bank_assignment_unresolved',
  'transaction_integrity',
]);

const LEGACY_INFORMATIONAL_KEYS = new Set([
  'attendance_duplicate_day',
  'attendance_duplicate_record_id',
  'po_item_unresolved',
]);

function isLegacyInformationalIssue(row) {
  if (!row) return false;
  if (LEGACY_INFORMATIONAL_KEYS.has(row.key)) return true;

  // Archived shadow-party accounts keep their old account code for audit/rollback.
  // They are intentionally inactive and should not be shown as work for the user.
  if (row.key === 'duplicate_account_code') {
    return (row.examples || []).some((value) => String(value || '').includes('__archived_party__'));
  }

  return false;
}

function SummaryCard({ title, value, helper, tone = 'default' }) {
  const toneColor = tone === 'warning' ? 'warning.main' : tone === 'success' ? 'success.main' : 'text.primary';
  return (
    <Card variant="outlined" sx={{ flex: '1 1 180px', minWidth: 170 }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</Typography>
        <Typography variant="h4" sx={{ mt: 0.4, fontWeight: 700, color: toneColor }}>{Number(value || 0).toLocaleString()}</Typography>
        <Typography variant="body2" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

function statusChip(row) {
  if (row.fixable) return <Chip size="small" color="success" variant="outlined" label="Safe fix available" />;
  return <Chip size="small" color="warning" variant="outlined" label="Needs review" />;
}

function historyAction(row) {
  if (row.action === 'safe_fix') return { label: 'Safe Fix', color: 'success', icon: <CheckCircleRounded /> };
  if (row.action === 'manual_fix') return { label: 'Manual Fix', color: 'warning', icon: <ManageSearchRounded /> };
  return { label: 'Audit', color: 'default', icon: <FactCheckRounded /> };
}

export default function DatabaseIntegrity() {
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [auditing, setAuditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFix, setLastFix] = useState(null);
  const [reviewIssue, setReviewIssue] = useState(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await client.get(`${API_BASE}/history`);
      setHistory(Array.isArray(data?.history) ? data.history : []);
    } catch (err) {
      console.error('Could not load database integrity history', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runAudit = useCallback(async () => {
    setAuditing(true);
    setError('');
    setLastFix(null);
    try {
      const { data } = await client.get(`${API_BASE}/audit`);
      setReport(data?.report || null);
      toast.success('Database integrity audit completed');
      await loadHistory();
    } catch (err) {
      const message = err?.response?.data?.message || 'Could not run the database integrity audit.';
      setError(message);
      toast.error(message);
    } finally {
      setAuditing(false);
    }
  }, [loadHistory]);

  const allIssueRows = useMemo(() => report?.issues || [], [report]);
  const issueRows = useMemo(
    () => allIssueRows.filter((row) => !isLegacyInformationalIssue(row)),
    [allIssueRows]
  );
  const legacyRows = useMemo(
    () => allIssueRows.filter((row) => isLegacyInformationalIssue(row)),
    [allIssueRows]
  );

  const actionableSummary = useMemo(() => {
    const safeFixable = issueRows
      .filter((row) => row.fixable)
      .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const manualReview = issueRows
      .filter((row) => !row.fixable)
      .reduce((sum, row) => sum + Number(row.count || 0), 0);
    return {
      safeFixable,
      manualReview,
      totalIssues: safeFixable + manualReview,
      transactionIssues: Number(report?.summary?.transactionIssues || 0),
      legacyCount: legacyRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
    };
  }, [issueRows, legacyRows, report]);

  const hasSafeFix = actionableSummary.safeFixable > 0;

  const runSafeFix = useCallback(async () => {
    if (!report) return toast.error('Run Audit first.');
    if (!actionableSummary.safeFixable) return toast('No safe automatic fixes are currently available.');
    const ok = window.confirm(
      `Safe Fix can update ${actionableSummary.safeFixable} additive/unambiguous item(s).\n\n` +
      'It will NOT delete, merge or renumber records and will NOT edit transaction journal amounts/accounts.\n\nContinue?'
    );
    if (!ok) return;
    setFixing(true);
    setError('');
    try {
      const { data } = await client.post(`${API_BASE}/safe-fix`, { confirm: true });
      const result = data?.result;
      setReport(result?.report || null);
      setLastFix(result || null);
      toast.success(`Safe Fix completed: ${Number(result?.changed || 0)} additive field/link update(s)`);
      await loadHistory();
    } catch (err) {
      const message = err?.response?.data?.message || 'Safe Fix could not complete.';
      setError(message);
      toast.error(message);
    } finally {
      setFixing(false);
    }
  }, [report, actionableSummary.safeFixable, loadHistory]);

  const onManualResolved = useCallback(async (nextReport) => {
    if (nextReport) setReport(nextReport);
    await loadHistory();
  }, [loadHistory]);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1500, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems={{ md: 'center' }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <SecurityRounded color="success" />
            <Typography variant="h5" fontWeight={700}>Database Integrity</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Shows only data problems that can affect current MIS work.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant={report ? 'outlined' : 'contained'} startIcon={auditing ? <CircularProgress size={16} color="inherit" /> : <FactCheckRounded />} onClick={runAudit} disabled={auditing || fixing}>
            {report ? 'Re-audit' : 'Run Audit'}
          </Button>
          <Button variant="contained" color="success" startIcon={fixing ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRounded />} onClick={runSafeFix} disabled={!report || !hasSafeFix || auditing || fixing}>
            Safe Fix
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mt: 2 }}>
        <strong>Simple rule:</strong> if a finding is shown below, it can affect current data and may need attention. Old archived accounts, historical attendance duplicates and old PO lines without catalog UUIDs are treated as legacy information and do not require you to fix them.
      </Alert>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {lastFix && <Alert severity="success" sx={{ mt: 2 }}>Safe Fix completed with <strong>{Number(lastFix.changed || 0)}</strong> additive update(s). Deleted: 0 · Merged: 0 · Renumbered: 0 · Transaction journals changed: 0.</Alert>}

      {!report && (
        <Paper variant="outlined" sx={{ mt: 2.5, p: 4, textAlign: 'center' }}>
          <FactCheckRounded sx={{ fontSize: 46, color: 'text.secondary' }} />
          <Typography variant="h6" sx={{ mt: 1 }}>Check current data integrity</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Legacy historical records are kept out of your action list.</Typography>
          <Button variant="contained" onClick={runAudit} disabled={auditing} startIcon={auditing ? <CircularProgress size={16} color="inherit" /> : <FactCheckRounded />}>Run Audit</Button>
        </Paper>
      )}

      {report && (
        <>
          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 2.5 }}>
            <SummaryCard title="Needs attention" value={actionableSummary.totalIssues} helper="Current actionable findings only" tone={actionableSummary.totalIssues ? 'warning' : 'success'} />
            <SummaryCard title="Safe fixable" value={actionableSummary.safeFixable} helper="Can be fixed automatically" tone={actionableSummary.safeFixable ? 'success' : 'default'} />
            <SummaryCard title="Manual review" value={actionableSummary.manualReview} helper="Only records needing a decision" tone={actionableSummary.manualReview ? 'warning' : 'success'} />
            <SummaryCard title="Transaction review" value={actionableSummary.transactionIssues} helper="Accounting records needing review" tone={actionableSummary.transactionIssues ? 'warning' : 'success'} />
          </Stack>

          {actionableSummary.legacyCount > 0 && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <strong>{actionableSummary.legacyCount.toLocaleString()} legacy finding(s) hidden.</strong> These are historical/archived records retained for audit history and do not require action from you.
            </Alert>
          )}

          <Paper variant="outlined" sx={{ mt: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>Actionable findings</Typography>
                  <Typography variant="caption" color="text.secondary">Report generated {new Date(report.generatedAt).toLocaleString()}</Typography>
                </Box>
                <Chip size="small" label={`${issueRows.length} categories`} />
              </Stack>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Area</TableCell>
                    <TableCell>Issue</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell sx={{ minWidth: 240 }}>Examples / rule</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {issueRows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}><CheckCircleRounded color="success" sx={{ verticalAlign: 'middle', mr: 1 }} />No action required. Current MIS integrity checks are clear.</TableCell></TableRow>
                  ) : issueRows.map((row) => (
                    <TableRow key={row.key} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{row.area}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.label}</Typography>
                        {row.detail && <Typography variant="caption" color="text.secondary">{row.detail}</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{Number(row.count || 0).toLocaleString()}</TableCell>
                      <TableCell>{statusChip(row)}</TableCell>
                      <TableCell>
                        {(row.examples || []).slice(0, 3).map((value, index) => <Typography key={`${row.key}-${index}`} variant="caption" display="block" sx={{ overflowWrap: 'anywhere' }}>• {value}</Typography>)}
                        {(row.examples || []).length > 3 && <Typography variant="caption" color="text.secondary">+ more in this category</Typography>}
                      </TableCell>
                      <TableCell align="right">
                        {!row.fixable && REVIEWABLE_KEYS.has(row.key) ? (
                          <Button size="small" variant="outlined" color="warning" startIcon={<ManageSearchRounded />} onClick={() => setReviewIssue(row)}>Review</Button>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      <Paper variant="outlined" sx={{ mt: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center"><HistoryRounded fontSize="small" /><Typography variant="subtitle1" fontWeight={700}>Run history</Typography></Stack>
            <Button size="small" startIcon={<RefreshRounded />} onClick={loadHistory} disabled={historyLoading}>Refresh</Button>
          </Stack>
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow><TableCell>When</TableCell><TableCell>By</TableCell><TableCell>Action</TableCell><TableCell align="right">Changed</TableCell></TableRow></TableHead>
            <TableBody>
              {historyLoading && history.length === 0 ? (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3 }}><CircularProgress size={22} /></TableCell></TableRow>
              ) : history.length === 0 ? (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>No integrity runs recorded yet.</TableCell></TableRow>
              ) : history.map((row, index) => {
                const action = historyAction(row);
                return (
                  <TableRow key={`${row.at || 'run'}-${index}`}>
                    <TableCell>{row.at ? new Date(row.at).toLocaleString() : '—'}</TableCell>
                    <TableCell>{row.actor || 'Admin'}</TableCell>
                    <TableCell><Chip size="small" icon={action.icon} color={action.color} variant="outlined" label={action.label} /></TableCell>
                    <TableCell align="right">{Number(row.changed || 0).toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <DatabaseIntegrityReviewDialog open={Boolean(reviewIssue)} issue={reviewIssue} onClose={() => setReviewIssue(null)} onResolved={onManualResolved} />
    </Box>
  );
}
