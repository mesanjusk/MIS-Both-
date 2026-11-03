import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import UserTask from '../../Pages/userTask';
import OrderTaskList from './OrderTaskList';
import DesignFilesWidget from './DesignFilesWidget';
import { fetchPendingTasksOverview, assignOrderToUser, moveOrderStage, bulkMoveOrderStages } from '../../services/orderService';
import { fetchAssignees } from '../../services/assigneeService';
import { useAuth } from '../../context/AuthContext';
import { useRoleKey } from '../../hooks/useRouteAccess';
import { ADMIN_ROLES, isRoleAllowed } from '../../constants/roles';
import { WORKFLOW_SECTIONS, WORKFLOW_GROUPS, WORKFLOW_MOVABLE_STAGES, STAGE_LABELS, LEGACY_STAGE_LABELS } from '../../constants/orderStages';
import { MAX_WORKFLOW_BULK_ORDERS, visibleWorkflowOrderIds, selectionAfterBulkMove } from './workflowBulkSelection';
import { stringToColor, initialsFor } from '../../utils/avatarColor';
import { ORDER_SECTIONS } from '../orders/orderControlSections';

// The action queues carry a much heavier query than the board (the whole
// business summary: orders, vendor ledger, transactions and tasks), so the
// chunk is only fetched when an admin actually opens that view.
const OrderControlPanel = lazy(() => import('../orders/OrderControlPanel'));

