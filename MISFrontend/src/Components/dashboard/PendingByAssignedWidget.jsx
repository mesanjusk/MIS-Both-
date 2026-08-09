import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import OrderTaskList from './OrderTaskList';
import { fetchPendingTasksOverview } from '../../services/orderService';
// Status.AssignedType on the order only stores the coarse 'user'/'vendor'
// split, so the badge here is just Employee vs Account Payable — the Team
// & Partners report page is where the full detail shows.
const ASSIGNED_TYPE_BADGE = { user: 'Employee', vendor: 'Account Payable' };

// Read-only "who has what" view: a single-assignee filter over the same
// admin task-overview data the Workflow widget's columns are built from
// (GET /api/orders/tasks/overview already groups this server-side into
// `byUser`, sorted by count descending) — no separate backend work needed.
// Deliberately no Assign/Move actions here; those already live on the
// Workflow board itself, this widget is just a quick per-person lookup.
export default function PendingByAssignedWidget() {
  const [overview, setOverview] = useState(null);
  const [selected, setSelected] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchPendingTasksOverview();
      const data = res?.data || null;
      setOverview(data);
      setSelected((prev) => {
        if (prev && data?.byUser?.some((g) => g.userName === prev)) return prev;
        return data?.byUser?.[0]?.userName || '';
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load pending tasks.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byUser = overview?.byUser || [];
  const selectedGroup = useMemo(
    () => byUser.find((g) => g.userName === selected) || null,
    [byUser, selected]
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Pending by Assigned</Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} disabled={isLoading}>
            <RefreshRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {isLoading && !overview ? (
        <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>
      ) : byUser.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No pending tasks.
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
            <TextField
              select
              size="small"
              label="Assigned to"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              {byUser.map((g) => (
                <MenuItem key={g.userName} value={g.userName}>
                  {g.userName} · {g.count}{g.overdueCount ? ` (${g.overdueCount} overdue)` : ''}
                </MenuItem>
              ))}
            </TextField>
            {selectedGroup?.assignedToType && ASSIGNED_TYPE_BADGE[selectedGroup.assignedToType] && (
              <Chip size="small" variant="outlined" label={ASSIGNED_TYPE_BADGE[selectedGroup.assignedToType]} />
            )}
            {selectedGroup && (
              <Chip
                size="small"
                label={`${selectedGroup.count} pending`}
                sx={{ fontWeight: 600 }}
              />
            )}
            {selectedGroup?.overdueCount > 0 && (
              <Chip size="small" color="error" label={`${selectedGroup.overdueCount} overdue`} />
            )}
          </Stack>

          <OrderTaskList
            tasks={selectedGroup?.tasks || []}
            view="table"
            emptyMessage="Nothing pending for this person."
          />
        </>
      )}
    </Box>
  );
}
