import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { fetchPendingTasksOverview } from '../../services/orderService';

export default function PendingOverviewWidget() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchPendingTasksOverview();
      setOverview(res?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load pending tasks overview.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Team pending tasks</Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} disabled={isLoading}>
            <RefreshRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {isLoading && !overview ? (
        <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>
      ) : overview ? (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${overview.totalCount} pending`} color="primary" />
            <Chip size="small" label={`${overview.overdueCount} overdue`} color={overview.overdueCount ? 'error' : 'default'} />
            <Chip size="small" label={`${overview.unassignedCount} unassigned`} color={overview.unassignedCount ? 'warning' : 'default'} />
          </Stack>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Stage / Task</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell>Due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overview.tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">No pending tasks right now.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {overview.tasks.map((task) => (
                <TableRow key={task.orderId}>
                  <TableCell>#{task.orderNumber}</TableCell>
                  <TableCell>{task.task}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={task.assignedTo}
                      color={task.assignedTo === 'Unassigned' ? 'warning' : 'default'}
                      variant={task.assignedTo === 'Unassigned' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    {task.overdue ? (
                      <Chip size="small" color="error" label="Overdue" />
                    ) : task.dueDate ? (
                      new Date(task.dueDate).toLocaleDateString()
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      ) : null}
    </Box>
  );
}
