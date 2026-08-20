import { useState } from 'react';
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
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
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import { STAGE_LABELS, LEGACY_STAGE_LABELS, STAGE_TO_CAPABILITY, ASSIGNEE_TYPE_LABELS } from '../../constants/orderStages';
import { stringToColor, initialsFor } from '../../utils/avatarColor';

// GET /api/assignees only ever returns Account Payable parties (see
// MISBackend/src/routes/Assignees.js) — employees are deliberately not
// assignable from this menu. Kept as an array (not a single constant) so a
// future type can be added here without restructuring the grouping below.
const ASSIGNEE_TYPE_ORDER = ['payable'];

// Stages a task can be manually moved to from the Workflow widget — one per
// remaining pipeline column, matching WORKFLOW_GROUPS in
// constants/orderStages.js. Design sub-stages (Today's New/Old Pending/
// Design Approval/Hold/Ready to Print) are deliberately excluded here —
// those now move automatically based on which Drive folder a design file
// sits in (see the Design Files widget), not by a manual dashboard action.
const MOVABLE_STAGES = [
  { stage: 'print', label: 'Print' },
  { stage: 'fitting', label: 'Fitting' },
  { stage: 'bind_packing', label: 'Bind-Pack' },
  { stage: 'ready', label: 'Ready' },
];

// Delivered is listed separately (and last) — it's a terminal move, not
// another pipeline column, so it's visually split from the rest.
const DELIVERED_STAGE = { stage: 'delivered', label: 'Delivered' };

