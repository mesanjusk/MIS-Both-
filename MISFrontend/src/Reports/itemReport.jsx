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
import EditItem from './editItem';
import AddItem from '../Pages/addItem';
import { ReportCardGrid, ReportFilterBar, ReportPageShell, ReportTableCard } from '../components/reports/ReportShell';
import { EmptyState, LoadingState } from '../components/ui';

export default function ItemReport() {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userGroup, setUserGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');

  const loadItems = async () => {
    setLoading(true);
    try {
      setUserGroup(localStorage.getItem('User_group') || '');
      const res = await axios.get('/api/items/GetItemList');
      const rows = res?.data?.success ? res.data.result || [] : [];
      setItems(rows.sort((a, b) => String(a.Item_name || '').localeCompare(String(b.Item_name || ''))));
    } catch (error) {
      console.error('Error fetching items list:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const filtered = useMemo(
    () => items.filter((item) => [item.Item_name, item.Item_group].filter(Boolean).some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase()))),
    [items, searchTerm],
  );

  const handleDeleteConfirm = async () => {
    if (!selectedItem?._id) return;
    try {
      const res = await axios.delete(`/item/Delete/${selectedItem._id}`);
      if (res?.data?.success) {
        setItems((prev) => prev.filter((item) => item._id !== selectedItem._id));
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <ReportPageShell
      title="Items Report"
      subtitle="Track item masters in a clean table or card layout."
      count={filtered.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print</Button><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddModal(true)}>Add Item</Button></Stack>}
    >
      <ReportFilterBar>
        <Grid item xs={12}><TextField fullWidth size="small" label="Search item or group" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></Grid>
      </ReportFilterBar>
      {loading ? <LoadingState label="Loading items" /> : null}
      {!loading && filtered.length === 0 ? <EmptyState title="No items found" /> : null}
      {!loading && filtered.length > 0 && viewMode === 'table' ? (
        <ReportTableCard>
          <Table size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Item Name</TableCell><TableCell sx={{ fontWeight: 800 }}>Group</TableCell>{userGroup === 'Admin User' ? <TableCell sx={{ fontWeight: 800 }}>Actions</TableCell> : null}</TableRow></TableHead><TableBody>{filtered.map((item) => (<TableRow hover key={item._id}><TableCell><Button size="small" onClick={() => { setSelectedItemId(item._id); setShowEditModal(true); }}>{item.Item_name}</Button></TableCell><TableCell>{item.Item_group || '-'}</TableCell>{userGroup === 'Admin User' ? <TableCell><IconButton size="small" color="error" onClick={() => { setSelectedItem(item); setShowDeleteModal(true); }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></TableCell> : null}</TableRow>))}</TableBody></Table>
        </ReportTableCard>
      ) : null}
      {!loading && filtered.length > 0 && viewMode === 'grid' ? (
        <ReportCardGrid>{filtered.map((item) => (<Grid item xs={12} sm={6} md={4} key={item._id}><Card elevation={0} sx={{ borderRadius: 3, height: '100%' }}><CardContent><Stack spacing={1.2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={800}>{item.Item_name}</Typography><IconButton size="small" onClick={() => { setSelectedItemId(item._id); setShowEditModal(true); }}><EditRoundedIcon fontSize="small" /></IconButton></Stack><Typography variant="body2" color="text.secondary">Item Group: {item.Item_group || '-'}</Typography>{userGroup === 'Admin User' ? <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { setSelectedItem(item); setShowDeleteModal(true); }}>Delete</Button> : null}</Stack></CardContent></Card></Grid>))}</ReportCardGrid>
      ) : null}
      <Dialog open={showEditModal} onClose={() => setShowEditModal(false)} fullWidth maxWidth="sm"><DialogContent sx={{ p: 1 }}><EditItem itemId={selectedItemId} closeModal={() => { setShowEditModal(false); loadItems(); }} /></DialogContent></Dialog>
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} fullWidth maxWidth="sm"><DialogContent sx={{ p: 1 }}><AddItem closeModal={() => { setShowAddModal(false); loadItems(); }} /></DialogContent></Dialog>
      <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}><DialogTitle>Delete item</DialogTitle><DialogContent><Typography variant="body2">Delete {selectedItem?.Item_name || 'this item'}?</Typography></DialogContent><DialogActions><Button onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button></DialogActions></Dialog>
    </ReportPageShell>
  );
}
