import { useEffect, useState } from 'react';
import { Alert, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { fetchOperationsUsers, fetchUserOperations } from '../services/operationsService';
import TemplateMessageComposer from '../Components/whatsappCloud/TemplateMessageComposer';

export default function TeamReminder({ initialUser = '' }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(initialUser);
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchOperationsUsers().then((res) => {
      if (!active) return;
      const rows = (res.data?.result || []).filter((user) => user.User_uuid && user.operations?.active !== false);
      setUsers(rows);
      setSelected((prev) => rows.some((row) => row.User_uuid === prev) ? prev : '');
    }).catch(() => { if (active) setError('Could not load employees.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setNumber('');
    if (selected) fetchUserOperations(selected).then((res) => {
      if (active) setNumber(String(res.data?.result?.Mobile_number || ''));
    }).catch(() => { if (active) setError('Could not load the employee number.'); });
    return () => { active = false; };
  }, [selected]);
  return <Paper variant="outlined" sx={{ p: 1.5, maxWidth: 680, borderRadius: 2 }}><Stack spacing={1.5}>
    <Typography variant="h6" fontWeight={800}>Send an employee reminder</Typography>
    <Typography variant="body2" color="text.secondary">Choose the employee, select an approved WhatsApp template and review it before sending.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField select size="small" label="Employee" value={users.some((row) => row.User_uuid === selected) ? selected : ''} disabled={loading} onChange={(event) => { setError(''); setNumber(''); setSelected(event.target.value); }} fullWidth>
      <MenuItem value="">Select employee</MenuItem>{users.map((user) => <MenuItem key={user.User_uuid} value={user.User_uuid}>{user.name || user.User_name}</MenuItem>)}
    </TextField>
    {selected && number && <Typography variant="body2">Recipient: {number}</Typography>}
    {selected && !number && <Typography variant="body2" color="text.secondary">Waiting for registered mobile number.</Typography>}
    <TemplateMessageComposer key={selected} recipient={number} disabled={!selected || !number || loading} buttonLabel="Send Reminder" />
  </Stack></Paper>;
}
