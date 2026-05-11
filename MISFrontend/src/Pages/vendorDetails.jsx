import toast from 'react-hot-toast';
import React, { useEffect, useState } from 'react';
import axios from '../apiClient.js';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete,
  Button,
  MenuItem,
  Stack,
  TextField,
  Paper,
} from '@mui/material';
import { FullscreenAddFormLayout } from '../Components/ui';
import { compactCardSx, compactFieldSx } from '../Components/ui/addFormStyles';

export default function VendorDetails({ onClose, order }) {
  const [vendorOptions, setVendorOptions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [Amount, setAmount] = useState('');
  const [Description, setDescription] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorInputValue, setVendorInputValue] = useState('');
  const [selectedTaskGroup, setSelectedTaskGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const loggedInUser = localStorage.getItem('User_name') || 'Admin';

  useEffect(() => {
    axios.get('/api/taskgroup/GetTaskgroupList')
      .then((res) => {
        if (res.data.success) {
          setTasks(
            res.data.result.filter(
              (t) =>
                t.Task_group.trim().toLowerCase() !== 'delivered' &&
                t.Task_group.trim().toLowerCase() !== 'cancel'
            )
          );
        }
      })
      .catch((err) => console.error('Error fetching tasks:', err));
  }, []);

  useEffect(() => {
    axios.get('/api/customers/GetCustomersList')
      .then((res) => {
        if (res.data.success) setVendorOptions(res.data.result);
      })
      .catch(() => toast.error('Error fetching vendors'));
  }, []);

  const taskOptions = [...new Set(tasks.map((t) => t.Task_group.trim()))];

  const handleTaskGroupChange = (taskGroup) => {
    setSelectedTaskGroup((prev) => (prev === taskGroup ? null : taskGroup));
  };

  const closeModal = () => (onClose ? onClose() : navigate('/allOrder'));

  async function submit(e) {
    e.preventDefault();
    if (!selectedTaskGroup) return toast.error('Select a task group.');
    if (!selectedVendor) return toast.error('Select a vendor.');
    if (!Amount || Number(Amount) <= 0) return toast.error('Enter a valid amount.');

    // DR Job Work Expense (backend resolves name → UUID), CR Vendor UUID
    const journal = [
      { Account_id: 'Job Work Expense', Type: 'Debit',  Amount: Number(Amount) },
      { Account_id: selectedVendor.Customer_uuid, Type: 'Credit', Amount: Number(Amount) },
    ];

    try {
      setLoading(true);
      const res = await axios.post('/api/transaction/addTransaction', {
        Description: Description || `${selectedTaskGroup} - ${selectedVendor.Customer_name}`,
        Total_Credit: Number(Amount),
        Total_Debit: Number(Amount),
        Payment_mode: selectedVendor.Customer_uuid,
        Journal_entry: journal,
        Created_by: loggedInUser,
      });

      if (!res.data.success) {
        toast.error('Failed to add transaction.');
        return;
      }

      toast.success('Vendor payment recorded.');
      closeModal();
    } catch (err) {
      console.error('Error saving vendor transaction:', err);
      toast.error('Submission error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <FullscreenAddFormLayout
      onSubmit={submit}
      onClose={closeModal}
      submitLabel={loading ? 'Saving...' : 'Submit'}
      busy={loading}
    >
      <Paper sx={compactCardSx}>
        <Stack spacing={1}>
          <TextField
            select
            label="Task Group"
            value={selectedTaskGroup || ''}
            onChange={(e) => setSelectedTaskGroup(e.target.value || null)}
            size="small"
            sx={compactFieldSx}
          >
            <MenuItem value="">Select task group</MenuItem>
            {taskOptions.map((tg) => (
              <MenuItem key={tg} value={tg}>{tg}</MenuItem>
            ))}
          </TextField>

          {selectedTaskGroup && (
            <>
              <Autocomplete
                options={vendorOptions}
                value={selectedVendor}
                inputValue={vendorInputValue}
                onInputChange={(_, value) => {
                  setVendorInputValue(value || '');
                  if (!value) setSelectedVendor(null);
                }}
                onChange={(_, value) => {
                  setSelectedVendor(value || null);
                  setVendorInputValue(value?.Customer_name || '');
                }}
                getOptionLabel={(opt) => opt?.Customer_name || ''}
                isOptionEqualToValue={(opt, val) => opt?.Customer_uuid === val?.Customer_uuid}
                renderInput={(params) => (
                  <TextField {...params} label="Vendor" placeholder="Search vendor" size="small" sx={compactFieldSx} />
                )}
              />

              <TextField
                label="Amount (₹)"
                type="number"
                value={Amount}
                onChange={(e) => setAmount(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                size="small"
                sx={compactFieldSx}
              />

              <TextField
                label="Description"
                value={Description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Payment description"
                size="small"
                sx={compactFieldSx}
              />
            </>
          )}
        </Stack>
      </Paper>
    </FullscreenAddFormLayout>
  );
}
