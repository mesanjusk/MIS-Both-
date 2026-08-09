import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
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
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import UserTask from '../../Pages/userTask';
import OrderTaskList from './OrderTaskList';
import DesignFilesWidget from './DesignFilesWidget';
import { fetchMyOrderTasks, fetchPendingTasksOverview, assignOrderToUser, moveOrderStage } from '../../services/orderService';
import { fetchAssignees } from '../../services/assigneeService';
import { useAuth } from '../../context/AuthContext';
import { WORKFLOW_SECTIONS, WORKFLOW_GROUPS, STAGE_LABELS, LEGACY_STAGE_LABELS } from '../../constants/orderStages';
import { stringToColor, initialsFor } from '../../utils/avatarColor';

const SECTION_BY_KEY = new Map(WORKFLOW_SECTIONS.map((section) => [section.key, section]));

// "DragDrop"/"None" are placeholder Assigned values written by the legacy
// kanban drag-drop endpoint when it had no real assignee to carry forward —
// treated as unassigned so they never render as if a person owns the task.
const UNASSIGNED_ASSIGNED_VALUES = new Set(['none', 'dragdrop', '']);

function normalizeMyOrder(order) {
  const latest = Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
  const assigned = String(latest?.Assigned || '').trim();
  return {
    orderId: String(order?._id || order?.Order_uuid || ''),
    orderNumber: order?.Order_Number,
    customerName: order?.customerName || '',
    description: order?.orderNote || '',
    stage: order?.stage,
    task: latest?.Task || order?.stage || 'Task',
    assignedTo: UNASSIGNED_ASSIGNED_VALUES.has(assigned.toLowerCase()) ? 'Unassigned' : assigned,
    assignedBy: latest?.AssignedBy || '',
    dueDate: order?.dueDate,
    overdue: Boolean(order?.overdue),
    stageUpdatedAt: latest?.CreatedAt || order?.updatedAt || null,
  };
}

const STAGE_TO_SECTION = new Map(
  WORKFLOW_SECTIONS.flatMap((section) => section.stages.map((stage) => [stage, section.key]))
);

// Many older orders never got a granular `stage` (they still carry the old
// coarse 'design' value, or none at all) but their real progress is tracked
// as free-text in Status.Task — "Printing", "Fitting", "Post Printing" etc.
// Without this, every one of those orders falls back to the Today's New
// column regardless of where the order actually is. Order matters: "Ready
// to Print" contains both "ready" and "print", and "Post Printing" contains
// "print" too, so the more specific checks run first.
function guessSectionFromLabel(label) {
  const text = String(label || '').toLowerCase();
  if (/ready\s*to\s*print/.test(text)) return 'readyToPrint';
  if (text.includes('fitting')) return 'fitting';
  if (/(bind|pack)/.test(text)) return 'bindPack';
  if (text.includes('print')) return 'print';
  if (text.includes('hold')) return 'hold';
  if (/(approval|customer)/.test(text)) return 'designApproval';
  if (text.includes('old')) return 'oldPending';
  if (/(ready|deliver)/.test(text)) return 'ready';
  return 'todaysNew';
}

// Buckets tasks into the per-stage production-pipeline columns (Today's New,
// Old Pending, Design Approval, Hold, Ready to Print, Print, Fitting,
// Bind-Pack, Ready) instead of a flat "by stage name" grouping — matches how
// the team actually walks an order through the shop.
function groupBySection(tasks) {
  const buckets = new Map(WORKFLOW_SECTIONS.map((section) => [section.key, []]));
  for (const task of tasks) {
    const key = STAGE_TO_SECTION.get(task.stage) || guessSectionFromLabel(task.task || task.stage);
    buckets.get(key).push(task);
  }
  return buckets;
}

