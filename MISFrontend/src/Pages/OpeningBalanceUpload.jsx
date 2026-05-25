import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import axios from '../apiClient';
import { ROUTES } from '../constants/routes';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

function normalizeSide(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'dr' || s === 'debit' || s === 'd') return 'debit';
  if (s === 'cr' || s === 'credit' || s === 'c') return 'credit';
  return null;
}

function parseCsvText(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: 'CSV must have at least a header row and one data row.' };
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  if (!headers.includes('account_name')) return { rows: [], error: 'Missing required column: account_name' };
  if (!headers.includes('amount')) return { rows: [], error: 'Missing required column: amount' };
  const sideCol = headers.includes('side') ? 'side' : headers.includes('dr_cr') ? 'dr_cr' : null;
  if (!sideCol) return { rows: [], error: 'Missing required column: side (or dr_cr). Use Dr/Cr or debit/credit.' };

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    const accountName = row['account_name'];
    const amount = Number(String(row['amount'] || '0').replace(/[₹,\s]/g, ''));
    const side = normalizeSide(row[sideCol]);
    if (!accountName) { errors.push(`Row ${i + 1}: account_name is empty`); continue; }
    if (!amount || amount <= 0) { errors.push(`Row ${i + 1}: invalid amount for "${accountName}"`); continue; }
    if (!side) { errors.push(`Row ${i + 1}: invalid side "${row[sideCol]}" for "${accountName}" — use Dr/Cr`); continue; }
    rows.push({ account_name: accountName, amount, side, date: (row['date'] || '').trim() });
  }
  if (errors.length && !rows.length) return { rows: [], error: errors.join('\n') };
  return { rows, parseWarnings: errors, error: null };
}

function buildPreviewData(text) {
  const { rows, parseWarnings, error } = parseCsvText(text);
  if (error) return { preview: null, parseError: error, parseWarnings: [] };
  const totalDr = rows.filter((r) => r.side === 'debit').reduce((s, r) => s + r.amount, 0);
  const totalCr = rows.filter((r) => r.side === 'credit').reduce((s, r) => s + r.amount, 0);
  return { preview: { rows, totalDr, totalCr }, parseError: '', parseWarnings: parseWarnings || [] };
}

const EXAMPLE_CSV = `account_name,amount,side,date
Cash,50000,Dr,2026-04-01
State Bank Account,200000,Dr,2026-04-01
Sundry Debtors,150000,Dr,2026-04-01
Sundry Creditors,80000,Cr,2026-04-01
Capital Account,320000,Cr,2026-04-01`;