const SECTION_BY_KEY = new Map(WORKFLOW_SECTIONS.map((section) => [section.key, section]));

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
  const { userName } = useAuth();
  // The action queues receive customer payments and pay vendors, so they use
  // the same strict Admin/Owner decision as the route guards — not
  // AuthContext's `isAdmin`, which is a substring test that admits
  // "Office Admin" and excludes "Owner".
  const roleKey = useRoleKey();
  const canSeeActionQueues = isRoleAllowed(ADMIN_ROLES, roleKey);
  const [tab, setTab] = useState('board');
  const [overview, setOverview] = useState(null);
  // Off by default: the board is the shop floor, not a personal list.
  const [onlyMine, setOnlyMine] = useState(false);
  const [assignees, setAssignees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState('');
  const [movingId, setMovingId] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkTargetStage, setBulkTargetStage] = useState('');
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState(null);

  // One source for the whole widget. `/tasks/overview` is open to every
  // authenticated user by design (see Order/statusRouter.js), and the By User
  // tab has always shown every person's pending work to everyone — so the
  // board showing the same orders is not new exposure, it is the same data
  // the tab beside it already displays.
  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    setError('');
    try {
      const overviewRes = await fetchPendingTasksOverview(force ? { cache: false } : {});
      setOverview(overviewRes?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load pending tasks.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canSeeActionQueues && tab === 'needsAction') setTab('board');
  }, [canSeeActionQueues, tab]);

  useEffect(() => {
    if (!userName) return;
    load();
    fetchAssignees().then((res) => setAssignees(res?.data?.result || [])).catch(() => setAssignees([]));
  }, [load, userName]);

  const handleAssign = async (orderId, assignedTo, assignedToType = 'user') => {
    setAssigningId(orderId);
    try {
      await assignOrderToUser(orderId, { assignedTo, assignedToType, assignedBy: userName });
      await load(true);
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
      await load(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to move order.');
    } finally {
      setMovingId('');
    }
  };

  // The board shows the whole pipeline to everyone.
  //
  // It used to show `overview.tasks` to admins and only the signed-in user's
  // own orders to everyone else, which meant a print operator saw the Print,
  // Bind-Pack and Ready columns empty unless work happened to be assigned to
  // them by name — the shop floor was invisible to the people working it.
  // Worse, `isAdmin` is a substring test that is false for "Owner", so the
  // owner got the personal view too.
  //
  // Anyone who wants the old personal list can switch "Only mine" on; it
  // filters the same rows rather than issuing a different query, so the two
  // views can never disagree about who holds an order.
  const allTasks = useMemo(() => {
    const tasks = overview?.tasks || [];
    if (!onlyMine || !userName) return tasks;
    return tasks.filter((task) => task.assignedTo === userName);
  }, [overview, onlyMine, userName]);

  const sections = useMemo(() => groupBySection(allTasks), [allTasks]);
  const stageBreakdown = useMemo(() => groupByStageLabel(allTasks), [allTasks]);

  // "By User" tab data: overview.byUser is already grouped/sorted by the
  // backend (most-loaded person first, "Unassigned" as its own bucket) —
  // here we just also break each person's tasks down by stage.
  const byUserGroups = useMemo(
    () => (overview?.byUser || []).map((group) => ({ ...group, stageGroups: groupTasksByStageLabel(group.tasks) })),
    [overview]
  );

  const visibleOrderIds = useMemo(
    () => visibleWorkflowOrderIds(tab, sections, byUserGroups, WORKFLOW_GROUPS),
    [tab, sections, byUserGroups]
  );
  const selectedTasks = useMemo(
    () => (overview?.tasks || []).filter((task) => selectedIds.has(task.orderId)),
    [overview, selectedIds]
  );
  const visibleSelectedCount = visibleOrderIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleOrderIds.length > 0 && visibleSelectedCount === visibleOrderIds.length;

  const handleToggleSelection = useCallback((orderId) => {
    if (bulkMoving) return;
    if (!selectedIds.has(orderId) && selectedIds.size >= MAX_WORKFLOW_BULK_ORDERS) {
      setBulkFeedback({ severity: 'warning', message: `Select up to ${MAX_WORKFLOW_BULK_ORDERS} orders per move.` });
      return;
    }
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, [bulkMoving, selectedIds]);

  const handleSelectVisible = () => {
    if (bulkMoving) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (visibleOrderIds.length > 0 && visibleOrderIds.every((id) => next.has(id))) {
        visibleOrderIds.forEach((id) => next.delete(id));
      } else {
        visibleOrderIds.forEach((id) => {
          if (next.size < MAX_WORKFLOW_BULK_ORDERS) next.add(id);
        });
      }
      return next;
    });
  };

  const handleSelectSection = (sectionTasks) => {
    if (bulkMoving) return;
    const ids = [...new Set(sectionTasks.map((task) => task.orderId).filter(Boolean))];
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (ids.every((id) => next.has(id))) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => {
          if (next.size < MAX_WORKFLOW_BULK_ORDERS) next.add(id);
        });
      }
      return next;
    });
  };

  const handleBulkStageMove = async () => {
    if (bulkMoving || !bulkTargetStage || !selectedTasks.length) return;
    setBulkMoving(true);
    setBulkError('');
    setBulkFeedback(null);
    try {
      const ids = selectedTasks.map((task) => task.orderId);
      const response = await bulkMoveOrderStages(ids, bulkTargetStage);
      const result = response?.data || {};
      const failures = Array.isArray(result.failures) ? result.failures : [];
      const moved = Number(result.moved || 0);
      const destination = WORKFLOW_MOVABLE_STAGES.find((option) => option.stage === bulkTargetStage)?.label || bulkTargetStage;
      const orderNames = new Map(selectedTasks.map((task) => [task.orderId, `#${task.orderNumber}`]));
      const details = failures.slice(0, 5)
        .map((failure) => `${orderNames.get(failure.orderId) || failure.orderId}: ${failure.message}`)
        .join(' · ');

      // One overview refresh for the entire batch, never one per order.
      if (moved > 0) await load(true);
      setSelectedIds(selectionAfterBulkMove(failures));
      setBulkDialogOpen(false);
      setBulkTargetStage('');
      setBulkFeedback({
        severity: failures.length ? (moved ? 'warning' : 'error') : 'success',
        message: `${moved} of ${result.requested ?? ids.length} orders moved to ${destination}.${failures.length ? ` ${failures.length} failed and remain selected for retry.` : ''}`,
        details,
      });
    } catch (err) {
      setBulkError(err?.response?.data?.message || err.message || 'Bulk stage move failed. Please retry.');
    } finally {
      setBulkMoving(false);
    }
  };

  return (
    <Box>
      <UserTask />

      <Divider sx={{ my: 1.5 }} />

      {/* Compact board toolbar: keep the information needed to operate the
          board, but remove the duplicated per-stage text strip. The columns
          below already show stage names and live counts. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexShrink: 0 }}>Workflow</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {stageBreakdown.reduce((sum, item) => sum + item.count, 0)} active jobs
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={tab}
            onChange={(_, next) => { if (next) { setTab(next); setSelectedIds(new Set()); setBulkDialogOpen(false); } }}
            sx={{
              '& .MuiToggleButton-root': {
                px: 1,
                py: 0.35,
                textTransform: 'none',
                fontWeight: 600,
                lineHeight: 1.2,
                borderColor: 'divider',
              },
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
            {canSeeActionQueues && (
              <ToggleButton value="needsAction">
                <PlaylistAddCheckRoundedIcon fontSize="small" sx={{ mr: 0.5 }} />
                Needs Action
              </ToggleButton>
            )}
          </ToggleButtonGroup>
          {tab === 'board' && (
            <Tooltip title={onlyMine ? 'Showing only orders assigned to you' : 'Showing the whole pipeline'}>
              <FormControlLabel
                sx={{ ml: 0.5, mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.78rem', fontWeight: 600 } }}
                control={(
                  <Switch
                    size="small"
                    checked={onlyMine}
                    onChange={(event) => { setOnlyMine(event.target.checked); setSelectedIds(new Set()); }}
                  />
                )}
                label="Only mine"
              />
            </Tooltip>
          )}
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => load(true)} disabled={isLoading}>
              <RefreshRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {(tab === 'board' || tab === 'byUser') && (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Button size="small" variant={selectionMode ? 'contained' : 'outlined'}
            disabled={bulkMoving}
            onClick={() => {
              setSelectionMode((value) => !value);
              setSelectedIds(new Set());
              setBulkFeedback(null);
            }}>
            {selectionMode ? 'Done selecting' : 'Select orders'}
          </Button>
          {selectionMode && (
            <>
              <FormControlLabel
                sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12 } }}
                control={<Checkbox size="small" checked={allVisibleSelected}
                  indeterminate={visibleSelectedCount > 0 && !allVisibleSelected}
                  disabled={bulkMoving || visibleOrderIds.length === 0}
                  onChange={handleSelectVisible} />}
                label="Select visible"
              />
              <Chip size="small" color={selectedTasks.length ? 'primary' : 'default'}
                label={`${selectedTasks.length} selected · max ${MAX_WORKFLOW_BULK_ORDERS}`} />
              <Button size="small" disabled={!selectedIds.size || bulkMoving}
                onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button size="small" variant="contained"
                disabled={!selectedTasks.length || bulkMoving}
                onClick={() => {
                  setBulkTargetStage('');
                  setBulkError('');
                  setBulkDialogOpen(true);
                }}>
                Move Stage
              </Button>
            </>
          )}
        </Stack>
      )}
      {bulkFeedback && (
        <Alert severity={bulkFeedback.severity} sx={{ mb: 1 }} onClose={() => setBulkFeedback(null)}>
          {bulkFeedback.message}
          {bulkFeedback.details && (
            <Typography variant="caption" display="block">{bulkFeedback.details}</Typography>
          )}
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {tab === 'needsAction' ? (
        <Suspense fallback={<Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>}>
          <OrderControlPanel sections={ORDER_SECTIONS} embedded />
        </Suspense>
      ) : isLoading && !overview ? (
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
                             selectionMode={selectionMode}
                             selectedOrderIds={selectedIds}
                             onToggleSelect={handleToggleSelection}
                             selectionBusy={bulkMoving}
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
                  border: 'none',
                  borderRadius: 2,
                  bgcolor: isDesignGroup ? 'transparent' : 'grey.50',
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
                  <Typography
                    variant="caption"
                    fontWeight={800}
                    color="text.secondary"
                    sx={{ minWidth: 18, textAlign: 'center' }}
                  >
                    {groupCount}
                  </Typography>
                </Stack>

                {/* Narrow columns on purpose: the cards inside render in
                    OrderTaskList's compact "stack" form, so a tighter
                    column (and tighter padding around it) fits noticeably
                    more cards on screen before scrolling. */}
                <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 0.5, overflowX: { xs: 'visible', md: 'auto' }, flex: 1, minHeight: 0 }}>
                  {columns.map((section) => {
                    const tasks = sections.get(section.key) || [];
                    return (
                      <Box
                        key={section.key}
                        sx={{
                          flex: { xs: '1 1 120px', md: '1 1 0' },
                          minWidth: 116,
                          display: 'flex',
                          flexDirection: 'column',
                          border: 'none',
                          borderRadius: 1.5,
                          bgcolor: 'background.paper',
                          boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
                          maxHeight: { xs: 320, md: 560 },
                          overflow: 'hidden',
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.5}
                          sx={{
                            px: 0.75,
                            py: 0.4,
                            bgcolor: 'grey.50',
                            flexShrink: 0,
                          }}
                        >
                          <Typography variant="caption" fontWeight={800} sx={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.2 }}>{section.label}</Typography>
                          {selectionMode && tasks.length > 0 && (
                            <Tooltip title={`Select all ${section.label} orders`}>
                              <Checkbox size="small" sx={{ p: 0.1 }}
                                checked={tasks.every((task) => selectedIds.has(task.orderId))}
                                indeterminate={tasks.some((task) => selectedIds.has(task.orderId)) &&
                                  !tasks.every((task) => selectedIds.has(task.orderId))}
                                onChange={() => handleSelectSection(tasks)}
                                disabled={bulkMoving}
                                inputProps={{ 'aria-label': `Select all ${section.label} orders` }}
                              />
                            </Tooltip>
                          )}
                          <Typography
                            variant="caption"
                            fontWeight={800}
                            color="text.secondary"
                            sx={{ fontSize: 10, minWidth: 16, textAlign: 'center' }}
                          >
                            {tasks.length}
                          </Typography>
                        </Stack>

                        <Box sx={{ overflowY: 'auto', p: 0.5, flex: 1, minHeight: 0 }}>
                          <OrderTaskList
                            tasks={tasks}
                            view="stack"
                            assignees={assignees}
                            assigningId={assigningId}
                            onAssign={handleAssign}
                            movingId={movingId}
                            onMoveStage={handleMoveStage}
                             selectionMode={selectionMode}
                             selectedOrderIds={selectedIds}
                             onToggleSelect={handleToggleSelection}
                             selectionBusy={bulkMoving}
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
      <Dialog open={bulkDialogOpen} onClose={bulkMoving ? undefined : () => setBulkDialogOpen(false)}
        maxWidth="xs" fullWidth aria-labelledby="workflow-bulk-stage-title">
        <DialogTitle id="workflow-bulk-stage-title">Move {selectedTasks.length} orders to another stage</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Selected: {selectedTasks.slice(0, 6).map((task) => `#${task.orderNumber}`).join(', ')}
              {selectedTasks.length > 6 ? ` and ${selectedTasks.length - 6} more` : ''}.
              Each order will be checked against the normal stage-move rules.
            </Typography>
            <TextField select size="small" fullWidth label="Destination stage"
              value={bulkTargetStage} onChange={(event) => setBulkTargetStage(event.target.value)}
              disabled={bulkMoving}>
              <MenuItem value="" disabled>Select destination</MenuItem>
              {WORKFLOW_MOVABLE_STAGES.map(({ stage, label }) => (
                <MenuItem value={stage} key={stage}>{label}</MenuItem>
              ))}
            </TextField>
            {bulkTargetStage === 'delivered' && (
              <Alert severity="warning">
                Delivered is a final stage. Eligible orders will leave the pending Workflow board
                and trigger the usual delivery follow-up process.
              </Alert>
            )}
            {bulkError && <Alert severity="error">{bulkError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={bulkMoving} onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={bulkMoving || !bulkTargetStage || !selectedTasks.length}
            startIcon={bulkMoving ? <CircularProgress size={15} color="inherit" /> : null}
            onClick={handleBulkStageMove}>
            {bulkMoving ? 'Moving orders…' : `Move ${selectedTasks.length} orders`}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
