import { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient.js';

const money = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const AllTransaction = () => {
  const [transactions, setTransactions]     = useState([]);
  const [customers, setCustomers]           = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [startDate, setStartDate]           = useState('');
  const [endDate, setEndDate]               = useState('');
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading]               = useState(true);
  const [searching, setSearching]           = useState(false);
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [hasSearched, setHasSearched]       = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get('/api/transaction'),
      axios.get('/api/customers/GetCustomersList'),
    ])
      .then(([txRes, custRes]) => {
        if (txRes.data.success)   setTransactions(txRes.data.result);
        if (custRes.data.success) setCustomers(custRes.data.result);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const bankAccounts = customers.filter((c) => c.Customer_group === 'Bank and Account');
  const customerMap  = customers.reduce((acc, c) => { acc[c.Customer_uuid] = c.Customer_name; return acc; }, {});

  const doSearch = useCallback((customer = selectedCustomer) => {
    if (!customer) return;
    setSearching(true);
    setHasSearched(true);

    const uuid = customer.Customer_uuid;
    let runDr = 0, runCr = 0;

    const filtered = transactions.flatMap((txn) => {
      const inRange =
        (!startDate || new Date(txn.Transaction_date) >= new Date(startDate)) &&
        (!endDate   || new Date(txn.Transaction_date) <= new Date(endDate));
      if (!inRange) return [];
      if (!txn.Journal_entry.some((e) => e.Account_id === uuid)) return [];
      return txn.Journal_entry
        .filter((e) => e.Account_id !== uuid)
        .map((e) => ({
          ...e,
          Transaction_id:   txn.Transaction_id,
          Transaction_date: txn.Transaction_date,
          Description:      txn.Description,
        }));
    });

    const withBalance = filtered.map((e) => {
      if (e.Type === 'Debit') runDr += e.Amount || 0;
      else                    runCr += e.Amount || 0;
      return { ...e, Balance: runCr - runDr };
    });

    let opDr = 0, opCr = 0;
    if (startDate) {
      transactions.forEach((txn) => {
        if (new Date(txn.Transaction_date) >= new Date(startDate)) return;
        if (!txn.Journal_entry.some((e) => e.Account_id === uuid)) return;
        txn.Journal_entry.filter((e) => e.Account_id !== uuid).forEach((e) => {
          if (e.Type === 'Debit') opDr += e.Amount || 0;
          else                    opCr += e.Amount || 0;
        });
      });
    }

    setOpeningBalance(opCr - opDr);
    setClosingBalance(runCr - runDr);
    setFilteredEntries(withBalance);
    setSearching(false);
  }, [transactions, selectedCustomer, startDate, endDate]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`/api/transaction/${deleteTarget.Transaction_id}`);
      setFilteredEntries((prev) =>
        prev.filter(
          (e) => !(e.Transaction_id === deleteTarget.Transaction_id && e.Account_id === deleteTarget.Account_id)
        )
      );
    } catch (err) { console.error(err); }
    finally { setDeleteTarget(null); }
  };

  const totals = filteredEntries.reduce(
    (acc, e) => {
      if (e.Type === 'Debit') acc.debit  += e.Amount || 0;
      else                    acc.credit += e.Amount || 0;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>

      {/* ── LEFT sidebar ── */}
      <Paper
        variant="outlined"
        sx={{
          width: 240, flexShrink: 0, borderRadius: 3,
          display: { xs: 'none', md: 'flex' }, flexDirection: 'column',
          p: 2, gap: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>Filters</Typography>
        <Divider />

        <Stack spacing={1.5}>
          <TextField
            label="From"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>

        <Divider />

        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Quick Select
        </Typography>
        <Stack spacing={0.75}>
          {bankAccounts.map((c) => (
            <Chip
              key={c.Customer_uuid}
              label={c.Customer_name}
              clickable
              color={selectedCustomer?.Customer_uuid === c.Customer_uuid ? 'primary' : 'default'}
              variant={selectedCustomer?.Customer_uuid === c.Customer_uuid ? 'filled' : 'outlined'}
              onClick={() => { setSelectedCustomer(c); setTimeout(() => doSearch(c), 0); }}
              sx={{ justifyContent: 'flex-start' }}
            />
          ))}
        </Stack>

        <Divider />

        <Autocomplete
          size="small"
          options={customers}
          getOptionLabel={(o) => o.Customer_name || ''}
          value={selectedCustomer}
          onChange={(_, v) => setSelectedCustomer(v)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search Account"
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          )}
        />

        <Button
          variant="contained"
          fullWidth
          onClick={() => doSearch()}
          disabled={!selectedCustomer || searching}
          startIcon={searching ? <CircularProgress size={14} /> : <SearchRoundedIcon />}
        >
          {searching ? 'Loading…' : 'Search'}
        </Button>
      </Paper>

      {/* ── RIGHT main ── */}
      <Box sx={{ flex: 1, minWidth: 0 }}>

        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>Account Transaction</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedCustomer
                ? `Ledger for ${selectedCustomer.Customer_name}`
                : 'Select an account from the left panel'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {hasSearched && (
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={() => doSearch()}>
                  <RefreshRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Print">
              <IconButton size="small" onClick={() => window.print()}>
                <PrintRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Loading */}
        {loading && (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
        )}

        {/* Initial placeholder */}
        {!loading && !hasSearched && (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Select an account from the left and click <strong>Search</strong> to view its ledger.
            </Typography>
          </Paper>
        )}

        {/* Results */}
        {!loading && hasSearched && (
          <>
            {/* Summary cards */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              {[
                { label: 'Opening Balance',   value: openingBalance, color: 'text.primary' },
                { label: 'Total Debit (DR)',   value: totals.debit,   color: 'success.dark' },
                { label: 'Total Credit (CR)',  value: totals.credit,  color: 'error.dark' },
                { label: 'Closing Balance',    value: closingBalance, color: closingBalance >= 0 ? 'success.dark' : 'error.dark' },
              ].map(({ label, value, color }) => (
                <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
                  <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="h6" fontWeight={900} color={color}>{money(value)}</Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>

            {filteredEntries.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                No transactions found for the selected account and date range.
              </Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 700, width: 55 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 110 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'success.dark' }}>Debit (DR)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.dark' }}>Credit (CR)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
                      <TableCell sx={{ width: 44 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredEntries.map((entry, i) => (
                      <TableRow
                        key={i}
                        hover
                        sx={{ bgcolor: entry.Type === 'Debit' ? 'success.50' : 'error.50' }}
                      >
                        <TableCell sx={{ color: 'text.disabled', fontSize: 11 }}>
                          {entry.Transaction_id}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {fmtDate(entry.Transaction_date)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={customerMap[entry.Account_id] || entry.Account_id}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: 12 }}>
                            {entry.Description}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {entry.Type === 'Debit' ? (
                            <Typography variant="body2" fontWeight={700} color="success.dark">
                              {money(entry.Amount)}
                            </Typography>
                          ) : (
                            <Typography color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {entry.Type === 'Credit' ? (
                            <Typography variant="body2" fontWeight={700} color="error.dark">
                              {money(entry.Amount)}
                            </Typography>
                          ) : (
                            <Typography color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            color={entry.Balance >= 0 ? 'success.dark' : 'error.dark'}
                          >
                            {money(entry.Balance)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Delete transaction">
                            <IconButton size="small" color="error" onClick={() => setDeleteTarget(entry)}>
                              <DeleteRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Delete Transaction?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete transaction <strong>#{deleteTarget?.Transaction_id}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AllTransaction;
