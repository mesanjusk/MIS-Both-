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
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import { deleteUser, fetchUsers } from '../services/userService.js';
import EditUser from './editUser';
import AddUser from '../Pages/addUser';
import { ReportCardGrid, ReportFilterBar, ReportPageShell, ReportTableCard } from '../components/reports/ReportShell';
import { EmptyState, LoadingState } from '../components/ui';

export default function UserReport() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userGroup, setUserGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUserGroup(localStorage.getItem('User_group') || '');
      const res = await fetchUsers();
      const rows = res?.data?.success ? res.data.result || [] : [];
      setUsers(rows.sort((a, b) => String(a.User_name || '').localeCompare(String(b.User_name || ''))));
    } catch (error) {
      console.error('Error fetching users list:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(
    () => users.filter((user) => [user.User_name, user.Mobile_number, user.User_group].filter(Boolean).some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase()))),
    [users, searchTerm],
  );

  const handleDeleteConfirm = async () => {
    if (!selectedUser?.User_uuid) return;
    try {
      const res = await deleteUser(selectedUser.User_uuid);
      if (res?.data?.success) setUsers((prev) => prev.filter((user) => user.User_uuid !== selectedUser.User_uuid));
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <ReportPageShell
      title="Users Report"
      subtitle="Open user records quickly and switch between table and card view."
      count={filtered.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print</Button><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddModal(true)}>Add User</Button></Stack>}
    >
      <ReportFilterBar><Grid item xs={12}><TextField fullWidth size="small" label="Search user, mobile, or group" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></Grid></ReportFilterBar>
      {loading ? <LoadingState label="Loading users" /> : null}
      {!loading && filtered.length === 0 ? <EmptyState title="No users found" /> : null}
      {!loading && filtered.length > 0 && viewMode === 'table' ? (
        <ReportTableCard><Table size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Name</TableCell><TableCell sx={{ fontWeight: 800 }}>Mobile</TableCell><TableCell sx={{ fontWeight: 800 }}>Group</TableCell><TableCell sx={{ fontWeight: 800 }}>Allowed Task Groups</TableCell>{userGroup === 'Admin User' ? <TableCell sx={{ fontWeight: 800 }}>Actions</TableCell> : null}</TableRow></TableHead><TableBody>{filtered.map((user) => (<TableRow hover key={user._id}><TableCell><Button size="small" onClick={() => { setSelectedUserId(user._id); setShowEditModal(true); }}>{user.User_name}</Button></TableCell><TableCell>{user.Mobile_number || '-'}</TableCell><TableCell>{user.User_group || '-'}</TableCell><TableCell>{Array.isArray(user.Allowed_Task_Groups) && user.Allowed_Task_Groups.length ? user.Allowed_Task_Groups.join(', ') : '-'}</TableCell>{userGroup === 'Admin User' ? <TableCell>{user.isUsed ? <LockRoundedIcon fontSize="small" color="disabled" /> : <IconButton size="small" color="error" onClick={() => { setSelectedUser(user); setShowDeleteModal(true); }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>}</TableCell> : null}</TableRow>))}</TableBody></Table></ReportTableCard>
      ) : null}
      {!loading && filtered.length > 0 && viewMode === 'grid' ? (
        <ReportCardGrid>{filtered.map((user) => (<Grid item xs={12} sm={6} md={4} key={user._id}><Card elevation={0} sx={{ borderRadius: 3, height: '100%' }}><CardContent><Stack spacing={1.2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={800}>{user.User_name}</Typography><IconButton size="small" onClick={() => { setSelectedUserId(user._id); setShowEditModal(true); }}><EditRoundedIcon fontSize="small" /></IconButton></Stack><Typography variant="body2" color="text.secondary">{user.Mobile_number || '-'}</Typography><InfoRow label="Group" value={user.User_group || '-'} /><InfoRow label="Task Groups" value={Array.isArray(user.Allowed_Task_Groups) && user.Allowed_Task_Groups.length ? user.Allowed_Task_Groups.join(', ') : '-'} />{userGroup === 'Admin User' ? (user.isUsed ? <Button variant="outlined" disabled startIcon={<LockRoundedIcon />}>Linked record</Button> : <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { setSelectedUser(user); setShowDeleteModal(true); }}>Delete</Button>) : null}</Stack></CardContent></Card></Grid>))}</ReportCardGrid>
      ) : null}
      <Dialog open={showEditModal} onClose={() => setShowEditModal(false)} fullWidth maxWidth="md"><DialogContent sx={{ p: 1 }}><EditUser userId={selectedUserId} closeModal={() => { setShowEditModal(false); loadUsers(); }} /></DialogContent></Dialog>
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} fullWidth maxWidth="md"><DialogContent sx={{ p: 1 }}><AddUser closeModal={() => { setShowAddModal(false); loadUsers(); }} /></DialogContent></Dialog>
      <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}><DialogTitle>Delete user</DialogTitle><DialogContent><Typography variant="body2">Delete {selectedUser?.User_name || 'this user'}?</Typography></DialogContent><DialogActions><Button onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button></DialogActions></Dialog>
    </ReportPageShell>
  );
}

function InfoRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600} textAlign="right">{value}</Typography>
    </Stack>
  );
}
