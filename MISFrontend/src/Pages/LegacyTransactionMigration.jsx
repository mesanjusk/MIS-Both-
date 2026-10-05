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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectData, setInspectData] = useState(null);

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

  async function inspectRow(sourceKey, legacyId) {
    setInspectLoading(true);
    setInspectOpen(true);
    setInspectData(null);
    try {
      const response = await axios.get('/api/admin/legacy-transactions/inspect/' + encodeURIComponent(sourceKey) + '/' + encodeURIComponent(legacyId), { cache: false });
      setInspectData(response.data.result);
    } catch (err) {
      setInspectData({ error: err.response?.data?.message || err.message || 'Could not inspect row' });
    } finally {
      setInspectLoading(false);
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
          Step 1 runs a read-only audit. Rows outside FY 2025-26 and zero-value placeholder rows are ignored, not migrated. Any malformed row carrying a non-zero amount still blocks migration. Step 2 becomes available only when there are zero blockers inside FY 2025-26.
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
              <Chip label={'Orphan imports: ' + (report.orphanImportCount || 0)} color={report.orphanImportCount ? 'error' : 'success'} />
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
                    <TableCell align="right">Raw imports</TableCell>
                    <TableCell align="right">Orphans</TableCell>
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
                      <TableCell align="right">{Number(source.ignoredOutsideFinancialYear || 0) + Number(source.ignoredZeroValuePlaceholders || 0)}</TableCell>
                      <TableCell align="right">{source.valid || 0}</TableCell>
                      <TableCell align="right">{source.migrated || 0}</TableCell>
                      <TableCell align="right">{source.migratedRaw || 0}</TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={source.orphanImportCount || 0} color={source.orphanImportCount ? 'error' : 'success'} />
                      </TableCell>
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

            {(report.sources || []).some((source) => source.orphanImports?.length) && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={800} gutterBottom>Orphan imported transactions</Typography>
                  <Alert severity="error" sx={{ mb: 1.5 }}>
                    These imported Event_key values do not map back to a current row in their legacy source collection. Migration stays locked until they are reviewed.
                  </Alert>
                  <Stack spacing={1}>
                    {(report.sources || []).flatMap((source) =>
                      (source.orphanImports || []).map((row, index) => (
                        <Alert key={source.key + '-orphan-' + index} severity="error">
                          <strong>{source.label}</strong>
                          {' · Transaction ' + (row.transactionId ?? '—')}
                          {row.date ? ' · ' + row.date : ''}
                          {' · ' + row.eventKey}
                          {' · Debit ' + money(row.debit) + ' / Credit ' + money(row.credit)}
                          {row.description ? ' · ' + row.description : ''}
                        </Alert>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}

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
                          {row.legacyId && (row.issues || []).some((issue) => issue.severity === 'blocker') && (
                            <Button
                              size="small"
                              variant="outlined"
                              sx={{ ml: 1 }}
                              onClick={() => inspectRow(source.key, row.legacyId)}
                            >
                              Inspect
                            </Button>
                          )}
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

      <Dialog open={inspectOpen} onClose={() => setInspectOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Legacy Transaction Inspector</DialogTitle>
        <DialogContent dividers>
          {inspectLoading && <CircularProgress size={24} />}
          {!inspectLoading && inspectData?.error && <Alert severity="error">{inspectData.error}</Alert>}
          {!inspectLoading && inspectData && !inspectData.error && (
            <Stack spacing={1.5}>
              <Typography><strong>Source:</strong> {inspectData.sourceLabel} ({inspectData.collectionName})</Typography>
              <Typography><strong>Legacy ID:</strong> {inspectData.legacyId}</Typography>
              <Typography><strong>Date:</strong> {inspectData.transactionDate || '—'}</Typography>
              <Typography><strong>Description:</strong> {inspectData.description || '—'}</Typography>
              <Typography><strong>Payment mode:</strong> {inspectData.paymentMode || '—'}</Typography>
              <Typography><strong>Transaction ID:</strong> {inspectData.transactionId ?? '—'}</Typography>
              <Typography><strong>Transaction UUID:</strong> {inspectData.transactionUuid || '—'}</Typography>
              <Typography><strong>Order:</strong> {inspectData.orderNumber || inspectData.orderUuid || '—'}</Typography>
              <Typography><strong>Customer UUID:</strong> {inspectData.customerUuid || '—'}</Typography>
              <Typography><strong>Stored totals:</strong> Debit {String(inspectData.totalDebit ?? '—')} · Credit {String(inspectData.totalCredit ?? '—')}</Typography>
              <Divider />
              <Typography variant="h6" fontWeight={800}>Journal lines ({inspectData.journalEntry?.length || 0})</Typography>
              <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'grey.100', borderRadius: 1, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(inspectData.journalEntry || [], null, 2)}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Available legacy fields: {(inspectData.availableFields || []).join(', ')}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInspectOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
