/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import axios from '../apiClient.js';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddCustomer({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || location.state?.from || '/home';

  const [form, setForm] = useState({
    Customer_name: '',
    Mobile_number: '',
    Customer_group: '',
    Status: 'active',
    Tags: [],
    PartyRoles: ['customer'],
    LastInteraction: '',
  });

  const [groupOptions, setGroupOptions] = useState([]);
  const [duplicateNameError, setDuplicateNameError] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupLoading, setGroupLoading] = useState(false);

  const canSubmit = Boolean(form.Customer_name.trim()) && Boolean(form.Customer_group.trim());

  const fetchCustomerGroups = async () => {
    try {
      const res = await axios.get('/api/customergroup/GetCustomergroupList');
      if (res.data.success) {
        const options = (res.data.result || []).map((item) => item.Customer_group).filter(Boolean);
        setGroupOptions([...new Set(options)]);
      }
    } catch (err) {
      console.error('Error fetching customer group options:', err);
    }
  };

  useEffect(() => {
    fetchCustomerGroups();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: field === 'Tags' ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : value,
    }));
  };

  const handleRoleToggle = (role) => {
    setForm((prev) => {
      const exists = prev.PartyRoles.includes(role);
      const nextRoles = exists ? prev.PartyRoles.filter((item) => item !== role) : [...prev.PartyRoles, role];
      return {
        ...prev,
        PartyRoles: nextRoles.length ? nextRoles : ['customer'],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDuplicateNameError('');

    if (!form.Customer_name.trim()) {
      alert('Customer name is required.');
      return;
    }

    if (!form.Customer_group.trim()) {
      alert('Customer group is required.');
      return;
    }

    if (form.Mobile_number && !/^\d{10}$/.test(form.Mobile_number)) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      const duplicateRes = await axios.get(`/api/customers/checkDuplicateName?name=${encodeURIComponent(form.Customer_name.trim())}`);
      if (duplicateRes.data?.exists) {
        setDuplicateNameError('Customer name already exists.');
        return;
      }
    } catch (error) {
      console.error('Error checking for duplicate name:', error);
      alert('Error checking for duplicate name');
      return;
    }

    try {
      const payload = {
        ...form,
        Customer_name: form.Customer_name.trim(),
        Customer_group: form.Customer_group.trim(),
        Tags: [...new Set([...(form.Tags || []), ...(form.PartyRoles || [])])],
      };

      if (!payload.Mobile_number || !payload.Mobile_number.trim()) delete payload.Mobile_number;
      if (!form.LastInteraction) delete payload.LastInteraction;

      const res = await axios.post('/api/customers/addCustomer', payload);

      if (res.data.success) {
        alert('Customer added successfully');
        if (onClose) onClose();
        else {
          navigate(returnTo, {
            replace: true,
            state: {
              ...location.state,
              refreshCustomers: true,
            },
          });
        }
      } else {
        alert('Failed to add Customer.');
      }
    } catch (error) {
      console.error('Error adding customer:', error);
      alert(error?.response?.data?.message || 'Error adding customer');
    }
  };

  const handleAddGroup = async () => {
    const groupName = newGroupName.trim();
    if (!groupName) {
      alert('Please enter customer group name.');
      return;
    }

    if (groupOptions.some((item) => item.toLowerCase() === groupName.toLowerCase())) {
      handleChange('Customer_group', groupName);
      setGroupDialogOpen(false);
      setNewGroupName('');
      return;
    }

    try {
      setGroupLoading(true);
      const res = await axios.post('/api/customergroup/addCustomergroup', { Customer_group: groupName });
      if (res.data.success) {
        setGroupOptions((prev) => [...new Set([...prev, groupName])]);
        handleChange('Customer_group', groupName);
        setGroupDialogOpen(false);
        setNewGroupName('');
        alert('Customer group added successfully');
      } else {
        alert(res.data.message || 'Failed to add customer group.');
      }
    } catch (error) {
      console.error('Error adding customer group:', error);
      alert('Error adding customer group');
    } finally {
      setGroupLoading(false);
    }
  };

  const handleCancel = () => {
    if (onClose) onClose();
    else navigate(returnTo, { replace: true, state: location.state || {} });
  };

  return (
    <>
      <FullscreenAddFormLayout
        onSubmit={handleSubmit}
        onClose={handleCancel}
        submitLabel="Save Party"
        cancelLabel="Close"
        disableSubmit={!canSubmit}
      >
        <Paper sx={compactCardSx}>
          <Stack spacing={1.2}>
            <Typography variant="h6" fontWeight={700}>Add Customer / Party</Typography>
            <Typography variant="caption" color="text.secondary">One record can work as customer, vendor, or both.</Typography>

            <TextField
              label="Customer / Party Name"
              value={form.Customer_name}
              onChange={(e) => handleChange('Customer_name', e.target.value)}
              required
              error={Boolean(duplicateNameError)}
              helperText={duplicateNameError || ' '}
              size="small"
              sx={compactFieldSx}
            />

            <TextField
              label="Mobile Number"
              value={form.Mobile_number}
              onChange={(e) => {
                const value = e.target.value;
                if (/^\d{0,10}$/.test(value)) handleChange('Mobile_number', value);
              }}
              placeholder="Optional 10-digit number"
              helperText="Optional field. Leave blank for office, bank, or expense accounts."
              size="small"
              sx={compactFieldSx}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="stretch">
              <FormControl fullWidth required size="small" sx={compactFieldSx}>
                <InputLabel id="customer-group-label">Customer Group</InputLabel>
                <Select
                  labelId="customer-group-label"
                  value={form.Customer_group}
                  label="Customer Group"
                  onChange={(e) => handleChange('Customer_group', e.target.value)}
                >
                  {groupOptions.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setGroupDialogOpen(true)} sx={{ minWidth: { xs: '100%', sm: 150 } }}>
                Add Group
              </Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControlLabel
                control={<Checkbox checked={form.PartyRoles.includes('customer')} onChange={() => handleRoleToggle('customer')} size="small" />}
                label="Use as Customer"
              />
              <FormControlLabel
                control={<Checkbox checked={form.PartyRoles.includes('vendor')} onChange={() => handleRoleToggle('vendor')} size="small" />}
                label="Use as Vendor"
              />
            </Stack>

            <TextField
              label="Tags"
              value={form.Tags.join(', ')}
              onChange={(e) => handleChange('Tags', e.target.value)}
              placeholder="optional, comma separated"
              size="small"
              sx={compactFieldSx}
            />

            <FormControl fullWidth size="small" sx={compactFieldSx}>
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                value={form.Status}
                label="Status"
                onChange={(e) => handleChange('Status', e.target.value)}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Last Interaction"
              type="datetime-local"
              value={form.LastInteraction}
              onChange={(e) => handleChange('LastInteraction', e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={compactFieldSx}
            />
          </Stack>
        </Paper>
      </FullscreenAddFormLayout>

      <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField label="New Customer Group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} autoFocus size="small" sx={compactFieldSx} />
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" fullWidth onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" fullWidth onClick={handleAddGroup} disabled={groupLoading}>{groupLoading ? 'Saving...' : 'Save Group'}</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
