import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import axios from '../apiClient';

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
}

function SummaryCard({ label, data }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography variant="h5" fontWeight={800}>{data?.count || 0} transactions</Typography>
        <Typography variant="body2" color="text.secondary">
          Debit {money(data?.totalDebit)} · Credit {money(data?.totalCredit)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {data?.minDate || '—'} to {data?.maxDate || '—'}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function LegacyTransactionMigration() {
  const [report, setReport] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canMigrate = Boolean(report?.canMigrate) && confirmation === 'MIGRATE 2025-26' && !migrating;
  const totalLegacy = useMemo(
    () => (report?.sources || []).reduce((sum, source) => sum + Number(source.count || 0), 0),
    [report]
  );

  async function runAudit() {
    setLoadingAudit(true);
    setError('');
    setMessage('');
    try {
      const response = await axios.get('/api/admin/legacy-transactions/audit', { cache: false });
      setReport(response.data.result);
      setMessage(response.data.result?.canMigrate
        ? 'Audit passed. Review the totals below, then type the confirmation phrase to migrate.'
        : 'Audit found blockers. Migration is disabled until every blocker is resolved.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Audit failed');
      if (err.response?.data?.result) setReport(err.response.data.result);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function runMigration() {
    if (!canMigrate) return;
    setMigrating(true);
    setError('');
    setMessage('');
    try {
      const response = await axios.post('/api/admin/legacy-transactions/migrate', { confirmation });
      setReport(response.data.result?.verification || null);
      setConfirmation('');
      setMessage('Migration completed. The verification below is a fresh post-migration audit.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Migration failed');
      const result = err.response?.data?.result;
      if (result?.sources) setReport(result);
    } finally {
      setMigrating(false);
    }
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Legacy Transaction Migration</Typography>
          <Typography color="text.secondary">
            Browser-only migration into the single transactions collection. Source collections are read-only and are never deleted.
          </Typography>
        </Box>

        <Alert severity="info">
          Step 1 runs a read-only audit. Rows outside FY 2025-26 are ignored, not migrated. Step 2 becomes available only when there are zero blockers inside FY 2025-26. Re-running migration is safe because every old row gets a unique migration fingerprint.
        </Alert>

        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity={report?.canMigrate ? 'success' : 'warning'}>{message}</Alert>}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="contained" onClick={runAudit} disabled={loadingAudit || migrating}>
            {loadingAudit ? <CircularProgress size={20} /> : '1. Run Fresh Audit'}
          </Button>
          <TextField
            size="small"
            label="Confirmation phrase"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="MIGRATE 2025-26"
            sx={{ minWidth: 260 }}
            disabled={!report?.canMigrate || migrating}
          />
          <Button color="warning" variant="contained" onClick={runMigration} disabled={!canMigrate}>
            {migrating ? <CircularProgress size={20} /> : '2. Migrate 2025-26'}
          </Button>
        </Stack>

        {report && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Chip label={'Legacy rows: ' + totalLegacy} />
              <Chip label={'Blockers: ' + (report.blockers || 0)} color={report.blockers ? 'error' : 'success'} />
              <Chip label={report.canMigrate ? 'Ready to migrate' : 'Migration locked'} color={report.canMigrate ? 'success' : 'warning'} />
              <Typography variant="caption" color="text.secondary">
                Audit: {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : '—'}
              </Typography>
            </Stack>

            <TableContainer component={Card} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Source collection</TableCell>
                    <TableCell>Expected period</TableCell>
                    <TableCell align="right">Rows</TableCell>
                    <TableCell align="right">FY Eligible</TableCell>
                    <TableCell align="right">Ignored</TableCell>
                    <TableCell align="right">Valid</TableCell>
                    <TableCell align="right">Migrated</TableCell>
                    <TableCell align="right">Remaining</TableCell>
                    <TableCell align="right">Blockers</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(report.sources || []).map((source) => (
                    <TableRow key={source.key}>
                      <TableCell>
                        <Typography fontWeight={700}>{source.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{source.collectionName || 'NOT FOUND'}</Typography>
                      </TableCell>
                      <TableCell>{source.expectedStart} → {source.expectedEnd}</TableCell>
                      <TableCell align="right">{source.count || 0}</TableCell>
                      <TableCell align="right">{source.eligible || 0}</TableCell>
                      <TableCell align="right">{source.ignoredOutsideFinancialYear || 0}</TableCell>
                      <TableCell align="right">{source.valid || 0}</TableCell>
                      <TableCell align="right">{source.migrated || 0}</TableCell>
                      <TableCell align="right">{source.remaining || 0}</TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={source.blockers || 0} color={source.blockers ? 'error' : 'success'} />
                      </TableCell>
                      <TableCell align="right">{money(source.totalDebit)}</TableCell>
                      <TableCell align="right">{money(source.totalCredit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {(report.sources || []).some((source) => source.issues?.length) && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={800} gutterBottom>Audit issues & ignored rows</Typography>
                  <Stack spacing={1}>
                    {(report.sources || []).flatMap((source) =>
                      (source.issues || []).map((row, index) => (
                        <Alert
                          key={source.key + '-' + index}
                          severity={(row.issues || []).some((issue) => issue.severity === 'blocker') ? 'error' : 'warning'}
                        >
                          <strong>{source.label}</strong>
                          {row.legacyId ? ' · row ' + row.legacyId : ''}
                          {row.date ? ' · ' + row.date : ''}
                          {' — '}
                          {(row.issues || []).map((issue) => issue.message).join('; ')}
                        </Alert>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Box>
              <Typography variant="h6" fontWeight={800} gutterBottom>Unified transactions by financial year</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <SummaryCard label="FY 2025-26" data={report.unifiedByFinancialYear?.['2025-26']} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SummaryCard label="FY 2026-27" data={report.unifiedByFinancialYear?.['2026-27']} />
                </Grid>
              </Grid>
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
