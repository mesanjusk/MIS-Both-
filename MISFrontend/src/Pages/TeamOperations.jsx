import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import AssignmentIndRoundedIcon from '@mui/icons-material/AssignmentIndRounded';
import {
  PageContainer, SectionCard, DataTableWrapper, LoadingState, EmptyState, ErrorState,
} from '../Components/ui';
import OfficeAiPanel from '../Components/OfficeAiPanel';
import CustomerAiPanel from '../Components/CustomerAiPanel';
import { ROUTES } from '../constants/routes';
import {
  attendanceColor, stateColor, ownerRoleLabel, categoryLabel,
} from '../constants/operations';
import { fetchTeamStatus, fetchConfigurationWarnings } from '../services/operationsService';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TeamOperations() {
  const [date, setDate] = useState(todayIso);
  const [status, setStatus] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, warningsRes] = await Promise.all([
        fetchTeamStatus(date),
        fetchConfigurationWarnings(),
      ]);
      setStatus(statusRes.data?.result || null);
      setWarnings(warningsRes.data?.result || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load team status');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => status?.rows || [], [status]);
  const responsibilities = status?.responsibilities || [];
  const escalated = status?.escalated || [];
  const offStaffLine = status?.handledOffStaffLine || {};

  const priorityStrip = useMemo(
    () => rows.filter((row) => row.priority),
    [rows],
  );

  const blockingWarnings = warnings.filter((warning) => warning.level === 'error');

  return (
    <PageContainer
      title="Team Operations"
      subtitle="Live team status, resolved from attendance and the configured responsibility chain"
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
          <Button
            size="small"
            component={RouterLink}
            to={ROUTES.OPERATIONS_RESPONSIBILITIES}
            startIcon={<AssignmentIndRoundedIcon />}
          >
            Responsibilities
          </Button>
          <Button
            size="small"
            component={RouterLink}
            to={ROUTES.OPERATIONS_SETTINGS}
            startIcon={<SettingsRoundedIcon />}
          >
            Settings
          </Button>
        </>
      )}
    >
      {error ? <ErrorState message={error} /> : null}

      {escalated.length ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          <Typography variant="subtitle2">
            ⚠️ NO AVAILABLE OWNER — {escalated.length} responsibilit{escalated.length === 1 ? 'y' : 'ies'}
          </Typography>
          <Typography variant="body2">
            {escalated.map((item) => item.name).join(', ')} — the primary and every configured backup are unavailable.
            Escalated to management; nothing has been auto-assigned.
          </Typography>
        </Alert>
      ) : null}

      {blockingWarnings.length ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          <Typography variant="subtitle2">{blockingWarnings.length} configuration problem(s)</Typography>
          <Stack component="ul" sx={{ pl: 2, m: 0 }}>
            {blockingWarnings.slice(0, 5).map((warning, index) => (
              <li key={`${warning.responsibility_uuid || 'general'}-${index}`}>
                <Typography variant="body2">
                  {warning.responsibility ? `${warning.responsibility}: ` : ''}{warning.message}
                </Typography>
              </li>
            ))}
          </Stack>
        </Alert>
      ) : null}

      <OfficeAiPanel />
      <CustomerAiPanel />

      {loading ? <LoadingState label="Loading team status..." /> : null}

      {!loading && priorityStrip.length ? (
        <SectionCard
          title="Operational Priorities"
          subtitle="Assigned from each operator's profile — never hard-coded. Includes the owner and the AI assistant when they hold a code."
        >
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {priorityStrip.map((row) => (
              <Box
                key={row.User_uuid}
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  p: 1,
                  minWidth: 200,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" color="primary" label={row.priority} />
                  <Typography variant="subtitle2" noWrap>{row.roleTitle || '—'}</Typography>
                </Stack>
                <Typography variant="body2" noWrap>{row.name || row.User_name}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                  <Chip size="small" color={attendanceColor(row.attendanceStatus)} label={row.attendanceStatus} />
                  <Chip size="small" variant="outlined" color={stateColor(row.operationalState)} label={row.operationalState} />
                </Stack>
              </Box>
            ))}
          </Stack>
        </SectionCard>
      ) : null}

      {!loading && (offStaffLine.byVirtualOperators || offStaffLine.byAlwaysAvailable) ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Typography variant="body2" color="text.secondary">Handled off the staff line:</Typography>
          <Chip size="small" label={`${offStaffLine.byVirtualOperators || 0} automated`} />
          <Chip size="small" label={`${offStaffLine.byAlwaysAvailable || 0} always available`} />
        </Stack>
      ) : null}

      {!loading ? (
        <SectionCard title="Team Status">
          <DataTableWrapper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Attendance</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>Current Task</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell align="right">Overdue</TableCell>
                  <TableCell align="right">Covering</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.User_uuid} hover>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2">{row.name || row.User_name}</Typography>
                        {row.isVirtual ? (
                          <Chip size="small" color="secondary" variant="outlined" label="Automated" />
                        ) : null}
                        {!row.isVirtual && row.alwaysAvailable ? (
                          <Chip size="small" color="info" variant="outlined" label="Always on" />
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell>{row.priority ? <Chip size="small" label={row.priority} /> : '—'}</TableCell>
                    <TableCell>{row.roleTitle || '—'}</TableCell>
                    <TableCell>
                      <Tooltip title={row.attendanceDetail || ''}>
                        <Chip size="small" color={attendanceColor(row.attendanceStatus)} label={row.attendanceStatus} />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={stateColor(row.operationalState)} label={row.operationalState} />
                    </TableCell>
                    <TableCell>{row.currentTask || '—'}</TableCell>
                    <TableCell align="right">{row.pending}</TableCell>
                    <TableCell align="right">
                      {row.overdue ? <Chip size="small" color="error" label={row.overdue} /> : 0}
                    </TableCell>
                    <TableCell align="right">{row.transferredIn || 0}</TableCell>
                    <TableCell align="right">
                      {row.isVirtual ? (
                        // A virtual operator has no user profile to open; it is
                        // configured under Settings → Operations instead.
                        <Button size="small" component={RouterLink} to={ROUTES.OPERATIONS_SETTINGS}>
                          Configure
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          component={RouterLink}
                          to={`${ROUTES.OPERATIONS_USERS}/${row.User_uuid}`}
                        >
                          Profile
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <EmptyState
                        title="No active users"
                        description="Users become active here once Active is ticked on their operational profile."
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </SectionCard>
      ) : null}

      {!loading ? (
        <SectionCard
          title="Responsibility Coverage"
          subtitle="Who actually owns each responsibility right now, given today's attendance"
        >
          <DataTableWrapper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Responsibility</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Owner Now</TableCell>
                  <TableCell>Via</TableCell>
                  <TableCell>Chain</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {responsibilities.map((item) => (
                  <TableRow key={item.responsibility_uuid} hover>
                    <TableCell>
                      {item.name}
                      {item.isCritical ? <Chip size="small" color="warning" label="Critical" sx={{ ml: 0.5 }} /> : null}
                    </TableCell>
                    <TableCell>{categoryLabel(item.category)}</TableCell>
                    <TableCell>
                      {item.currentOwner
                        ? item.currentOwner.userName
                        : <Chip size="small" color="error" label="⚠️ NO AVAILABLE OWNER" />}
                    </TableCell>
                    <TableCell>
                      {item.currentOwner
                        ? <Chip size="small" variant="outlined" label={ownerRoleLabel(item.currentOwner.role)} />
                        : 'Escalated'}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                        {item.chain.map((slot) => (
                          <Tooltip key={slot.role} title={slot.reason || ''}>
                            <Chip
                              size="small"
                              variant={slot.available ? 'filled' : 'outlined'}
                              color={slot.available ? 'success' : 'default'}
                              label={`${ownerRoleLabel(slot.role)}: ${slot.userName || '—'}`}
                            />
                          </Tooltip>
                        ))}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!responsibilities.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        title="No responsibilities configured"
                        description="Add them under Settings → Operations → Responsibilities."
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </SectionCard>
      ) : null}

      {!loading && status?.unownedTasks?.length ? (
        <SectionCard title="Tasks With No Available Owner">
          <Divider sx={{ mb: 1 }} />
          <Stack spacing={0.5}>
            {status.unownedTasks.map((task) => (
              <Typography key={task._id} variant="body2">
                ⚠️ {task.Usertask_name} — escalated to management
              </Typography>
            ))}
          </Stack>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
