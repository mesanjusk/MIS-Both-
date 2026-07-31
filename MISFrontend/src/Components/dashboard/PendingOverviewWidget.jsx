import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import { fetchPendingTasksOverview, assignOrderToUser } from '../../services/orderService';
import { fetchUsers } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';

export default function PendingOverviewWidget() {
  const { userName } = useAuth();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [assigningId, setAssigningId] = useState('');

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
    fetchUsers()
      .then((res) => setUsers(res?.data?.result || []))
      .catch(() => setUsers([]));
  }, []);

  const openAssignMenu = (event, task) => {
    setMenuAnchor(event.currentTarget);
    setActiveTask(task);
  };

  const closeAssignMenu = () => {
    setMenuAnchor(null);
    setActiveTask(null);
  };

  // Same endpoint/schema OrderUpdate.jsx's "Assigned To" control writes
  // through — one writer for order.assignedTo / Status[].Assigned, whichever
  // screen it's driven from.
  const handleAssign = async (assignedTo) => {
    if (!activeTask) return;
    const orderId = activeTask.orderId;
    closeAssignMenu();
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

          <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size="small" sx={{ minWidth: 420 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Order</TableCell>
                  <TableCell>Stage / Task</TableCell>
                  <TableCell>Due</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {overview.tasks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" color="text.secondary">No pending tasks right now.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {overview.tasks.map((task) => {
                  const isUnassigned = task.assignedTo === 'Unassigned';
                  const isBusy = assigningId === task.orderId;
                  return (
                    <TableRow key={task.orderId}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title={isUnassigned ? 'Assign this task' : `Reassign — currently ${task.assignedTo}`}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={isBusy}
                                onClick={(event) => openAssignMenu(event, task)}
                                sx={{ color: isUnassigned ? 'warning.main' : 'action.active' }}
                              >
                                {isBusy ? (
                                  <CircularProgress size={16} />
                                ) : isUnassigned ? (
                                  <PersonAddAlt1RoundedIcon fontSize="small" />
                                ) : (
                                  <SwapHorizRoundedIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Typography variant="body2" fontWeight={600}>#{task.orderNumber}</Typography>
                          {!isUnassigned && (
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {task.assignedTo}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{task.task}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {task.overdue ? (
                          <Chip size="small" color="error" label="Overdue" />
                        ) : task.dueDate ? (
                          new Date(task.dueDate).toLocaleDateString()
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      ) : null}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeAssignMenu}>
        {users.length === 0 && (
          <MenuItem disabled>No users found</MenuItem>
        )}
        {users.map((user) => (
          <MenuItem key={user._id} onClick={() => handleAssign(user._id)}>
            <ListItemText>{user.User_name}</ListItemText>
          </MenuItem>
        ))}
        <MenuItem onClick={() => handleAssign('Customer')}>
          <ListItemIcon><SupportAgentRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Waiting on customer</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
