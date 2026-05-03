import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import axios from '../apiClient.js';
import EditTask from './editTask';
import AddTask from '../Pages/addTask';
import { ReportCardGrid, ReportFilterBar, ReportPageShell, ReportTableCard } from '../components/reports/ReportShell';
import { EmptyState, LoadingState } from '../components/ui';

export default function TaskReport() {
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userGroup, setUserGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');

  const loadTasks = async () => {
    setLoading(true);
    try {
      setUserGroup(localStorage.getItem('User_group') || '');
      const res = await axios.get('/api/tasks/GetTaskList');
      const rows = res?.data?.success ? res.data.result || [] : [];
      setTasks(rows.sort((a, b) => String(a.Task_name || '').localeCompare(String(b.Task_name || ''))));
    } catch (error) {
      console.error('Error fetching task list:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTasks(); }, []);

  const filtered = useMemo(
    () => tasks.filter((task) => [task.Task_name, task.Task_group].filter(Boolean).some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase()))),
    [tasks, searchTerm],
  );

  const handleDeleteConfirm = async () => {
    if (!selectedTask?._id) return;
    try {
      const res = await axios.delete(`/tasks/Delete/${selectedTask._id}`);
      if (res?.data?.success) setTasks((prev) => prev.filter((task) => task._id !== selectedTask._id));
    } catch (error) {
      console.error('Error deleting task:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <ReportPageShell
      title="Tasks Report"
      subtitle="Review task masters and keep them easy to update from mobile or desktop."
      count={filtered.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print</Button><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddModal(true)}>Add Task</Button></Stack>}
    >
      <ReportFilterBar><Grid item xs={12}><TextField fullWidth size="small" label="Search task or group" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></Grid></ReportFilterBar>
      {loading ? <LoadingState label="Loading tasks" /> : null}
      {!loading && filtered.length === 0 ? <EmptyState title="No tasks found" /> : null}
      {!loading && filtered.length > 0 && viewMode === 'table' ? (
        <ReportTableCard><Table size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Task Name</TableCell><TableCell sx={{ fontWeight: 800 }}>Task Group</TableCell>{userGroup === 'Admin User' ? <TableCell sx={{ fontWeight: 800 }}>Actions</TableCell> : null}</TableRow></TableHead><TableBody>{filtered.map((task) => (<TableRow hover key={task._id}><TableCell><Button size="small" onClick={() => { setSelectedTaskId(task._id); setShowEditModal(true); }}>{task.Task_name}</Button></TableCell><TableCell>{task.Task_group || '-'}</TableCell>{userGroup === 'Admin User' ? <TableCell><IconButton size="small" color="error" onClick={() => { setSelectedTask(task); setShowDeleteModal(true); }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></TableCell> : null}</TableRow>))}</TableBody></Table></ReportTableCard>
      ) : null}
      {!loading && filtered.length > 0 && viewMode === 'grid' ? (
        <ReportCardGrid>{filtered.map((task) => (<Grid item xs={12} sm={6} md={4} key={task._id}><Card elevation={0} sx={{ borderRadius: 3, height: '100%' }}><CardContent><Stack spacing={1.2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={800}>{task.Task_name}</Typography><IconButton size="small" onClick={() => { setSelectedTaskId(task._id); setShowEditModal(true); }}><EditRoundedIcon fontSize="small" /></IconButton></Stack><Typography variant="body2" color="text.secondary">Task Group: {task.Task_group || '-'}</Typography>{userGroup === 'Admin User' ? <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { setSelectedTask(task); setShowDeleteModal(true); }}>Delete</Button> : null}</Stack></CardContent></Card></Grid>))}</ReportCardGrid>
      ) : null}
      <Dialog open={showEditModal} onClose={() => setShowEditModal(false)} fullWidth maxWidth="sm"><DialogContent sx={{ p: 1 }}><EditTask taskId={selectedTaskId} closeModal={() => { setShowEditModal(false); loadTasks(); }} /></DialogContent></Dialog>
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} fullWidth maxWidth="sm"><DialogContent sx={{ p: 1 }}><AddTask closeModal={() => { setShowAddModal(false); loadTasks(); }} /></DialogContent></Dialog>
      <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}><DialogTitle>Delete task</DialogTitle><DialogContent><Typography variant="body2">Delete {selectedTask?.Task_name || 'this task'}?</Typography></DialogContent><DialogActions><Button onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button></DialogActions></Dialog>
    </ReportPageShell>
  );
}
