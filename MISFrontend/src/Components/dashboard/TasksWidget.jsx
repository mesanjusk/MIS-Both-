import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import ViewModuleRoundedIcon from '@mui/icons-material/ViewModuleRounded';
import UserTask from '../../Pages/userTask';
import OrderTaskList from './OrderTaskList';
import { fetchMyOrderTasks, fetchPendingTasksOverview, assignOrderToUser } from '../../services/orderService';
import { fetchUsers } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';

const VIEW_KEY = 'mis_tasks_widget_view';

function normalizeMyOrder(order) {
  const latest = Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
  const assigned = latest?.Assigned;
  return {
    orderId: String(order?._id || order?.Order_uuid || ''),
    orderNumber: order?.Order_Number,
    customerName: order?.customerName || '',
    stage: order?.stage,
    task: latest?.Task || order?.stage || 'Task',
    assignedTo: assigned && assigned !== 'None' ? assigned : 'Unassigned',
    assignedBy: latest?.AssignedBy || '',
    dueDate: order?.dueDate,
    overdue: Boolean(order?.overdue),
  };
}

// Replaces the previous My Tasks / Pending Task Queue / Team Pending Tasks
// trio of widgets. One data source (the admin overview when available,
// falling back to the caller's own queue) drives both sections, so "mine"
// and "everyone else's" are always the same schema, just filtered.
export default function TasksWidget() {
  const { userName, isAdmin } = useAuth();
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'table');
  const [overview, setOverview] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      if (isAdmin) {
        const res = await fetchPendingTasksOverview();
        setOverview(res?.data || null);
      } else {
        const res = await fetchMyOrderTasks(userName);
        setMyOrders(res?.data?.orders || []);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load pending tasks.');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, userName]);

  useEffect(() => {
    if (!userName) return;
    load();
    fetchUsers().then((res) => setUsers(res?.data?.result || [])).catch(() => setUsers([]));
  }, [load, userName]);

  const handleViewChange = (_event, next) => {
    if (!next) return;
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  };

  const handleAssign = async (orderId, assignedTo) => {
    setAssigningId(orderId);
    try {
      await assignOrderToUser(orderId, { assignedTo, assignedBy: userName });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update assignment.');
    } finally {
      setAssigningId('');
    }
  };

  const { mine, others } = useMemo(() => {
    if (isAdmin) {
      const all = overview?.tasks || [];
      return {
        mine: all.filter((t) => t.assignedTo === userName),
        others: all.filter((t) => t.assignedTo !== userName),
      };
    }
    return { mine: myOrders.map(normalizeMyOrder), others: [] };
  }, [isAdmin, overview, myOrders, userName]);

  return (
    <Box>
      <UserTask />

      <Divider sx={{ my: 1.5 }} />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Pending tasks</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <ToggleButtonGroup size="small" exclusive value={view} onChange={handleViewChange}>
            <ToggleButton value="table" sx={{ py: 0.25, px: 0.75 }}>
              <Tooltip title="Table view"><ViewListRoundedIcon fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="card" sx={{ py: 0.25, px: 0.75 }}>
              <Tooltip title="Card view"><ViewModuleRoundedIcon fontSize="small" /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={isLoading}>
              <RefreshRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {isLoading && !overview && !myOrders.length ? (
        <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>
      ) : (
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Your tasks
              </Typography>
              {mine.length > 0 && <Chip size="small" label={mine.length} color="primary" />}
            </Stack>
            <OrderTaskList
              tasks={mine}
              view={view}
              users={users}
              assigningId={assigningId}
              onAssign={handleAssign}
              emptyMessage="You have no pending tasks right now."
            />
          </Box>

          {isAdmin && (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Pending with the rest of the team
                </Typography>
                {others.length > 0 && <Chip size="small" label={others.length} />}
                {overview?.unassignedCount > 0 && (
                  <Chip size="small" color="warning" label={`${overview.unassignedCount} unassigned`} />
                )}
              </Stack>
              <OrderTaskList
                tasks={others}
                view={view}
                users={users}
                assigningId={assigningId}
                onAssign={handleAssign}
                emptyMessage="Nothing pending elsewhere."
              />
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}
