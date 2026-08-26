import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Box, Button, Chip, Grid, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
  PageContainer, SectionCard, DataTableWrapper, LoadingState, EmptyState, ErrorState,
} from '../Components/ui';
import { ownerRoleLabel } from '../constants/operations';
import { fetchOperationsDailyReport } from '../services/operationsService';

const todayIso = () => new Date().toISOString().slice(0, 10);

const Stat = ({ label, value, color }) => (
  <Box
    sx={{
      border: (theme) => `1px solid ${theme.palette.divider}`,
      borderRadius: 2,
      p: 1,
      textAlign: 'center',
      minWidth: 96,
    }}
  >
    <Typography variant="h6" color={color || 'text.primary'}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Box>
);

Stat.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  color: PropTypes.string,
};

/**
 * §25 — the closing team report. Order, production and money figures already
 * have their own report screens; this one covers people, tasks and coverage.
 */
export default function OperationsDailyReport() {
  const [date, setDate] = useState(todayIso);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchOperationsDailyReport(date);
      setReport(res.data?.result || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load the daily report');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  return (
    <PageContainer
      title="Team Daily Report"
      subtitle="Attendance, task completion and responsibility coverage for the day"
      actions={(
        <>
          <TextField
            size="small"
            type="date"
            label="Date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>
        </>
      )}
    >
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Building report..." /> : null}

      {!loading && report ? (
        <>
          <SectionCard title="Attendance">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Stat label="Present" value={report.attendance.present} color="success.main" />
              <Stat label="Absent" value={report.attendance.absent} color="error.main" />
              <Stat label="Late" value={report.attendance.late} color="warning.main" />
              <Stat label="On Leave" value={report.attendance.leave} />
              <Stat label="Half Day" value={report.attendance.halfDay} />
              <Stat label="Weekly Off" value={report.attendance.weeklyOff} />
              <Stat label="Day Closed" value={report.attendance.dayClosed} />
            </Stack>
          </SectionCard>

          <SectionCard title="Tasks">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Stat label="Total" value={report.tasks.total} />
              <Stat label="Completed" value={report.tasks.completed} color="success.main" />
              <Stat label="Pending" value={report.tasks.pending} />
              <Stat label="Overdue" value={report.tasks.overdue} color="error.main" />
              <Stat label="Escalated" value={report.tasks.escalated} color="error.main" />
              <Stat label="Reassigned" value={report.tasks.reassigned} color="warning.main" />
            </Stack>
          </SectionCard>

          <SectionCard title="Responsibility Coverage">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Stat label="Total" value={report.responsibilities.total} />
              <Stat label="By primary" value={report.responsibilities.coveredByPrimary} color="success.main" />
              <Stat label="By backup" value={report.responsibilities.coveredByBackup} color="warning.main" />
              <Stat label="Escalated" value={report.responsibilities.escalated} color="error.main" />
              <Stat label="Checklist done" value={report.checklist.completed} />
              <Stat label="Checklist skipped" value={report.checklist.skipped} />
            </Stack>
            {report.responsibilities.escalatedList?.length ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                ⚠️ NO AVAILABLE OWNER: {report.responsibilities.escalatedList.join(', ')}
              </Alert>
            ) : null}
          </SectionCard>

          <SectionCard title="Reassigned Tasks" subtitle="Covered by a backup — the configured owner is unchanged">
            <DataTableWrapper>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    <TableCell>Covered by</TableCell>
                    <TableCell>Via</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.reassignedTasks.map((row, index) => (
                    <TableRow key={`${row.task}-${index}`} hover>
                      <TableCell>{row.task}</TableCell>
                      <TableCell>{row.currentOwner || '—'}</TableCell>
                      <TableCell><Chip size="small" variant="outlined" label={ownerRoleLabel(row.role)} /></TableCell>
                    </TableRow>
                  ))}
                  {!report.reassignedTasks.length ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <EmptyState title="Nothing reassigned" description="Every task stayed with its configured owner." />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </DataTableWrapper>
          </SectionCard>

          <Grid container>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">
                Order, production, logistics and marketing figures are covered by the existing
                Business Reports screens and are not duplicated here.
              </Typography>
            </Grid>
          </Grid>
        </>
      ) : null}
    </PageContainer>
  );
}
