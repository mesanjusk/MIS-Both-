import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import { STAGE_LABELS, LEGACY_STAGE_LABELS } from '../../constants/orderStages';

// Stages a task can be manually moved to from the Workflow widget — one
// representative (usually the entry stage) per pipeline column, so "Move
// to stage" reads as "move to Design/Print/Post Print/Ready" rather than
// listing all 17 raw enum values.
const MOVABLE_STAGES = [
  { stage: 'new_design', label: 'Design' },
  { stage: 'ready_to_print', label: 'Ready to Print' },
  { stage: 'print', label: 'Print' },
  { stage: 'fitting', label: 'Fitting' },
  { stage: 'bind_packing', label: 'Bind & Packing' },
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
  users = [],
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

  const handlePick = (assignedTo) => {
    const task = activeTask;
    closeAssignMenu();
    if (task) onAssign(task.orderId, assignedTo);
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

  const assignMenu = canAssign && (
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeAssignMenu}>
      {users.length === 0 && <MenuItem disabled>No users found</MenuItem>}
      {users.map((user) => (
        <MenuItem key={user._id} onClick={() => handlePick(user._id)}>
          <ListItemText>{user.User_name}</ListItemText>
        </MenuItem>
      ))}
      <MenuItem onClick={() => handlePick('Customer')}>
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
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(8, minmax(110px, 1fr))' },
          gap: 1,
          overflowX: 'auto',
        };
    return (
      <Box>
        <Box sx={gridSx}>
          {tasks.map((task) => {
            const isUnassigned = task.assignedTo === 'Unassigned';
            return (
              <Card variant="outlined" key={task.orderId}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" alignItems="center" spacing={0.25}>
                    <AssignIcon task={task} />
                    <MoveIcon task={task} />
                    <Typography variant="body2" fontWeight={700}>#{task.orderNumber}</Typography>
                    {stageUpdatedLabel(task) && (
                      <Tooltip title="Last moved on this date">
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                          {stageUpdatedLabel(task)}
                        </Typography>
                      </Tooltip>
                    )}
                  </Stack>
                  {task.customerName && (
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                      {task.customerName}
                    </Typography>
                  )}
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
                          mt: 0.25,
                        }}
                      >
                        {task.description}
                      </Typography>
                    </Tooltip>
                  )}
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                    <Chip
                      size="small"
                      label={STAGE_LABELS[task.stage] || LEGACY_STAGE_LABELS[task.stage] || task.task}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={isUnassigned ? 'Unassigned' : task.assignedTo}
                      color={isUnassigned ? 'warning' : 'default'}
                    />
                    {!isUnassigned && task.assignedBy && (
                      <Typography variant="caption" color="text.secondary">
                        by {task.assignedBy}
                      </Typography>
                    )}
                    {dueCell(task)}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
        {assignMenu}
        {moveMenu}
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
