import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
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
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient';
import { ROUTES } from '../constants/routes';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '';

function DirectionChip({ direction }) {
  return (
    <Chip
      label={direction === 'in' ? 'CR' : 'DR'}
      size="small"
      color={direction === 'in' ? 'success' : 'error'}
      variant="outlined"
      sx={{ fontWeight: 700, minWidth: 36 }}
    />
  );
}

function MatchChip({ status, score }) {
  if (status === 'matched') return (
    <Chip
      icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
      label={score ? `Matched (${score})` : 'Matched'}
      size="small" color="success" variant="filled"
    />
  );
  if (status === 'manual') return (
    <Chip
      icon={<LinkRoundedIcon sx={{ fontSize: '14px !important' }} />}
      label="Manual"
      size="small" color="primary" variant="filled"
    />
  );
  return <Chip label="Unmatched" size="small" color="warning" variant="outlined" />;
}

// ---- Statement entry row ----
// BankStatement already supports account assignment, confirmation/posting, skip/restore,
// and unlink. Keep those controls available here as well as in Day Book.
function StmtRow({
  entry,
  onUnmatch,
  onAssign,
  onConfirm,
  onReject,
  ledgerAccounts = [],
}) {
  const [editing, setEditing] = useState(false);
  const [acct, setAcct] = useState(entry.account_assigned || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setAcct(entry.account_assigned || '');
  }, [entry.account_assigned, editing]);

  const amt = entry.credit > 0 ? entry.credit : entry.debit;
  const isMatched = entry.match_status === 'matched' || entry.match_status === 'manual';
  const isConfirmed = entry.entry_status === 'confirmed';
  const isRejected = entry.entry_status === 'rejected';
  const canConfirm = Boolean(
    entry.account_assigned ||
    (entry.matched_diary_uuid && entry.matched_diary_entry_uuid)
  );

  const saveAccount = async () => {
    if (!acct || !onAssign) return;
    setSaving(true);
    try {
      const saved = await onAssign(entry.entry_uuid, acct);
      if (saved !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow
      hover
      sx={{
        bgcolor: isConfirmed
          ? 'success.50'
          : isRejected
          ? 'error.50'
          : isMatched
          ? 'success.50'
          : 'warning.50',
        opacity: isRejected ? 0.55 : 1,
      }}
    >
      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDate(entry.txn_date)}</TableCell>
      <TableCell sx={{ maxWidth: 320 }}>
        <Typography variant="body2" sx={{ fontSize: 12 }}>{entry.description}</Typography>
        {entry.ref_no && (
          <Typography variant="caption" color="text.disabled">{entry.ref_no}</Typography>
        )}
      </TableCell>
      <TableCell align="center"><DirectionChip direction={entry.direction} /></TableCell>
      <TableCell align="right">
        <Typography variant="body2" fontWeight={700}>{money(amt)}</Typography>
      </TableCell>

      <TableCell sx={{ minWidth: 125 }}>
        <Stack spacing={0.25}>
          <MatchChip status={entry.match_status} score={entry.match_score} />
          {entry.matched_party && (
            <Typography variant="caption" color="text.secondary">{entry.matched_party}</Typography>
          )}
        </Stack>
      </TableCell>

      <TableCell sx={{ minWidth: 220 }}>
        {editing ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Autocomplete
              freeSolo
              size="small"
              options={ledgerAccounts}
              value={acct}
              onInputChange={(_, v) => setAcct(v)}
              onChange={(_, v) => setAcct(v || '')}
              renderInput={(params) => (
                <TextField {...params} placeholder="Select or type account" sx={{ width: 190 }} />
              )}
            />
            <IconButton
              size="small"
              color="success"
              onClick={saveAccount}
              disabled={saving || !acct}
            >
              <CheckCircleRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => {
                setEditing(false);
                setAcct(entry.account_assigned || '');
              }}
            >
              <CancelRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : entry.account_assigned ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip label={entry.account_assigned} size="small" color="primary" variant="outlined" />
            {!isConfirmed && !isRejected && onAssign && (
              <IconButton
                size="small"
                onClick={() => {
                  setAcct(entry.account_assigned);
                  setEditing(true);
                }}
              >
                <EditRoundedIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        ) : (
          !isConfirmed && !isRejected && onAssign && (
            <Button
              size="small"
              variant="outlined"
              color={isMatched ? 'success' : 'warning'}
              startIcon={<EditRoundedIcon sx={{ fontSize: 13 }} />}
              onClick={() => setEditing(true)}
              sx={{ fontSize: 11, py: 0.25, px: 1, whiteSpace: 'nowrap' }}
            >
              Assign Account
            </Button>
          )
        )}
      </TableCell>

      <TableCell align="center" sx={{ minWidth: 130 }}>
        {isConfirmed ? (
          <Chip label="✓ Confirmed" color="success" size="small" />
        ) : isRejected ? (
          <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
            <Chip label="Skipped" color="error" size="small" />
            {onReject && (
              <Tooltip title="Restore entry">
                <IconButton size="small" color="warning" onClick={() => onReject(entry.entry_uuid, false)}>
                  <CancelRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
            {canConfirm && onConfirm && (
              <Tooltip title={isMatched ? 'Link matched Diary transaction / post to ledger' : 'Confirm & post to ledger'}>
                <Button
                  size="small"
                  variant="contained"
                  color={isMatched ? 'success' : 'primary'}
                  onClick={() => onConfirm(entry.entry_uuid)}
                  sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: 11, height: 24 }}
                >
                  {isMatched ? '✓ Link' : '✓ Post'}
                </Button>
              </Tooltip>
            )}
            {onReject && (
              <Tooltip title="Skip this bank entry">
                <IconButton size="small" color="error" onClick={() => onReject(entry.entry_uuid, true)}>
                  <CancelRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {isMatched && onUnmatch && (
              <Tooltip title="Remove Diary match">
                <IconButton size="small" color="warning" onClick={() => onUnmatch(entry.entry_uuid)}>
                  <LinkOffRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
      </TableCell>
    </TableRow>
  );
}

// ===================== MAIN PAGE =====================
export default function BankReconciliation() {
  const navigate = useNavigate();
  const { uuid: selectedUuid } = useParams();

  const [csvText, setCsvText]         = useState('');
  const [pdfFile, setPdfFile]         = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [stmtList, setStmtList]       = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [stmt, setStmt]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [successMsg, setSuccessMsg]   = useState('');
  const [ledgerAccounts, setLedgerAccounts] = useState([]);
  const [bankLedgerOptions, setBankLedgerOptions] = useState([]);
  const [bankLedgerSaving, setBankLedgerSaving] = useState(false);

  const loggedInUser = localStorage.getItem('User_name') || 'user';

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await axios.get('/api/bank-statement');
      setStmtList(Array.isArray(res.data?.result) ? res.data.result : []);
    } catch { setStmtList([]); }
    finally { setListLoading(false); }
  }, []);

  const loadStmt = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      // Synchronize legacy confirmed rows before rendering. This endpoint is
      // idempotent: it links an existing Diary/manual transaction when one
      // already represents the bank movement, otherwise it repairs/posts the
      // bank-owned transaction into the configured bank ledger.
      const syncRes = await axios.post(`/api/bank-statement/${uid}/sync-ledger`, {
        synced_by: loggedInUser,
      });
      setStmt(syncRes.data?.result || null);
    } catch (syncErr) {
      // Reconciliation should still be viewable even if a legacy row needs
      // manual review, so fall back to the normal read endpoint.
      try {
        const res = await axios.get(`/api/bank-statement/${uid}`);
        setStmt(res.data?.result || null);
        if (syncErr?.response?.status && syncErr.response.status !== 409) {
          setError(syncErr?.response?.data?.message || 'Could not synchronize confirmed entries with the ledger.');
        }
      } catch {
        setError('Could not load statement.');
      }
    } finally {
      setLoading(false);
    }
  }, [loggedInUser]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selectedUuid) loadStmt(selectedUuid); }, [selectedUuid, loadStmt]);

  useEffect(() => {
    Promise.all([
      axios.get('/api/customers/GetCustomersList'),
      axios.get('/api/bank-statement/ledger-accounts'),
    ])
      .then(([customerRes, bankRes]) => {
        const all = Array.isArray(customerRes.data?.result) ? customerRes.data.result : [];
        setLedgerAccounts(all.map((row) => row.Customer_name).filter(Boolean).sort());
        setBankLedgerOptions(Array.isArray(bankRes.data?.result) ? bankRes.data.result : []);
      })
      .catch(() => {
        setLedgerAccounts([]);
        setBankLedgerOptions([]);
      });
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
      setPdfFile(file);
      setCsvText('');
    } else {
      setPdfFile(null);
      const reader = new FileReader();
      reader.onload = (ev) => setCsvText(ev.target.result);
      reader.readAsText(file);
    }
  };

  const handleUpload = async () => {
    if (!pdfFile && !csvText.trim()) return;
    setUploading(true);
    setUploadError('');
    try {
      let res;
      if (pdfFile) {
        const formData = new FormData();
        formData.append('pdf', pdfFile);
        formData.append('uploaded_by', loggedInUser);
        res = await axios.post('/api/bank-statement/upload-pdf', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await axios.post('/api/bank-statement/upload-csv', {
          csv_text: csvText,
          uploaded_by: loggedInUser,
        });
      }
      const newUuid = res.data?.result?.statement_uuid;
      await loadList();
      setCsvText('');
      setPdfFile(null);
      if (newUuid) navigate(`${ROUTES.BANK_RECONCILIATION}/${newUuid}`);
    } catch (err) {
      setUploadError(err?.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleUnmatch = async (entryUuid) => {
    if (!stmt) return;
    try {
      const res = await axios.put(`/api/bank-statement/${stmt.statement_uuid}/entry/${entryUuid}`, {
        match_status: 'unmatched',
        matched_diary_uuid: null,
        matched_diary_entry_uuid: null,
        matched_party: '',
      });
      setStmt(res.data?.result || stmt);
    } catch { setError('Could not update entry.'); }
  };

  const handleAssign = useCallback(async (entryUuid, account) => {
    if (!stmt) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.put(`/api/bank-statement/${stmt.statement_uuid}/entry/${entryUuid}`, {
        account_assigned: account,
      });
      setStmt(res.data?.result || stmt);
      setSuccessMsg('Account assigned.');
      return true;
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not assign account.');
      return false;
    }
  }, [stmt]);

  const handleConfirm = useCallback(async (entryUuid) => {
    if (!stmt) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.post(
        `/api/bank-statement/${stmt.statement_uuid}/entry/${entryUuid}/confirm`,
        { confirmed_by: loggedInUser },
      );
      setStmt(res.data?.result || stmt);
      setSuccessMsg(res.data?.message || 'Bank entry confirmed.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not confirm bank entry.');
    }
  }, [stmt, loggedInUser]);

  const handleBankLedgerChange = useCallback(async (option) => {
    if (!stmt || !option?.uuid) return;
    setBankLedgerSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.put(
        `/api/bank-statement/${stmt.statement_uuid}/ledger-account`,
        { ledger_account_uuid: option.uuid },
      );
      setStmt(res.data?.result || stmt);
      const stats = res.data?.sync || {};
      const repaired = Number(stats.reposted || 0) + Number(stats.created || 0);
      const linked = Number(stats.linked || 0);
      setSuccessMsg(
        `${res.data?.message || 'Bank ledger updated.'} ` +
        `(${repaired} posted/repaired, ${linked} linked to existing ledger transactions)`
      );
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not set the bank ledger.');
    } finally {
      setBankLedgerSaving(false);
    }
  }, [stmt]);

  const handleReject = useCallback(async (entryUuid, reject) => {
    if (!stmt) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.put(`/api/bank-statement/${stmt.statement_uuid}/entry/${entryUuid}`, {
        entry_status: reject ? 'rejected' : 'pending',
      });
      setStmt(res.data?.result || stmt);
      setSuccessMsg(reject ? 'Bank entry skipped.' : 'Bank entry restored.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update bank entry.');
    }
  }, [stmt]);

  // Derived
  const entries    = stmt?.entries || [];
  const matched    = entries.filter((e) => e.match_status === 'matched' || e.match_status === 'manual');
  const unmatched  = entries.filter((e) => e.match_status === 'unmatched');
  const totalIn    = entries.filter((e) => e.direction === 'in').reduce((s, e) => s + e.credit, 0);
  const totalOut   = entries.filter((e) => e.direction === 'out').reduce((s, e) => s + e.debit, 0);

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>

      {/* ---- LEFT sidebar ---- */}
      <Paper
        variant="outlined"
        sx={{ width: 220, flexShrink: 0, borderRadius: 3, display: { xs: 'none', md: 'flex' }, flexDirection: 'column' }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, pb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>Statements</Typography>
          <IconButton size="small" onClick={loadList}><RefreshRoundedIcon fontSize="small" /></IconButton>
        </Stack>
        <Divider />
        {listLoading ? (
          <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
        ) : (
          <List dense disablePadding sx={{ flex: 1, overflowY: 'auto' }}>
            {stmtList.map((s) => {
              const periodStr = s.period_start
                ? `${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`
                : 'Unknown period';
              return (
                <ListItem key={s.statement_uuid} disablePadding>
                  <ListItemButton
                    selected={s.statement_uuid === selectedUuid}
                    onClick={() => navigate(`${ROUTES.BANK_RECONCILIATION}/${s.statement_uuid}`)}
                    sx={{ borderRadius: 2 }}
                  >
                    <ListItemText
                      primary={s.account_name || 'Bank Account'}
                      secondary={periodStr}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
            {!stmtList.length && (
              <ListItem>
                <ListItemText
                  primary="No statements yet"
                  secondary="Upload SBI PDF / CSV / TXT"
                  primaryTypographyProps={{ variant: 'caption', color: 'text.disabled' }}
                />
              </ListItem>
            )}
          </List>
        )}
      </Paper>

      {/* ---- RIGHT panel ---- */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>Bank Reconciliation</Typography>
            <Typography variant="body2" color="text.secondary">
              Upload SBI bank statement (PDF, CSV, or notepad TXT) — auto-matched against diary bank entries
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate(ROUTES.DAY_BOOK)}
          >
            View Day Book
          </Button>
        </Stack>

        {/* Upload section */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            Upload SBI Bank Statement
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadFileRoundedIcon />}
                color={pdfFile ? 'success' : 'primary'}
              >
                {pdfFile ? `${pdfFile.name}` : 'Choose PDF / CSV / TXT'}
                <input
                  type="file"
                  accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
              {pdfFile && (
                <Button size="small" color="warning" onClick={() => setPdfFile(null)}>
                  Clear
                </Button>
              )}
            </Stack>

            {!pdfFile && (
              <>
                <Typography variant="caption" color="text.secondary">— or paste CSV / text statement below —</Typography>
                <TextField
                  multiline
                  minRows={3}
                  maxRows={8}
                  fullWidth
                  placeholder={`Txn Date,Value Date,Description,Ref No./Cheque No.,Branch Code,Debit,Credit,Balance\n09/04/2026,09/04/2026,UPI/CR/12345/MAHI CREATION,,0,0,3000.00,50000.00`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  size="small"
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                />
              </>
            )}

            {uploadError && <Alert severity="error" sx={{ borderRadius: 2 }}>{uploadError}</Alert>}
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={uploading || (!pdfFile && !csvText.trim())}
              startIcon={uploading ? <CircularProgress size={14} /> : <AddRoundedIcon />}
              sx={{ alignSelf: 'flex-start' }}
            >
              {uploading ? 'Processing…' : 'Upload & Auto-Match'}
            </Button>
          </Stack>
        </Paper>

        {/* No statement selected */}
        {!selectedUuid && !loading && (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Upload a PDF, CSV, or TXT bank statement above, or select one from the list.
            </Typography>
          </Paper>
        )}

        {loading && (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

        {stmt && !loading && (
          <>
            {/* Summary */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>{stmt.account_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {fmtDate(stmt.period_start)} – {fmtDate(stmt.period_end)}
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ minWidth: 230 }}>
                  <Typography variant="caption" color="text.secondary">Statement posts to bank ledger</Typography>
                  <Autocomplete
                    size="small"
                    options={bankLedgerOptions}
                    getOptionLabel={(option) => option?.name || ''}
                    value={
                      bankLedgerOptions.find(
                        (option) => String(option.uuid) === String(stmt.ledger_account_uuid || '')
                      ) || null
                    }
                    onChange={(_, option) => {
                      if (option) handleBankLedgerChange(option);
                    }}
                    loading={bankLedgerSaving}
                    disableClearable
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder={stmt.ledger_account_name || 'Select bank ledger'}
                        helperText={
                          stmt.ledger_account_locked
                            ? 'Locked to this MIS ledger'
                            : 'Auto-detected — choose here if it is wrong'
                        }
                      />
                    )}
                    sx={{ mt: 0.5 }}
                  />
                </Box>
                <Divider orientation="vertical" flexItem />
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Box>
                    <Typography variant="caption" color="text.secondary">Total Credits (IN)</Typography>
                    <Typography variant="body1" fontWeight={700} color="success.dark">{money(totalIn)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Total Debits (OUT)</Typography>
                    <Typography variant="body1" fontWeight={700} color="error.dark">{money(totalOut)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Entries</Typography>
                    <Typography variant="body1" fontWeight={700}>{entries.length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Matched</Typography>
                    <Typography variant="body1" fontWeight={700} color="success.main">{matched.length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Unmatched</Typography>
                    <Typography variant="body1" fontWeight={700} color="warning.main">{unmatched.length}</Typography>
                  </Box>
                </Stack>
              </Stack>
            </Paper>

            {unmatched.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
                <strong>{unmatched.length} unmatched entries</strong> — assign the correct account below and click <strong>Post</strong>,
                or skip the row if it should not be posted. Auto-matched rows can be linked to the existing Diary transaction.
              </Alert>
            )}

            {/* Matched entries */}
            {matched.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} color="success.dark" sx={{ mb: 1 }}>
                  ✓ Matched ({matched.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'success.50' }}>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="center">Dir</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Match</TableCell>
                        <TableCell>Account</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matched.map((e) => (
                        <StmtRow
                          key={e.entry_uuid}
                          entry={e}
                          onUnmatch={handleUnmatch}
                          onAssign={handleAssign}
                          onConfirm={handleConfirm}
                          onReject={handleReject}
                          ledgerAccounts={ledgerAccounts}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Unmatched entries */}
            {unmatched.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} color="warning.dark" sx={{ mb: 1 }}>
                  ⚠ Unmatched ({unmatched.length}) — No diary entry found
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, borderColor: 'warning.main' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'warning.50' }}>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="center">Dir</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Account</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {unmatched.map((e) => (
                        <StmtRow
                          key={e.entry_uuid}
                          entry={e}
                          onUnmatch={null}
                          onAssign={handleAssign}
                          onConfirm={handleConfirm}
                          onReject={handleReject}
                          ledgerAccounts={ledgerAccounts}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
