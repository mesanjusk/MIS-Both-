import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import UserTask from '../../Pages/userTask';
import OrderTaskList from './OrderTaskList';
import DesignFilesWidget from './DesignFilesWidget';
import { fetchMyOrderTasks, fetchPendingTasksOverview, assignOrderToUser, moveOrderStage } from '../../services/orderService';
import { fetchUsers } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { WORKFLOW_SECTIONS } from '../../constants/orderStages';

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

const STAGE_TO_SECTION = new Map(
  WORKFLOW_SECTIONS.flatMap((section) => section.stages.map((stage) => [stage, section.key]))
);

// Many older orders never got a granular `stage` (they still carry the old
// coarse 'design' value, or none at all) but their real progress is tracked
// as free-text in Status.Task — "Printing", "Fitting", "Post Printing" etc.
// Without this, every one of those orders falls back to the Design column
// regardless of where the order actually is. Checked in this order because
// "Ready to Print" contains both "ready" and "print" — print wins there.
function guessSectionFromLabel(label) {
  const text = String(label || '').toLowerCase();
  if (text.includes('print')) return 'print';
  if (/(fitting|bind|pack|post)/.test(text)) return 'postPrint';
  if (/(ready|deliver)/.test(text)) return 'ready';
  return 'design';
}

// Buckets tasks into the four production-pipeline columns (Design, Print,
// Post Print, Ready & Archive) instead of the previous flat "by stage name"
// grouping — matches how the team actually walks an order through the shop.
function groupBySection(tasks) {
  const buckets = new Map(WORKFLOW_SECTIONS.map((section) => [section.key, []]));
  for (const task of tasks) {
    const key = STAGE_TO_SECTION.get(task.stage) || guessSectionFromLabel(task.task || task.stage);
    buckets.get(key).push(task);
  }
  return buckets;
}

// Replaces the previous separate "Tasks" and "Design Files" home-screen
// widgets — one card, so a stuck order's current stage, its owner, and the
// design file behind it are all in one place instead of split across two
// widgets that didn't reference each other. Attendance (start/end day) has
// moved out of here entirely, next to the user's name in the top nav.
export default function WorkflowWidget() {
  const { userName, isAdmin } = useAuth();
  const [overview, setOverview] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState('');
  const [movingId, setMovingId] = useState('');

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

  // Lets a card be moved to a different pipeline column directly from the
  // widget. The backend normalizes any pre-migration legacy stage value it
  // finds on the order before validating the move, so this also "fixes" an
  // old stuck order (e.g. one still holding the old 'design' value) the
  // moment it's moved — no separate data migration needed.
  const handleMoveStage = async (orderId, stage) => {
    setMovingId(orderId);
    try {
      await moveOrderStage(orderId, stage);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to move order.');
    } finally {
      setMovingId('');
    }
  };

  const allTasks = useMemo(() => {
    if (isAdmin) return overview?.tasks || [];
    return myOrders.map(normalizeMyOrder);
  }, [isAdmin, overview, myOrders]);

  const sections = useMemo(() => groupBySection(allTasks), [allTasks]);

  return (
    <Box>
      <UserTask />

      <Divider sx={{ my: 1.5 }} />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Workflow</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {isAdmin && overview?.unassignedCount > 0 && (
            <Chip size="small" color="warning" label={`${overview.unassignedCount} unassigned`} />
          )}
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
        <Box sx={{ display: 'flex', gap: 1.25, overflowX: 'auto', pb: 0.5, alignItems: 'flex-start' }}>
          {WORKFLOW_SECTIONS.map((section) => {
            const tasks = sections.get(section.key) || [];
            const isDesign = section.key === 'design';
            return (
              <Box
                key={section.key}
                sx={{
                  flex: isDesign ? '1 1 420px' : '0 0 280px',
                  width: isDesign ? undefined : 280,
                  minWidth: isDesign ? 380 : 280,
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  maxHeight: 560,
                  overflow: 'hidden',
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    px: 1.25,
                    py: 0.85,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'rgba(240,253,244,0.6)',
                    flexShrink: 0,
                  }}
                >
                  <Typography variant="body2" fontWeight={800} sx={{ flex: 1 }}>{section.label}</Typography>
                  <Chip size="small" label={tasks.length} />
                </Stack>

                <Box sx={{ overflowY: 'auto', p: 1, flex: 1, minHeight: 0 }}>
                  <OrderTaskList
                    tasks={tasks}
                    view="stack"
                    users={users}
                    assigningId={assigningId}
                    onAssign={handleAssign}
                    movingId={movingId}
                    onMoveStage={handleMoveStage}
                    emptyMessage="Nothing here."
                  />

                  {isDesign && (
                    <Box sx={{ mt: tasks.length ? 1.5 : 0 }}>
                      {tasks.length > 0 && <Divider sx={{ mb: 1.5 }} />}
                      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mb: 0.75 }}>
                        <FolderOpenRoundedIcon sx={{ fontSize: 15, color: '#0891b2' }} />
                        <Typography
                          variant="caption"
                          fontWeight={800}
                          color="text.disabled"
                          sx={{ textTransform: 'uppercase', letterSpacing: 0.7 }}
                        >
                          Design Files
                        </Typography>
                      </Stack>
                      <DesignFilesWidget />
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
