import { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient';
import toast from 'react-hot-toast';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

const TYPE_COLORS = {
  Asset:     'info',
  Liability: 'warning',
  Income:    'success',
  Expense:   'error',
  Equity:    'secondary',
};

export default function OpeningBalance() {
  const [accounts, setAccounts] = useState([]);
  const [existingBalances, setExistingBalances] = useState({});
  const [inputs, setInputs] = useState({});   // accountUuid → { amount: string, side: 'debit'|'credit' }
  const [saving, setSaving] = useState({});   // accountUuid → bool
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openingDate, setOpeningDate] = useState(() => {
    const now = new Date();
    const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${fyYear}-04-01`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [acctRes, balRes] = await Promise.all([
        axios.get('/api/accounts'),
        axios.get('/api/accounts/opening-balance'),
      ]);
      const accts = Array.isArray(acctRes?.data?.accounts) ? acctRes.data.accounts : [];
      // Filter out the equity contra-account from the editable list
      const editable = accts.filter(
        (a) => a.Account_name?.toLowerCase() !== 'opening balance equity'
      );
      setAccounts(editable);

      const balMap = acctRes?.data?.balances || balRes?.data?.balances || {};
      setExistingBalances(balMap);

      // Pre-fill inputs from existing balances
      const init = {};
      for (const [uuid, entry] of Object.entries(balMap)) {
        init[uuid] = { amount: String(entry.amount), side: entry.side };
      }
      setInputs(init);
    } catch (e) {
      setError(`Failed to load accounts. ${e?.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setInput(uuid, field, value) {
    setInputs((prev) => ({ ...prev, [uuid]: { ...(prev[uuid] || { amount: '', side: 'debit' }), [field]: value } }));
  }

  function defaultSide(account) {
    return account.Normal_balance_side || 'debit';
  }

  async function saveOne(account) {
    const uuid = account.Account_uuid;
    const input = inputs[uuid] || {};
    const amount = parseFloat(String(input.amount || '').replace(/[₹,\s]/g, ''));
    const side = input.side || defaultSide(account);

    if (!amount || amount <= 0) {
      toast.error('Enter a positive amount first');
      return;
    }

    setSaving((p) => ({ ...p, [uuid]: true }));
    try {
      await axios.post('/api/accounts/opening-balance', {
        accountUuid: uuid,
        amount,
        side,
        date: openingDate,
      });
      toast.success(`Opening balance saved for ${account.Account_name}`);
      // Refresh balances
      const balRes = await axios.get('/api/accounts/opening-balance');
      setExistingBalances(balRes?.data?.balances || {});
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving((p) => ({ ...p, [uuid]: false }));
    }
  }

  async function deleteOne(account) {
    const uuid = account.Account_uuid;
    if (!existingBalances[uuid]) return;
    setSaving((p) => ({ ...p, [uuid]: true }));
    try {
      await axios.delete(`/api/accounts/opening-balance/${uuid}`);
      toast.success(`Opening balance cleared for ${account.Account_name}`);
      setInputs((p) => { const n = { ...p }; delete n[uuid]; return n; });
      setExistingBalances((p) => { const n = { ...p }; delete n[uuid]; return n; });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to delete');
    } finally {
      setSaving((p) => ({ ...p, [uuid]: false }));
    }
  }

  const groups = accounts.reduce((acc, a) => {
    const g = a.Account_group || a.Account_type || 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(a);
    return acc;
  }, {});

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Opening Balance</Typography>
          <Typography variant="body2" color="text.secondary">
            Set the starting balance for each account at the beginning of your financial year
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            type="date"
            size="small"
            label="Opening Date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 180 }}
          />
          <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {loading ? (
        <Stack alignItems="center" justifyContent="center" minHeight="40vh">
          <CircularProgress />
        </Stack>
      ) : (
        Object.entries(groups).map(([groupName, groupAccounts]) => (
          <Box key={groupName} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>
              {groupName}
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Account</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>Current Balance</strong></TableCell>
                    <TableCell><strong>Opening Amount</strong></TableCell>
                    <TableCell><strong>Dr / Cr</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupAccounts.map((account) => {
                    const uuid = account.Account_uuid;
                    const input = inputs[uuid] || { amount: '', side: defaultSide(account) };
                    const existing = existingBalances[uuid];
                    const isBusy = saving[uuid];
                    return (
                      <TableRow key={uuid} hover sx={existing ? { bgcolor: 'action.selected' } : {}}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{account.Account_name}</Typography>
                          <Typography variant="caption" color="text.secondary">Code: {account.Account_code}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={account.Account_type}
                            size="small"
                            color={TYPE_COLORS[account.Account_type] || 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: account.Balance >= 0 ? 'success.main' : 'error.main' }}>
                            {money(Math.abs(account.Balance || 0))}
                            {' '}{account.Balance >= 0 ? 'Dr' : 'Cr'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: 160 }}>
                          <TextField
                            size="small"
                            type="number"
                            placeholder="0.00"
                            value={input.amount}
                            onChange={(e) => setInput(uuid, 'amount', e.target.value)}
                            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                            inputProps={{ min: 0, step: 0.01 }}
                            sx={{ width: 140 }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: 110 }}>
                          <FormControl size="small" sx={{ width: 100 }}>
                            <InputLabel>Dr/Cr</InputLabel>
                            <Select
                              value={input.side}
                              label="Dr/Cr"
                              onChange={(e) => setInput(uuid, 'side', e.target.value)}
                            >
                              <MenuItem value="debit">Debit</MenuItem>
                              <MenuItem value="credit">Credit</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : <SaveRoundedIcon />}
                              onClick={() => saveOne(account)}
                              disabled={isBusy}
                            >
                              {existing ? 'Update' : 'Save'}
                            </Button>
                            {existing && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteRoundedIcon />}
                                onClick={() => deleteOne(account)}
                                disabled={isBusy}
                              >
                                Clear
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ))
      )}
    </Box>
  );
}