// Replaces the old red "Overdue" chip on the card: the stage chip itself
// now carries the urgency, coloured by how long the order has been sitting
// in its current stage — green under 24h, amber under 48h, red beyond
// that. One less element on the card, and every card reads its own age.
const STAGE_AGE_STYLES = {
  fresh: { bg: '#dcfce7', fg: '#14532d', border: '#86efac', accent: '#22c55e', note: 'in this stage under 24h' },
  aging: { bg: '#fef3c7', fg: '#78350f', border: '#fcd34d', accent: '#f59e0b', note: 'in this stage 24–48h' },
  stale: { bg: '#fee2e2', fg: '#7f1d1d', border: '#fca5a5', accent: '#ef4444', note: 'in this stage over 48h' },
  unknown: { bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1', accent: '#94a3b8', note: 'no stage date on record' },
};

// Orders with no usable last-moved timestamp stay neutral grey rather than
// being guessed into one of the three urgency colours.
function stageAgeKey(task) {
  if (!task?.stageUpdatedAt) return 'unknown';
  const movedAt = new Date(task.stageUpdatedAt).getTime();
  if (Number.isNaN(movedAt)) return 'unknown';
  const hours = (Date.now() - movedAt) / 3600000;
  if (hours < 24) return 'fresh';
  if (hours < 48) return 'aging';
  return 'stale';
}

// The pipeline columns are deliberately narrow, so a long stage label or
// assignee name is cut to a few characters (the full text stays in the
// tooltip) instead of wrapping the row onto a second line.
function truncate(text, max) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Menus are positioned from the button's on-screen rect rather than from
// the button element itself: the card list re-renders (and remounts its
// buttons) as soon as a menu opens, which left MUI holding a detached
// anchor node and dropping the menu at the top-left corner of the page.
// A plain {top,left} keeps the menu pinned under the kebab it came from.
function anchorRectOf(event) {
  const rect = event.currentTarget?.getBoundingClientRect?.();
  if (!rect) return { top: 0, left: 0 };
  return { top: rect.bottom, left: rect.right };
}

// Shared presentational list for order-based pending tasks — used for both
// the "your tasks" and "team pending tasks" sections so the row shape,
// assign control, and card/table rendering stay identical wherever a
// pending-task list is shown.
export default function OrderTaskList({
  tasks = [],
  view = 'table',
  assignees = [],
  assigningId = '',
  onAssign,
  movingId = '',
  onMoveStage,
  emptyMessage = 'No pending tasks.',
}) {
  const [menuPos, setMenuPos] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [moveMenuPos, setMoveMenuPos] = useState(null);
  const [moveTask, setMoveTask] = useState(null);
  const [chooserPos, setChooserPos] = useState(null);
  const [chooserTask, setChooserTask] = useState(null);

  const canAssign = typeof onAssign === 'function';
  const canMove = typeof onMoveStage === 'function';

  const openAssignMenu = (event, task) => {
    if (!canAssign) return;
    setMenuPos(anchorRectOf(event));
    setActiveTask(task);
  };

  const closeAssignMenu = () => {
    setMenuPos(null);
    setActiveTask(null);
  };

  const handlePick = (assigneeId, assigneeType) => {
    const task = activeTask;
    closeAssignMenu();
    if (task) onAssign(task.orderId, assigneeId, assigneeType);
  };

  const openMoveMenu = (event, task) => {
    if (!canMove) return;
    setMoveMenuPos(anchorRectOf(event));
    setMoveTask(task);
  };

  const closeMoveMenu = () => {
    setMoveMenuPos(null);
    setMoveTask(null);
  };

  const handlePickStage = (stage) => {
    const task = moveTask;
    closeMoveMenu();
    if (task) onMoveStage(task.orderId, stage);
  };

  if (!tasks.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        {emptyMessage}
      </Typography>
    );
  }

  // Rendered as plain functions rather than nested components: a nested
  // component is a new type on every render, so React would tear down and
  // rebuild these buttons mid-interaction.
  const renderAssignIcon = (task) => {
    const isUnassigned = task.assignedTo === 'Unassigned';
    const isBusy = assigningId === task.orderId;
    return (
      <Tooltip title={!canAssign ? '' : isUnassigned ? 'Assign this task' : `Reassign — currently ${task.assignedTo}`}>
        <span>
          <IconButton
            size="small"
            disabled={!canAssign || isBusy}
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
    );
  };

  const renderMoveIcon = (task) => {
    if (!canMove) return null;
    const isBusy = movingId === task.orderId;
    return (
      <Tooltip title="Move to another stage/column">
        <span>
          <IconButton
            size="small"
            disabled={isBusy}
            onClick={(event) => openMoveMenu(event, task)}
            sx={{ color: 'info.main' }}
          >
            {isBusy ? <CircularProgress size={16} /> : <TrendingFlatRoundedIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    );
  };

  // Card/stack view (Print, Fitting/Bind-Pack, Ready columns) uses one kebab
  // instead of two separate icon buttons — reassign and move both live in
  // one small chooser menu so the card header's width goes to the customer
  // name instead of being split with two buttons.
  const openChooser = (event, task) => {
    if (!canAssign && !canMove) return;
    setChooserPos(anchorRectOf(event));
    setChooserTask(task);
  };
  const closeChooser = () => { setChooserPos(null); setChooserTask(null); };
  const chooseAssign = () => {
    const task = chooserTask;
    const pos = chooserPos;
    closeChooser();
    if (task && pos) { setMenuPos(pos); setActiveTask(task); }
  };
  const chooseMove = () => {
    const task = chooserTask;
    const pos = chooserPos;
    closeChooser();
    if (task && pos) { setMoveMenuPos(pos); setMoveTask(task); }
  };

  const renderCardActionsButton = (task, compact) => {
    if (!canAssign && !canMove) return null;
    const isBusy = assigningId === task.orderId || movingId === task.orderId;
    return (
      <Tooltip title="Actions">
        <span>
          <IconButton
            size="small"
            disabled={isBusy}
            onClick={(event) => openChooser(event, task)}
            sx={{ color: 'action.active', p: compact ? 0.25 : 0.5 }}
          >
            {isBusy
              ? <CircularProgress size={compact ? 13 : 16} />
              : <MoreVertRoundedIcon sx={{ fontSize: compact ? 16 : 20 }} />}
          </IconButton>
        </span>
      </Tooltip>
    );
  };

  // Narrow the (potentially long) combined employee + Account Payable list
  // down to whoever can actually work the active task's stage — an
  // assignee with no capabilities set is unrestricted (shows on
  // every stage) so nothing vanishes from the menu until someone tags it.
  // Falls back to the full list when the stage isn't mapped to a capability
  // at all, so an unrecognized/legacy stage never leaves the menu empty.
  const neededCapability = STAGE_TO_CAPABILITY[activeTask?.stage];
  const eligibleAssignees = neededCapability
    ? assignees.filter((a) => !a.capabilities?.length || a.capabilities.includes(neededCapability))
    : assignees;

  const assigneesByType = ASSIGNEE_TYPE_ORDER
    .map((type) => ({ type, items: eligibleAssignees.filter((a) => a.type === type) }))
    .filter((group) => group.items.length > 0);

  // Every menu opens anchored to the kebab's bottom-right corner and grows
  // down-and-left from there, so it stays over the card it belongs to.
  const positionedMenuProps = (pos) => ({
    anchorReference: 'anchorPosition',
    anchorPosition: pos || { top: 0, left: 0 },
    transformOrigin: { vertical: 'top', horizontal: 'right' },
    marginThreshold: 8,
  });

  const assignMenu = canAssign && (
    <Menu open={Boolean(menuPos)} onClose={closeAssignMenu} {...positionedMenuProps(menuPos)}>
      {eligibleAssignees.length === 0 && <MenuItem disabled>No one tagged for this stage yet</MenuItem>}
      {assigneesByType.flatMap((group) => [
        <ListSubheader key={`${group.type}-header`} sx={{ lineHeight: 2.2 }}>
          {ASSIGNEE_TYPE_LABELS[group.type] || group.type}
        </ListSubheader>,
        ...group.items.map((assignee) => (
          <MenuItem key={assignee.id} onClick={() => handlePick(assignee.id, assignee.type === 'employee' ? 'user' : 'vendor')}>
            <ListItemText>{assignee.name}</ListItemText>
          </MenuItem>
        )),
      ])}
      <Divider />
      <MenuItem onClick={() => handlePick('Customer', 'user')}>
        <ListItemIcon><SupportAgentRoundedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Waiting on customer</ListItemText>
      </MenuItem>
    </Menu>
  );

  const moveMenu = canMove && (
    <Menu open={Boolean(moveMenuPos)} onClose={closeMoveMenu} {...positionedMenuProps(moveMenuPos)}>
      {MOVABLE_STAGES.map(({ stage, label }) => (
        <MenuItem key={stage} disabled={moveTask?.stage === stage} onClick={() => handlePickStage(stage)}>
          <ListItemIcon><TrendingFlatRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{label}</ListItemText>
        </MenuItem>
      ))}
      <Divider />
      <MenuItem
        disabled={moveTask?.stage === DELIVERED_STAGE.stage}
        onClick={() => handlePickStage(DELIVERED_STAGE.stage)}
        sx={{ color: 'success.main', fontWeight: 700 }}
      >
        <ListItemIcon><LocalShippingRoundedIcon fontSize="small" color="success" /></ListItemIcon>
        <ListItemText>{DELIVERED_STAGE.label}</ListItemText>
      </MenuItem>
    </Menu>
  );

  const chooserMenu = (canAssign || canMove) && (
    <Menu open={Boolean(chooserPos)} onClose={closeChooser} {...positionedMenuProps(chooserPos)}>
      {canAssign && (
        <MenuItem onClick={chooseAssign}>
          <ListItemIcon><SwapHorizRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{chooserTask?.assignedTo === 'Unassigned' ? 'Assign' : `Reassign — currently ${chooserTask?.assignedTo}`}</ListItemText>
        </MenuItem>
      )}
      {canMove && (
        <MenuItem onClick={chooseMove}>
          <ListItemIcon><TrendingFlatRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move to another stage</ListItemText>
        </MenuItem>
      )}
    </Menu>
  );

  const dueCell = (task) =>
    task.overdue ? (
      <Chip size="small" color="error" label="Overdue" />
    ) : task.dueDate ? (
      new Date(task.dueDate).toLocaleDateString()
    ) : (
      '—'
    );

  // Date the order last moved stage (its most recent Status entry), shown
  // next to the order number so a stuck card is obvious at a glance without
  // opening it.
  const stageUpdatedLabel = (task) => {
    if (!task.stageUpdatedAt) return '';
    const date = new Date(task.stageUpdatedAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  if (view === 'card' || view === 'stack') {
    // The stack view is what the narrow pipeline columns (Print, Fitting,
    // Bind-Pack, Ready) render, so it runs compact: tight padding, one line
    // per piece of information and no separators, which roughly doubles how
    // many cards fit in a column before scrolling. The order note moves
    // into the title tooltip rather than taking a row of its own.
    const compact = view === 'stack';
    const stageChars = compact ? 10 : 18;
    const assigneeChars = compact ? 8 : 14;
    const gridSx = compact
      ? { display: 'flex', flexDirection: 'column', gap: 0.5 }
      : {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 0.75,
        };
    return (
      <Box>
        <Box sx={gridSx}>
          {tasks.map((task) => {
            const isUnassigned = task.assignedTo === 'Unassigned';
            const age = STAGE_AGE_STYLES[stageAgeKey(task)];
            const stageLabel = STAGE_LABELS[task.stage] || LEGACY_STAGE_LABELS[task.stage] || task.task || '—';
            const movedLabel = stageUpdatedLabel(task);
            const titleTooltip = [task.customerName || 'No customer name', task.description]
              .filter(Boolean)
              .join(' — ');
            return (
              <Card
                variant="outlined"
                key={task.orderId}
                sx={{
                  borderRadius: 1.5,
                  borderLeft: '3px solid',
                  borderLeftColor: age.accent,
                  transition: 'box-shadow 0.15s ease',
                  '&:hover': { boxShadow: 2 },
                }}
              >
                <CardContent
                  sx={{
                    p: compact ? 0.75 : 1,
                    '&:last-child': { pb: compact ? 0.75 : 1 },
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" spacing={0.25}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Tooltip title={titleTooltip}>
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          noWrap
                          display="block"
                          sx={{ fontSize: compact ? 12 : 13, lineHeight: 1.35 }}
                        >
                          {task.customerName || 'No customer name'}
                        </Typography>
                      </Tooltip>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        display="block"
                        sx={{ fontSize: compact ? 10 : 11, lineHeight: 1.35 }}
                      >
                        #{task.orderNumber}{movedLabel ? ` · ${movedLabel}` : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ flexShrink: 0, mt: -0.25, mr: -0.25 }}>
                      {renderCardActionsButton(task, compact)}
                    </Box>
                  </Stack>

                  {!compact && task.description && (
                    <Tooltip title={task.description}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mt: 0.25,
                        }}
                      >
                        {task.description}
                      </Typography>
                    </Tooltip>
                  )}

                  {/* Stage and owner share one row that never wraps — the
                      stage chip is coloured by how long the card has sat
                      here, and the owner is just an avatar + a few
                      characters of the name (no "Unassigned" caption; an
                      empty dashed avatar says it instead). */}
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    flexWrap="nowrap"
                    sx={{ mt: 0.5, minWidth: 0 }}
                  >
                    <Tooltip title={`${stageLabel} — ${age.note}`}>
                      <Chip
                        size="small"
                        label={truncate(stageLabel, stageChars)}
                        sx={{
                          flexShrink: 0,
                          maxWidth: '60%',
                          height: compact ? 18 : 20,
                          fontSize: compact ? 10 : 11,
                          fontWeight: 700,
                          bgcolor: age.bg,
                          color: age.fg,
                          border: '1px solid',
                          borderColor: age.border,
                          '& .MuiChip-label': { px: 0.75 },
                        }}
                      />
                    </Tooltip>
                    <Tooltip title={isUnassigned ? 'Unassigned' : `Assigned to ${task.assignedTo}${task.assignedBy ? ` by ${task.assignedBy}` : ''}`}>
                      <Stack direction="row" spacing={0.4} alignItems="center" sx={{ minWidth: 0, ml: 'auto' }}>
                        <Avatar
                          sx={{
                            width: compact ? 16 : 18,
                            height: compact ? 16 : 18,
                            fontSize: compact ? 9 : 10,
                            fontWeight: 700,
                            flexShrink: 0,
                            bgcolor: isUnassigned ? 'transparent' : stringToColor(task.assignedTo),
                            border: isUnassigned ? '1.5px dashed' : 'none',
                            borderColor: 'warning.main',
                            color: isUnassigned ? 'warning.main' : '#fff',
                          }}
                        >
                          {isUnassigned ? '?' : initialsFor(task.assignedTo)}
                        </Avatar>
                        {!isUnassigned && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{ fontSize: compact ? 10 : 11 }}
                          >
                            {truncate(task.assignedTo, assigneeChars)}
                          </Typography>
                        )}
                      </Stack>
                    </Tooltip>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
        {assignMenu}
        {moveMenu}
        {chooserMenu}
      </Box>
    );
  }

  return (
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
          {tasks.map((task) => (
            <TableRow key={task.orderId}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Stack direction="row" spacing={0.25} alignItems="center">
                  {renderAssignIcon(task)}
                  {renderMoveIcon(task)}
                  <Typography variant="body2" fontWeight={600}>#{task.orderNumber}</Typography>
                  {task.customerName && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {task.customerName}
                    </Typography>
                  )}
                  {task.assignedTo !== 'Unassigned' && (
                    <Typography variant="caption" color="primary.main" noWrap sx={{ fontWeight: 600 }}>
                      → {task.assignedTo}
                      {task.assignedBy ? ` (by ${task.assignedBy})` : ''}
                    </Typography>
                  )}
                </Stack>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{task.task}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{dueCell(task)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {assignMenu}
      {moveMenu}
    </Box>
  );
}
