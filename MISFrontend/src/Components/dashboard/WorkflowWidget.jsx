import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
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
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import UserTask from '../../Pages/userTask';
import OrderTaskList from './OrderTaskList';
import DesignFilesWidget from './DesignFilesWidget';
import { fetchMyOrderTasks, fetchPendingTasksOverview, assignOrderToUser } from '../../services/orderService';
import { fetchUsers } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';

const VIEW_KEY = 'mis_workflow_widget_view';

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

// Groups "pending with the rest of the team" by its current workflow/stage
// name (Status.Task — New Design, Approval, Hold, Print, Fitting, etc.) so
// the widget answers "what stage is stuck, and with whom" at a glance,
// instead of one flat list.
function groupByStage(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const key = task.task || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
}

// Replaces the previous separate "Tasks" and "Design Files" home-screen
// widgets — one card, so a stuck order's current stage, its owner, and the
// design file behind it are all in one place instead of split across two
// widgets that didn't reference each other.
export default function WorkflowWidget() {
  const { userName, isAdmin } = useAuth();
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'table');
  const [overview, setOverview] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState('');
  const [collapsedStages, setCollapsedStages] = useState({});
  const [designFilesOpen, setDesignFilesOpen] = useState(false);

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

  const stageGroups = useMemo(() => groupByStage(others), [others]);

  const toggleStage = (stage) => {
    setCollapsedStages((prev) => ({ ...prev, [stage]: !prev[stage] }));
  };

  return (
    <Box>
      <UserTask />

      <Divider sx={{ my: 1.5 }} />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Workflow</Typography>
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
                  Pending, by stage
                </Typography>
                {others.length > 0 && <Chip size="small" label={others.length} />}
                {overview?.unassignedCount > 0 && (
                  <Chip size="small" color="warning" label={`${overview.unassignedCount} unassigned`} />
                )}
              </Stack>
              {stageGroups.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  Nothing pending elsewhere.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {stageGroups.map(([stage, tasks]) => {
                    const isOpen = !collapsedStages[stage];
                    return (
                      <Box key={stage} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          onClick={() => toggleStage(stage)}
                          sx={{ px: 1.25, py: 0.75, bgcolor: 'rgba(240,253,244,0.6)', cursor: 'pointer' }}
                        >
                          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{stage}</Typography>
                          <Chip size="small" label={tasks.length} />
                          <ExpandMoreRoundedIcon
                            sx={{ fontSize: 18, color: 'text.disabled', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                          />
                        </Stack>
                        <Collapse in={isOpen}>
                          <Box sx={{ p: 1 }}>
                            <OrderTaskList
                              tasks={tasks}
                              view={view}
                              users={users}
                              assigningId={assigningId}
                              onAssign={handleAssign}
                              emptyMessage="Nothing here."
                            />
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}

          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={() => setDesignFilesOpen((v) => !v)}
              sx={{ px: 1.25, py: 0.75, bgcolor: 'rgba(207,250,254,0.5)', cursor: 'pointer' }}
            >
              <FolderOpenRoundedIcon sx={{ fontSize: 17, color: '#0891b2' }} />
              <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>Design Files</Typography>
              <ExpandMoreRoundedIcon
                sx={{ fontSize: 18, color: 'text.disabled', transform: designFilesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </Stack>
            <Collapse in={designFilesOpen} unmountOnExit>
              <Box sx={{ p: 1 }}>
                <DesignFilesWidget />
              </Box>
            </Collapse>
          </Box>
        </Stack>
      )}
    </Box>
  );
}