export default function OpeningBalanceUpload() {
  const navigate = useNavigate();
  const imageInputRef = useRef(null);

  const [tab, setTab] = useState(0);

  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState('');
  const [parseWarnings, setParseWarnings] = useState([]);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrCsvText, setOcrCsvText] = useState('');
  const [ocrPreview, setOcrPreview] = useState(null);
  const [ocrParseError, setOcrParseError] = useState('');
  const [ocrParseWarnings, setOcrParseWarnings] = useState([]);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResults, setUploadResults] = useState(null);

  const [openingDate, setOpeningDate] = useState(() => {
    const now = new Date();
    const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${fyYear}-04-01`;
  });

  const loggedInUser = localStorage.getItem('User_name') || 'user';

  const handleCsvFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCsvText(text);
      const { preview: p, parseError: pe, parseWarnings: pw } = buildPreviewData(text);
      setPreview(p); setParseError(pe); setParseWarnings(pw || []);
      setUploadResults(null);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    setCsvText(text);
    const { preview: p, parseError: pe, parseWarnings: pw } = buildPreviewData(text);
    setPreview(p); setParseError(pe); setParseWarnings(pw || []);
    setUploadResults(null);
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setOcrError(''); setOcrCsvText(''); setOcrPreview(null); setOcrParseError('');
    setUploadResults(null);
    if (file.type.startsWith('image/')) setImagePreviewUrl(URL.createObjectURL(file));
    else setImagePreviewUrl('');
  };

  const handleOcr = async () => {
    if (!imageFile) return;
    setOcrLoading(true); setOcrError(''); setOcrCsvText(''); setOcrPreview(null); setOcrParseError('');
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      const res = await axios.post('/api/diary/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const csv = res.data?.csv_text || '';
      setOcrCsvText(csv);
      const { preview: p, parseError: pe, parseWarnings: pw } = buildPreviewData(csv);
      setOcrPreview(p); setOcrParseError(pe); setOcrParseWarnings(pw || []);
    } catch (err) {
      setOcrError(err?.response?.data?.message || 'OCR failed. Please try again.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrCsvEdit = (e) => {
    const text = e.target.value;
    setOcrCsvText(text);
    const { preview: p, parseError: pe, parseWarnings: pw } = buildPreviewData(text);
    setOcrPreview(p); setOcrParseError(pe); setOcrParseWarnings(pw || []);
  };

  const handleUpload = async () => {
    const csvToUpload = tab === 0 ? csvText : ocrCsvText;
    if (!csvToUpload.trim()) return;
    setUploading(true); setUploadError(''); setUploadResults(null);
    try {
      const res = await axios.post('/api/accounts/opening-balance/bulk', {
        csv_text: csvToUpload,
        date: openingDate,
        uploaded_by: loggedInUser,
      });
      setUploadResults(res.data?.results || []);
    } catch (err) {
      setUploadError(err?.response?.data?.error || err?.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const activePreview      = tab === 0 ? preview      : ocrPreview;
  const activeParseErr     = tab === 0 ? parseError   : ocrParseError;
  const activeParseWarns   = tab === 0 ? parseWarnings : ocrParseWarnings;
  const canUpload          = !!activePreview && !activeParseErr && !uploading && !uploadResults;

  const savedCount  = uploadResults ? uploadResults.filter((r) => r.success).length  : 0;
  const failedCount = uploadResults ? uploadResults.filter((r) => !r.success).length : 0;

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Opening Balance Upload</Typography>
          <Typography variant="body2" color="text.secondary">
            Bulk-upload opening balances from your notebook — paste or upload a CSV, or scan a handwritten page
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            type="date"
            size="small"
            label="Opening Date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 180 }}
          />
          <Button variant="outlined" startIcon={<AccountBalanceRoundedIcon />} onClick={() => navigate(ROUTES.OPENING_BALANCE)}>
            Opening Balance
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setUploadResults(null); }}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}
        >
          <Tab icon={<UploadFileRoundedIcon fontSize="small" />} iconPosition="start" label="CSV File / Paste" />
          <Tab icon={<ImageRoundedIcon fontSize="small" />} iconPosition="start" label="Image / PDF (Gemini OCR)" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && (
            <Stack spacing={2}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadFileRoundedIcon />}
                sx={{ alignSelf: 'flex-start' }}
              >
                Choose CSV File
                <input type="file" accept=".csv,text/csv,.txt" hidden onChange={handleCsvFileChange} />
              </Button>
              <Typography variant="caption" color="text.secondary">— or paste CSV / text below —</Typography>
              <TextField
                multiline
                minRows={6}
                maxRows={16}
                fullWidth
                placeholder={EXAMPLE_CSV}
                value={csvText}
                onChange={handleTextChange}
                size="small"
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <Alert severity="info" sx={{ borderRadius: 2, py: 0.5 }}>
                <Typography variant="caption">
                  <strong>Format:</strong> account_name, amount, side (Dr/Cr), date (optional)<br />
                  <strong>Tip:</strong> Account names must match your chart of accounts exactly (case-insensitive).
                </Typography>
              </Alert>
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Take a photo of your handwritten balance sheet or notebook. Gemini AI extracts the entries — review and correct before saving.
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <Button variant="outlined" component="label" startIcon={<ImageRoundedIcon />}>
                  Choose Image / PDF
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,.pdf"
                    hidden
                    onChange={handleImageFileChange}
                  />
                </Button>
                {imageFile && (
                  <Typography variant="body2" color="text.secondary">
                    {imageFile.name} ({(imageFile.size / 1024).toFixed(0)} KB)
                  </Typography>
                )}
                {imageFile && (
                  <Button
                    variant="contained"
                    onClick={handleOcr}
                    disabled={ocrLoading}
                    startIcon={ocrLoading ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    {ocrLoading ? 'Reading with Gemini…' : 'Extract Entries'}
                  </Button>
                )}
              </Stack>
              {imagePreviewUrl && (
                <Box
                  component="img"
                  src={imagePreviewUrl}
                  alt="uploaded page"
                  sx={{ maxHeight: 300, maxWidth: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider', objectFit: 'contain' }}
                />
              )}
              {ocrError && <Alert severity="error" sx={{ borderRadius: 2 }}>{ocrError}</Alert>}
              {ocrCsvText && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Extracted CSV — review and correct if needed before saving:
                  </Typography>
                  <TextField
                    multiline
                    minRows={6}
                    maxRows={16}
                    fullWidth
                    value={ocrCsvText}
                    onChange={handleOcrCsvEdit}
                    size="small"
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                  />
                </>
              )}
            </Stack>
          )}
        </Box>
      </Paper>

      {activeParseErr && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3, whiteSpace: 'pre-line' }}>{activeParseErr}</Alert>
      )}
      {activeParseWarns.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          {activeParseWarns.join('\n')}
        </Alert>
      )}

      {activePreview && !activeParseErr && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Preview — {activePreview.rows.length} entries
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Debit: {money(activePreview.totalDr)} &nbsp;|&nbsp;
                Total Credit: {money(activePreview.totalCr)} &nbsp;|&nbsp;
                <Box component="span" sx={{ color: activePreview.totalDr === activePreview.totalCr ? 'success.main' : 'warning.main', fontWeight: 700 }}>
                  {activePreview.totalDr === activePreview.totalCr ? 'Balanced ✓' : `Difference: ${money(Math.abs(activePreview.totalDr - activePreview.totalCr))}`}
                </Box>
              </Typography>
            </Box>
            <Chip label={`${activePreview.rows.length} accounts`} color="primary" size="small" />
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>#</strong></TableCell>
                  <TableCell><strong>Account Name</strong></TableCell>
                  <TableCell align="right"><strong>Amount</strong></TableCell>
                  <TableCell><strong>Dr / Cr</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activePreview.rows.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{row.account_name}</Typography>
                    </TableCell>
                    <TableCell align="right">{money(row.amount)}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.side === 'debit' ? 'Dr' : 'Cr'}
                        size="small"
                        color={row.side === 'debit' ? 'info' : 'warning'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{row.date || openingDate}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {uploadError && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{uploadError}</Alert>
      )}

      {canUpload && (
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleUpload}
          disabled={uploading}
          startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : null}
          sx={{ borderRadius: 3, py: 1.5, mb: 2 }}
        >
          {uploading
            ? 'Saving Opening Balances…'
            : `Save ${activePreview.rows.length} Opening Balance Entries`}
        </Button>
      )}

      {uploadResults && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Upload Results</Typography>
            <Stack direction="row" spacing={1}>
              {savedCount > 0 && <Chip label={`${savedCount} saved`} color="success" size="small" />}
              {failedCount > 0 && <Chip label={`${failedCount} failed`} color="error" size="small" />}
            </Stack>
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Account</strong></TableCell>
                  <TableCell align="right"><strong>Amount</strong></TableCell>
                  <TableCell><strong>Dr / Cr</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Message</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {uploadResults.map((r, i) => (
                  <TableRow key={i} sx={{ bgcolor: r.success ? 'success.50' : 'error.50' }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{r.account_name}</Typography>
                    </TableCell>
                    <TableCell align="right">{money(r.amount)}</TableCell>
                    <TableCell>
                      <Chip
                        label={r.side === 'debit' ? 'Dr' : 'Cr'}
                        size="small"
                        color={r.side === 'debit' ? 'info' : 'warning'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {r.success
                        ? <CheckCircleOutlineRoundedIcon sx={{ color: 'success.main', fontSize: 18 }} />
                        : <ErrorOutlineRoundedIcon sx={{ color: 'error.main', fontSize: 18 }} />}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color={r.success ? 'success.dark' : 'error.dark'}>
                        {r.message || r.error || (r.success ? 'Saved' : 'Failed')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {failedCount === 0 && (
            <Button
              variant="outlined"
              sx={{ mt: 2 }}
              onClick={() => navigate(ROUTES.OPENING_BALANCE)}
            >
              View Opening Balances
            </Button>
          )}
        </Paper>
      )}
    </Box>
  );
}
