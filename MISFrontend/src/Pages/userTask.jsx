import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import { useAuth } from '../context/AuthContext';
import axios from '../apiClient';

export default function UserTask() {
  const { userName } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [attendanceFlow, setAttendanceFlow] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [showOutSummary, setShowOutSummary] = useState(false);
  const [outSummaryData, setOutSummaryData] = useState({ pending: [], pendingCount: 0 });
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ Usertask_name: '', Remark: '', Deadline: '' });
  const [addingTask, setAddingTask] = useState(false);

  const loadPage = async () => {
    if (!userName) return;
    try {
      setError('');

      const [summaryRes, attendanceRes] = await Promise.all([
        axios.get('/api/dashboard/summary', {
          params: { userName, isAdmin: false },
        }),
        axios.get(`/api/attendance/getTodayAttendance/${userName}`),
      ]);

      const myTasks = summaryRes?.data?.result?.myAssignedTasks || [];
      const pending = attendanceRes?.data?.pendingAssignments || [];

      setTasks(myTasks);
      setAttendanceFlow(attendanceRes?.data?.flow || []);
      setPendingAssignments(pending);
      setMessage(myTasks.length ? `You have ${myTasks.length} assigned pending task(s).` : '');
    } catch (err) {
      console.error(err);
      setError('Failed to load your day view.');
    }
  };

  useEffect(() => {
    loadPage();
  }, [userName]);

  const hasStarted = attendanceFlow.includes('In');
  const hasEnded = attendanceFlow.includes('Out');

  const saveAttendance = async (type) => {
    try {
      setError('');
      const response = await axios.post('/api/attendance/addAttendance', {
        User_name: userName,
        Type: type,
        Status: type === 'Out' ? 'Completed' : 'Present',
        Time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      if (type === 'In' && Array.isArray(response?.data?.pendingAssignments)) {
        setPendingAssignments(response.data.pendingAssignments);
        setShowAssignmentDialog(response.data.pendingAssignments.length > 0);
      }

      if (type === 'Out') {
        // Reload tasks to get current pending state for out-summary
        const [summaryRes] = await Promise.all([
          axios.get('/api/dashboard/summary', { params: { userName, isAdmin: false } }),
        ]);
        const stillPending = summaryRes?.data?.result?.myAssignedTasks || [];
        setOutSummaryData({
          pending: stillPending,
          pendingCount: stillPending.length,
        });
        setShowOutSummary(true);
      }

      await loadPage();
    } catch (err) {
      if (err?.response?.status === 409) {
        setError(err.response.data?.message || `${type} is already marked for today.`);
      } else {
        console.error(err);
        setError('Failed to update attendance.');
      }
    }
  };

  const handleAddTask = async () => {
    if (!newTask.Usertask_name.trim()) return;
    setAddingTask(true);
    try {
      const now = new Date();
      await axios.post('/api/usertasks/addUsertask', {
        User: userName,
        Usertask_name: newTask.Usertask_name.trim(),
        Remark: newTask.Remark.trim() || '-',
        Date: now.toISOString().split('T')[0],
        Time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        Deadline: newTask.Deadline || now.toISOString().split('T')[0],
        Status: 'Pending',
      });
      setNewTask({ Usertask_name: '', Remark: '', Deadline: '' });
      setShowAddTask(false);
      await loadPage();
    } catch (err) {
      console.error(err);
      setError('Failed to add task.');
    } finally {
      setAddingTask(false);
    }
  };

  const summary = useMemo(() => {
    const overdue = tasks.filter((task) => task.overdue).length;
    return `${tasks.length} assigned task(s)${overdue ? ` • ${overdue} overdue` : ''}`;
  }, [tasks]);

  return (
    <Stack spacing={2} sx={{ p: { xs: 1, md: 2 } }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>My day</Typography>
        <Typography color="text.secondary">Start attendance, then work your assigned queue till 8:00 PM.</Typography>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {message && <Alert severity="info">{message}</Alert>}

      {/* Pending tasks dialog shown on check-in */}
      <Dialog open={showAssignmentDialog} onClose={() => setShowAssignmentDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Your pending assignments for today</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {pendingAssignments.length ? pendingAssignments.map((task) => (
              <Box key={`${task.source}-${task.id}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  {task.overdue
                    ? <AssignmentLateIcon color="error" fontSize="small" />
                    : <CheckCircleOutlineIcon color="action" fontSize="small" />}
                  <Typography fontWeight={700}>{task.title}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">Task: {task.taskName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Due: {task?.dueDate ? new Date(task.dueDate).toLocaleString('en-IN') : 'Today 8:00 PM'}
                </Typography>
                {task.overdue && <Chip size="small" color="error" label="Overdue" sx={{ mt: 0.5 }} />}
              </Box>
            )) : <Typography variant="body2" color="text.secondary">No pending assignments right now. Great start!</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAssignmentDialog(false)}>Got it</Button>
        </DialogActions>
      </Dialog>

      {/* Day end summary dialog */}
      <Dialog open={showOutSummary} onClose={() => setShowOutSummary(false)} fullWidth maxWidth="sm">
        <DialogTitle>Day ended — wrap-up</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {outSummaryData.pendingCount === 0 ? (
              <Alert severity="success">All tasks cleared! Great work today.</Alert>
            ) : (
              <Alert severity="warning">
                {outSummaryData.pendingCount} task(s) still pending — they will roll over to tomorrow.
              </Alert>
            )}
            {outSummaryData.pending.map((task) => (
              <Box key={`${task.source}-${task.id}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Typography fontWeight={700}>{task.title}</Typography>
                <Typography variant="body2" color="text.secondary">Task: {task.taskName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Due: {task?.dueDate ? new Date(task.dueDate).toLocaleString('en-IN') : 'Today 8:00 PM'}
                </Typography>
                {task.overdue && <Chip size="small" color="error" label="Overdue" sx={{ mt: 0.5 }} />}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowOutSummary(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add Task dialog */}
      <Dialog open={showAddTask} onClose={() => setShowAddTask(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add personal task</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Task name"
              value={newTask.Usertask_name}
              onChange={(e) => setNewTask((p) => ({ ...p, Usertask_name: e.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              label="Remark (optional)"
              value={newTask.Remark}
              onChange={(e) => setNewTask((p) => ({ ...p, Remark: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Deadline"
              type="date"
              value={newTask.Deadline}
              onChange={(e) => setNewTask((p) => ({ ...p, Deadline: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddTask(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddTask} disabled={addingTask || !newTask.Usertask_name.trim()}>
            {addingTask ? 'Adding…' : 'Add task'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attendance card */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Attendance</Typography>
              <Typography variant="body2" color="text.secondary">
                Today: {attendanceFlow.length ? attendanceFlow.join(' → ') : 'Not started'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="success"
                disabled={hasStarted}
                onClick={() => saveAttendance('In')}
              >
                Start day
              </Button>
              <Button
                variant="outlined"
                disabled={!hasStarted || hasEnded}
                onClick={() => saveAttendance('Lunch Out')}
              >
                Lunch
              </Button>
              <Button
                variant="outlined"
                disabled={!attendanceFlow.includes('Lunch Out') || attendanceFlow.includes('Lunch In')}
                onClick={() => saveAttendance('Lunch In')}
              >
                Back
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={!hasStarted || hasEnded}
                onClick={() => saveAttendance('Out')}
              >
                End day
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Task queue card */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Assigned tasks</Typography>
              <Typography variant="body2" color="text.secondary">{summary}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={tasks.length ? 'Working queue' : 'No tasks'} color={tasks.length ? 'primary' : 'default'} />
              <Tooltip title="Add personal task">
                <IconButton size="small" onClick={() => setShowAddTask(true)} color="primary">
                  <AddIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={1.5}>
            {tasks.map((task) => (
              <Box
                key={`${task.source}-${task.id}`}
                sx={{ border: '1px solid', borderColor: task.overdue ? 'error.light' : 'divider', borderRadius: 2, p: 1.5 }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  {task.overdue
                    ? <AssignmentLateIcon color="error" fontSize="small" />
                    : <CheckCircleOutlineIcon color="action" fontSize="small" />}
                  <Typography fontWeight={700}>{task.title}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">Type: {task.source}</Typography>
                <Typography variant="body2" color="text.secondary">Task: {task.taskName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Due: {task?.dueDate ? new Date(task.dueDate).toLocaleString('en-IN') : 'Today 8:00 PM'}
                </Typography>
                {task.overdue && <Chip size="small" color="error" label="Overdue from previous day" sx={{ mt: 1 }} />}
              </Box>
            ))}
            {!tasks.length && (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CheckCircleOutlineIcon color="success" sx={{ fontSize: 40 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No assigned tasks yet. Use the + button to add your own.
                </Typography>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
