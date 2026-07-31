import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
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
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import { STAGE_LABELS } from '../../constants/orderStages';

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
  emptyMessage = 'No pending tasks.',
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [activeTask, setActiveTask] = useState(null);

  const canAssign = typeof onAssign === 'function';

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

  const dueCell = (task) =>
    task.overdue ? (
      <Chip size="small" color="error" label="Overdue" />
    ) : task.dueDate ? (
      new Date(task.dueDate).toLocaleDateString()
    ) : (
      '—'
    );

  if (view === 'card') {
    return (
      <Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(8, minmax(110px, 1fr))' },
            gap: 1,
            overflowX: 'auto',
          }}
        >
          {tasks.map((task) => {
            const isUnassigned = task.assignedTo === 'Unassigned';
            return (
              <Card variant="outlined" key={task.orderId}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <AssignIcon task={task} />
                    <Typography variant="body2" fontWeight={700}>#{task.orderNumber}</Typography>
                  </Stack>
                  {task.customerName && (
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                      {task.customerName}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                    <Chip size="small" label={STAGE_LABELS[task.stage] || task.task} variant="outlined" />
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
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AssignIcon task={task} />
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
    </Box>
  );
}