// Pipeline order the granular stage strip is sorted in — unrecognized
// labels (old free-text Status.Task values with no matching stage) sort
// after all of these, alphabetically.
const STAGE_LABEL_ORDER = [
  'New Design', 'Old Design', 'Approval', 'Hold', 'Customer',
  'Ready to Print', 'Print', 'Fitting', 'Bind & Packing', 'Ready', 'Delivered',
];

function resolveStageLabel(task) {
  return STAGE_LABELS[task.stage] || LEGACY_STAGE_LABELS[task.stage] || task.task || 'Other';
}

function sortByStageLabelOrder(a, b) {
  const ai = STAGE_LABEL_ORDER.indexOf(a.label);
  const bi = STAGE_LABEL_ORDER.indexOf(b.label);
  if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

// Same stage buckets as groupByStageLabel below, but keeps the actual task
// list per stage (not just a count) — used by the "By User" tab to show
// each person's pending work broken down stage by stage.
function groupTasksByStageLabel(tasks) {
  const buckets = new Map();
  for (const task of tasks) {
    const label = resolveStageLabel(task);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(task);
  }
  return Array.from(buckets.entries())
    .map(([label, labelTasks]) => ({ label, tasks: labelTasks }))
    .sort(sortByStageLabelOrder);
}

// Finer-grained breakdown than the 4 pipeline columns below it — one chip
// per real stage (New Design, Approval, Print, Fitting, ...) with a live
// count, the same idea as the dashboard's top stage-summary strip but
// scoped to this widget's own task list.
function groupByStageLabel(tasks) {
  const counts = new Map();
  for (const task of tasks) {
    const label = resolveStageLabel(task);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(sortByStageLabelOrder);
}

// Replaces the previous separate "Tasks" and "Design Files" home-screen
// widgets — one card, so a stuck order's current stage, its owner, and the
// design file behind it are all in one place instead of split across two
// widgets that didn't reference each other. Attendance (start/end day) has
// moved out of here entirely, next to the user's name in the top nav.
export default function WorkflowWidget() {
  const { userName, isAdmin } = useAuth();
  const [tab, setTab] = useState('board');
  const [overview, setOverview] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState('');
  const [movingId, setMovingId] = useState('');

  // `overview` (and its `byUser` breakdown) is now fetched for every signed-
  // in user, not just admins — it powers the "By User" tab so the whole team
  // can see stage-wise/user-wise pending work, while the admin-only "Board"
  // behavior (overview.tasks vs. myOrders) is unchanged.
  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [overviewRes, mineRes] = await Promise.all([
        fetchPendingTasksOverview(),
        isAdmin ? null : fetchMyOrderTasks(userName),
      ]);
      setOverview(overviewRes?.data || null);
      if (mineRes) setMyOrders(mineRes?.data?.orders || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load pending tasks.');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, userName]);

  useEffect(() => {
    if (!userName) return;
    load();
    fetchAssignees().then((res) => setAssignees(res?.data?.result || [])).catch(() => setAssignees([]));
  }, [load, userName]);

  const handleAssign = async (orderId, assignedTo, assignedToType = 'user') => {
    setAssigningId(orderId);
    try {
      await assignOrderToUser(orderId, { assignedTo, assignedToType, assignedBy: userName });
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
  const stageBreakdown = useMemo(() => groupByStageLabel(allTasks), [allTasks]);

  // "By User" tab data: overview.byUser is already grouped/sorted by the
  // backend (most-loaded person first, "Unassigned" as its own bucket) —
  // here we just also break each person's tasks down by stage.
  const byUserGroups = useMemo(
    () => (overview?.byUser || []).map((group) => ({ ...group, stageGroups: groupTasksByStageLabel(group.tasks) })),
    [overview]
  );

  return (
    <Box>
      <UserTask />

      <Divider sx={{ my: 1.5 }} />

      {/* Title, live stage-count chips, unassigned badge, and refresh all
          share one row — the chip strip scrolls sideways on its own
          (flex: 1, overflowX: auto) if it's too long, while the title and
          action icons stay fixed at the edges. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexShrink: 0 }}>Workflow</Typography>
        {stageBreakdown.length > 0 && (
          <Stack
            direction="row"
            spacing={0.75}
            flexWrap="nowrap"
            sx={{ flex: 1, minWidth: 0, overflowX: 'auto', py: 0.25, '&::-webkit-scrollbar': { height: 6 } }}
          >
            {stageBreakdown.map(({ label, count }) => (
              <Chip
                key={label}
                size="small"
                label={`${label} · ${count}`}
                variant="outlined"
                sx={{ flexShrink: 0, fontWeight: 600, bgcolor: 'background.paper' }}
              />
            ))}
          </Stack>
        )}
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0, ml: 'auto' }}>
          {overview?.unassignedCount > 0 && (
            <Chip size="small" color="warning" label={`${overview.unassignedCount} unassigned`} />
          )}
          {/* Board = today's live pipeline view, unchanged. By User = every
              team member's pending work grouped by person then by stage, so
              anyone can see who's holding what without leaving Workflow. */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={tab}
            onChange={(_, next) => next && setTab(next)}
            sx={{
              '& .MuiToggleButton-root': { px: 1, py: 0.35, textTransform: 'none', fontWeight: 600, lineHeight: 1.2 },
            }}
          >
            <ToggleButton value="board">
              <ViewKanbanRoundedIcon fontSize="small" sx={{ mr: 0.5 }} />
              Board
            </ToggleButton>
            <ToggleButton value="byUser">
              <PeopleAltRoundedIcon fontSize="small" sx={{ mr: 0.5 }} />
              By User
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
      ) : tab === 'byUser' ? (
        byUserGroups.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Nothing pending for anyone right now.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {byUserGroups.map((group) => {
              const isUnassignedGroup = group.userName === 'Unassigned';
              const isMe = !isUnassignedGroup && group.userName === userName;
              return (
                <Accordion
                  key={group.userName}
                  defaultExpanded
                  disableGutters
                  sx={{
                    border: '1px solid',
                    borderColor: isMe ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    overflow: 'hidden',
                    '&:before': { display: 'none' },
                    '&.Mui-expanded': { margin: 0 },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRoundedIcon />}
                    sx={{ bgcolor: 'action.hover', '& .MuiAccordionSummary-content': { alignItems: 'center' } }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', pr: 1 }}>
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          fontSize: 12,
                          fontWeight: 700,
                          bgcolor: isUnassignedGroup ? 'transparent' : stringToColor(group.userName),
                          border: isUnassignedGroup ? '1.5px dashed' : 'none',
                          borderColor: 'warning.main',
                          color: isUnassignedGroup ? 'warning.main' : '#fff',
                        }}
                      >
                        {isUnassignedGroup ? '?' : initialsFor(group.userName)}
                      </Avatar>
                      <Typography variant="body2" fontWeight={700} color={isUnassignedGroup ? 'warning.main' : 'text.primary'}>
                        {group.userName}{isMe ? ' (you)' : ''}
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ ml: 'auto' }}>
                        <Chip size="small" label={`${group.count} pending`} />
                        {group.overdueCount > 0 && (
                          <Chip size="small" color="error" label={`${group.overdueCount} overdue`} />
                        )}
                      </Stack>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 1.25, bgcolor: 'background.paper' }}>
                    <Stack spacing={1.5}>
                      {group.stageGroups.map(({ label, tasks }) => (
                        <Box key={label}>
                          <Typography
                            variant="caption"
                            fontWeight={800}
                            color="text.secondary"
                            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                          >
                            {label} · {tasks.length}
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <OrderTaskList
                              tasks={tasks}
                              view="card"
                              assignees={assignees}
                              assigningId={assigningId}
                              onAssign={handleAssign}
                              movingId={movingId}
                              onMoveStage={handleMoveStage}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        )
      ) : (
        <>
          {/* Desktop (md+): 4 parent pipeline columns (Design/Print/Post
              Print/Ready) in a single row that never wraps — each holds a
              fixed % of the row width (WORKFLOW_GROUPS.widthPercent).
              Mobile (xs/sm): the same 4 sections stack full-width instead —
              percentage-of-row widths plus nested min-width grids/columns
              don't have anywhere to shrink to on a phone screen, so rather
              than squeeze them into unreadable slivers, each section just
              takes the full width, one below the other.
              Design's share embeds the Design Files widget directly (see
              isDesignGroup below) — its own "Design Board" tab is the
              authoritative, always-accurate view of design-stage work,
              sourced live from each file's real Drive folder rather than
              the assigned-tasks query the other 3 sections use. The other
              3 hold their stage sub-columns (WORKFLOW_SECTIONS): on desktop
              those scroll sideways within their own section if they can't
              all fit; on mobile they wrap onto extra rows instead, since
              there's no side-scrolling room to spare there either. Layout
              only: bucketing/move-to-stage logic is untouched and still
              runs off WORKFLOW_SECTIONS. */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1, alignItems: 'stretch' }}>
          {WORKFLOW_GROUPS.map((group) => {
            const isDesignGroup = group.key === 'design';
            const columns = group.sectionKeys.map((key) => SECTION_BY_KEY.get(key)).filter(Boolean);
            const groupCount = columns.reduce((sum, section) => sum + (sections.get(section.key) || []).length, 0);
            return (
              <Box
                key={group.key}
                sx={{
                  flex: { xs: '1 1 auto', md: `0 0 ${group.widthPercent}%` },
                  maxWidth: { xs: '100%', md: `${group.widthPercent}%` },
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: isDesignGroup ? 'background.paper' : 'action.hover',
                  p: isDesignGroup ? 0 : 0.5,
                  overflow: isDesignGroup ? 'hidden' : 'visible',
                }}
              >
                {isDesignGroup ? (
                  // No extra header here — Design Files renders its own
                  // toolbar (tabs + count + view/add/refresh icons) as a
                  // single row, so wrapping it in another title row would
                  // just stack two rows on top of each other.
                  <Box sx={{ maxHeight: { xs: 480, md: 560 }, overflowY: 'auto' }}>
                    <DesignFilesWidget />
                  </Box>
                ) : (
                <>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 0.75, py: 0.5, flexShrink: 0 }}>
                  <Typography variant="caption" fontWeight={800} sx={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {group.label}
                  </Typography>
                  <Chip size="small" label={groupCount} />
                </Stack>

                <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 0.75, overflowX: { xs: 'visible', md: 'auto' }, flex: 1, minHeight: 0 }}>
                  {columns.map((section) => {
                    const tasks = sections.get(section.key) || [];
                    return (
                      <Box
                        key={section.key}
                        sx={{
                          flex: { xs: '1 1 140px', md: '1 1 0' },
                          minWidth: 140,
                          display: 'flex',
                          flexDirection: 'column',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          bgcolor: 'background.paper',
                          maxHeight: { xs: 320, md: 560 },
                          overflow: 'hidden',
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.5}
                          sx={{
                            px: 1,
                            py: 0.65,
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'rgba(240,253,244,0.6)',
                            flexShrink: 0,
                          }}
                        >
                          <Typography variant="caption" fontWeight={800} sx={{ flex: 1, whiteSpace: 'normal' }}>{section.label}</Typography>
                          <Chip size="small" label={tasks.length} />
                        </Stack>

                        <Box sx={{ overflowY: 'auto', p: 0.75, flex: 1, minHeight: 0 }}>
                          <OrderTaskList
                            tasks={tasks}
                            view="stack"
                            assignees={assignees}
                            assigningId={assigningId}
                            onAssign={handleAssign}
                            movingId={movingId}
                            onMoveStage={handleMoveStage}
                            emptyMessage="Nothing here."
                          />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
                </>
                )}
              </Box>
            );
          })}
          </Box>
        </>
      )}
    </Box>
  );
}
