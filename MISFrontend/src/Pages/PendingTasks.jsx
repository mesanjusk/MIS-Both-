import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { fetchMyOrderTasks, fetchOrderQueue, assignOrderToUser } from '../services/orderService';
import axios from '../apiClient';

function OrderTaskCard({ order, users, canAssign, currentUserName, onAssign }) {
  const [assignee, setAssignee] = useState(order?.assignedTo || '');
  const latest = order?.latestStatusTask || {};

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1" fontWeight={700}>Order #{order.Order_Number}</Typography>
            <Chip size="small" label={order.overdue ? 'Overdue' : (order.stage || 'Pending')} color={order.overdue ? 'error' : 'primary'} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Task: {latest.Task || order.stage || 'Design'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Assigned: {latest.Assigned || 'None'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Due: {order?.dueDate ? new Date(order.dueDate).toLocaleString() : 'Today 8:00 PM'}
          </Typography>

          {canAssign ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                select
                size="small"
                fullWidth
                label="Assign user"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
              >
                {users.map((user) => (
                  <MenuItem key={user._id} value={user._id}>{user.User_name}</MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                disabled={!assignee}
                onClick={() => onAssign(order._id, assignee)}
              >
                Assign
              </Button>
            </Stack>
          ) : (
            <Typography variant="body2">Working user: {latest.Assigned || currentUserName || 'Not assigned'}</Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function PendingTasks() {
  const { isAdmin, userName } = useAuth();
  const [users, setUsers] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [queueTasks, setQueueTasks] = useState([]);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
      const [mineRes, queueRes, usersRes] = await Promise.all([
        fetchMyOrderTasks(userName),
        isAdmin ? fetchOrderQueue() : Promise.resolve({ data: { result: [] } }),
        isAdmin ? axios.get('/api/users/GetUserList') : Promise.resolve({ data: { result: [] } }),
      ]);
      setAssignedTasks(mineRes?.data?.result?.orders || []);
      setQueueTasks(queueRes?.data?.result || []);
      setUsers(usersRes?.data?.result || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load order task queue.');
    }
  };

  useEffect(() => {
    if (userName) loadData();
  }, [userName, isAdmin]);

  const summaryText = useMemo(() => {
    const overdue = assignedTasks.filter((order) => order.overdue).length;
    return `${assignedTasks.length} assigned order tasks${overdue ? ` • ${overdue} overdue` : ''}`;
  }, [assignedTasks]);

  const handleAssign = async (orderId, userId) => {
    try {
      await assignOrderToUser(orderId, { userId, assignedBy: userName, via: 'app' });
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Failed to assign order.');
    }
  };

  return (
    <Stack spacing={2} sx={{ p: { xs: 1, md: 2 } }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>Order task desk</Typography>
        <Typography color="text.secondary">Tasks are order-based. New orders stay unassigned until you assign them in app.</Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700}>My active queue</Typography>
          <Typography variant="body2" color="text.secondary">{summaryText}</Typography>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {assignedTasks.map((order) => (
          <Grid item xs={12} md={6} lg={4} key={order._id}>
            <OrderTaskCard order={order} users={users} canAssign={false} currentUserName={userName} onAssign={handleAssign} />
          </Grid>
        ))}
      </Grid>

      {isAdmin && (
        <>
          <Box>
            <Typography variant="h6" fontWeight={700}>Unassigned queue</Typography>
            <Typography variant="body2" color="text.secondary">Assign new design orders manually from here.</Typography>
          </Box>
          <Grid container spacing={2}>
            {queueTasks.map((order) => (
              <Grid item xs={12} md={6} lg={4} key={order._id}>
                <OrderTaskCard order={order} users={users} canAssign currentUserName={userName} onAssign={handleAssign} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Stack>
  );
}
