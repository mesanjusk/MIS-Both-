import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import axios from '../apiClient.js';
import { toast, ToastContainer } from '../Components';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddUser({ closeModal }) {
  const navigate = useNavigate();

  const [User_name, setUser_Name] = useState('');
  const [Password, setPassword] = useState('');
  const [Mobile_number, setMobile_Number] = useState('');
  const [User_group, setUser_Group] = useState('');
  const [Allowed_Task_Groups, setAllowed_Task_Groups] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [taskGroupOptions, setTaskGroupOptions] = useState([]);
  const [passwordStrength, setPasswordStrength] = useState('');

  useEffect(() => {
    axios.get('/api/usergroup/GetUsergroupList')
      .then((res) => {
        if (res.data.success) {
          const options = res.data.result.map((item) => item.User_group);
          setGroupOptions(options);
        }
      });

    axios.get('/api/taskgroup/GetTaskgroupList')
      .then((res) => {
        if (res.data.success) {
          const taskOptions = res.data.result.map((item) => item.Task_group);
          setTaskGroupOptions(taskOptions);
        }
      });
  }, []);

  const handleTaskGroupChange = (e) => {
    const selected = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
    setAllowed_Task_Groups(selected);
  };

  const evaluatePasswordStrength = (password) => {
    if (password.length < 6) return 'Weak';
    if (/[A-Z]/.test(password) && /\d/.test(password) && /[@$!%*?&#]/.test(password)) return 'Strong';
    return 'Medium';
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordStrength(evaluatePasswordStrength(value));
  };

  async function submit(e) {
    e.preventDefault();

    const phonePattern = /^[6-9]\d{9}$/;

    if (!User_name || !Password || !Mobile_number || !User_group) {
      toast.error('All fields are required');
      return;
    }

    if (!phonePattern.test(Mobile_number)) {
      toast.error('Enter a valid 10-digit mobile number starting with 6-9');
      return;
    }

    try {
      const response = await axios.post('/api/users/addUser', {
        User_name,
        Password,
        Mobile_number,
        User_group,
        Allowed_Task_Groups,
      });

      if (response.data === 'exist') {
        toast.warning('User already exists');
      } else if (response.data === 'notexist') {
        toast.success('User added successfully');
        setTimeout(() => {
          if (closeModal) closeModal();
          else navigate('/home');
        }, 1500);
      }
    } catch (err) {
      toast.error('Error submitting form');
      console.log(err);
    }
  }

  const passwordColor = passwordStrength === 'Strong' ? 'success' : passwordStrength === 'Medium' ? 'warning' : 'error';

  return (
    <FullscreenAddFormLayout
      onSubmit={submit}
      onClose={closeModal || (() => navigate('/home'))}
      submitLabel="Submit"
      cancelLabel="Cancel"
    >
      <ToastContainer position="top-center" />
      <Paper sx={compactCardSx}>
        <Stack spacing={1.2}>
          <Typography variant="h6" fontWeight={700}>Add User</Typography>

          <TextField
            label="User Name"
            autoComplete="off"
            value={User_name}
            onChange={(e) => setUser_Name(e.target.value)}
            placeholder="User Name"
            size="small"
            sx={compactFieldSx}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={Password}
            onChange={handlePasswordChange}
            placeholder="Password"
            size="small"
            sx={compactFieldSx}
          />
          {Password ? <Alert severity={passwordColor} sx={{ py: 0 }}>Strength: {passwordStrength}</Alert> : null}
          <TextField
            label="Mobile Number"
            autoComplete="off"
            value={Mobile_number}
            onChange={(e) => setMobile_Number(e.target.value)}
            placeholder="Mobile Number"
            size="small"
            sx={compactFieldSx}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              label="User Group"
              select
              fullWidth
              value={User_group}
              onChange={(e) => setUser_Group(e.target.value)}
              size="small"
              sx={compactFieldSx}
            >
              <MenuItem value="">Select Group</MenuItem>
              {groupOptions.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </TextField>

            <TextField
              label="Allowed Task Groups"
              select
              fullWidth
              SelectProps={{ multiple: true, value: Allowed_Task_Groups, onChange: handleTaskGroupChange }}
              helperText="Select one or multiple task groups"
              size="small"
              sx={compactFieldSx}
            >
              {taskGroupOptions.map((task) => (
                <MenuItem key={task} value={task}>{task}</MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={0.75} flexWrap="wrap">
            {Allowed_Task_Groups.map((task) => <Chip key={task} size="small" label={task} color="primary" variant="outlined" />)}
          </Stack>
        </Stack>
      </Paper>
    </FullscreenAddFormLayout>
  );
}
