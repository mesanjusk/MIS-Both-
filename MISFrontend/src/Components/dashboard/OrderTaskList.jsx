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
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
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
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState(null);
  const [moveTask, setMoveTask] = useState(null);
  const [chooserAnchor, setChooserAnchor] = useState(null);
  const [chooserTask, setChooserTask] = useState(null);

  const canAssign = typeof onAssign === 'function';
  const canMove = typeof onMoveStage === 'function';

  const openAssignMenu = (event, task) => {
    if (!canAssign) return;
    setMenuAnchor(event.currentTarget);
    setActiveTask(task);
  };

  const closeAssignMenu = () => {
    setMenuAnchor(null);
    setActiveTask(null);
  };

  const handlePick = (assigneeId, assigneeType) => {
    const task = activeTask;
    closeAssignMenu();
    if (task) onAssign(task.orderId, assigneeId, assigneeType);
  };

  const openMoveMenu = (event, task) => {
    if (!canMove) return;
    setMoveMenuAnchor(event.currentTarget);
    setMoveTask(task);
  };

  const closeMoveMenu = () => {
    setMoveMenuAnchor(null);
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

  const AssignIcon = ({ task }) => {
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

  const MoveIcon = ({ task }) => {
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
    setChooserAnchor(event.currentTarget);
    setChooserTask(task);
  };
  const closeChooser = () => { setChooserAnchor(null); setChooserTask(null); };
  const chooseAssign = () => {
    const task = chooserTask;
    const anchor = chooserAnchor;
    closeChooser();
    if (task && anchor) openAssignMenu({ currentTarget: anchor }, task);
  };
  const chooseMove = () => {
    const task = chooserTask;
    const anchor = chooserAnchor;
    closeChooser();
    if (task && anchor) openMoveMenu({ currentTarget: anchor }, task);
  };

  const CardActionsButton = ({ task }) => {
    if (!canAssign && !canMove) return null;
    const isBusy = assigningId === task.orderId || movingId === task.orderId;
    return (
      <Tooltip title="Actions">
        <span>
          <IconButton size="small" disabled={isBusy} onClick={(event) => openChooser(event, task)} sx={{ color: 'action.active' }}>
            {isBusy ? <CircularProgress size={16} /> : <MoreVertRoundedIcon fontSize="small" />}
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

  const assignMenu = canAssign && (
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeAssignMenu}>
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
    <Menu anchorEl={moveMenuAnchor} open={Boolean(moveMenuAnchor)} onClose={closeMoveMenu}>
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
    <Menu anchorEl={chooserAnchor} open={Boolean(chooserAnchor)} onClose={closeChooser}>
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
    const gridSx = view === 'stack'
      ? { display: 'flex', flexDirection: 'column', gap: 0.75 }
      : {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 1,
        };
    return (
      <Box>
        <Box sx={gridSx}>
          {tasks.map((task) => {
            const isUnassigned = task.assignedTo === 'Unassigned';
            // Left-edge accent gives an at-a-glance urgency read without
            // having to scan the footer chips: red = overdue, amber =
            // nobody owns it yet, green = on track and assigned.
            const accentColor = task.overdue ? 'error.main' : isUnassigned ? 'warning.main' : 'success.light';
            return (
              <Card
                variant="outlined"
                key={task.orderId}
                sx={{
                  borderRadius: 2,
                  borderLeft: '4px solid',
                  borderLeftColor: accentColor,
                  transition: 'box-shadow 0.15s ease',
                  '&:hover': { boxShadow: 3 },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
                        {task.customerName || 'No customer name'}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          #{task.orderNumber}
                        </Typography>
                        {stageUpdatedLabel(task) && (
                          <Tooltip title="Last moved on this date">
                            <Typography variant="caption" color="text.disabled">
                              · {stageUpdatedLabel(task)}
                            </Typography>
                          </Tooltip>
                        )}
                      </Stack>
                    </Box>
                    <Box sx={{ flexShrink: 0, mt: -0.5, mr: -0.5 }}>
                      <CardActionsButton task={task} />
                    </Box>
                  </Stack>
                  {task.description && (
                    <Tooltip title={task.description}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mt: 0.5,
                        }}
                      >
                        {task.description}
                      </Typography>
                    </Tooltip>
                  )}
                  <Divider sx={{ my: 0.75 }} />
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      label={STAGE_LABELS[task.stage] || LEGACY_STAGE_LABELS[task.stage] || task.task}
                      variant="outlined"
                    />
                    <Tooltip title={isUnassigned ? 'Unassigned' : `Assigned to ${task.assignedTo}${task.assignedBy ? ` by ${task.assignedBy}` : ''}`}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Avatar
                          sx={{
                            width: 20,
                            height: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            bgcolor: isUnassigned ? 'transparent' : stringToColor(task.assignedTo),
                            border: isUnassigned ? '1.5px dashed' : 'none',
                            borderColor: 'warning.main',
                            color: isUnassigned ? 'warning.main' : '#fff',
                          }}
                        >
                          {isUnassigned ? '?' : initialsFor(task.assignedTo)}
                        </Avatar>
                        <Typography variant="caption" color={isUnassigned ? 'warning.main' : 'text.secondary'} fontWeight={isUnassigned ? 700 : 400} noWrap sx={{ maxWidth: 110 }}>
                          {isUnassigned ? 'Unassigned' : task.assignedTo}
                        </Typography>
                      </Stack>
                    </Tooltip>
                    <Box sx={{ ml: 'auto' }}>
                      {task.overdue ? (
                        <Chip size="small" color="error" icon={<WarningAmberRoundedIcon />} label="Overdue" />
                      ) : task.dueDate ? (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(task.dueDate).toLocaleDateString()}
                        </Typography>
                      ) : null}
                    </Box>
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
                  <AssignIcon task={task} />
                  <MoveIcon task={task} />
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
