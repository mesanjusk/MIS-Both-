import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import axios from '../apiClient';
import { ROUTES } from '../constants/routes';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

function parseCsvText(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: 'CSV must have at least a header row and one data row.' };
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const required = ['date', 'party', 'amount', 'direction', 'book'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) return { rows: [], error: `Missing columns: ${missing.join(', ')}` };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return { rows, error: null };
}

function buildPreviewData(text) {
  const { rows, error } = parseCsvText(text);
  if (error) return { preview: null, parseError: error };

  let openingBalance = 0;
  let closingBalance = 0;
  const entries = [];

  for (const row of rows) {
    const timeUpper = (row.time || '').toUpperCase();
    const amount = Number(String(row.amount || '0').replace(/[₹,\s]/g, '')) || 0;
    if (timeUpper === 'OB') { openingBalance = amount; continue; }
    if (timeUpper === 'CB') { closingBalance = amount; continue; }
    if (!row.party || !amount) continue;
    entries.push(row);
  }

  const date = rows[0]?.date || '';
  return { preview: { date, openingBalance, closingBalance, entries }, parseError: '' };
}

export default function DiaryUpload() {
  const navigate = useNavigate();
  const imageInputRef = useRef(null);

  const [tab, setTab] = useState(0); // 0 = CSV, 1 = Image/PDF

  // CSV mode state
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState('');

  // Image/PDF mode state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrCsvText, setOcrCsvText] = useState('');
  const [ocrPreview, setOcrPreview] = useState(null);
  const [ocrParseError, setOcrParseError] = useState('');

  // Shared
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const loggedInUser = localStorage.getItem('User_name') || 'user';

  // ── CSV mode handlers ──────────────────────────────────────────────────────

  const handleCsvFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCsvText(text);
      const { preview: p, parseError: pe } = buildPreviewData(text);
      setPreview(p);
      setParseError(pe);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    setCsvText(text);
    const { preview: p, parseError: pe } = buildPreviewData(text);
    setPreview(p);
    setParseError(pe);
  };

  // ── Image/PDF mode handlers ────────────────────────────────────────────────

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setOcrError('');
    setOcrCsvText('');
    setOcrPreview(null);
    setOcrParseError('');
    if (file.type.startsWith('image/')) {
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setImagePreviewUrl('');
    }
  };

  const handleOcr = async () => {
    if (!imageFile) return;
    setOcrLoading(true);
    setOcrError('');
    setOcrCsvText('');
    setOcrPreview(null);
    setOcrParseError('');
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      const res = await axios.post('/api/diary/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const csv = res.data?.csv_text || '';
      setOcrCsvText(csv);
      const { preview: p, parseError: pe } = buildPreviewData(csv);
      setOcrPreview(p);
      setOcrParseError(pe);
    } catch (err) {
      setOcrError(err?.response?.data?.message || 'OCR failed. Please try again.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrCsvEdit = (e) => {
    const text = e.target.value;
    setOcrCsvText(text);
    const { preview: p, parseError: pe } = buildPreviewData(text);
    setOcrPreview(p);
    setOcrParseError(pe);
  };

  // ── Shared upload ──────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const csvToUpload = tab === 0 ? csvText : ocrCsvText;
    if (!csvToUpload.trim()) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await axios.post('/api/diary/upload-csv', {
        csv_text: csvToUpload,
        uploaded_by: loggedInUser,
      });
      const diaryUuid = res.data?.result?.diary_uuid;
      navigate(`${ROUTES.DAY_BOOK}/${diaryUuid}`);
    } catch (err) {
      setUploadError(err?.response?.data?.message || 'Upload failed. Please check your CSV.');
    } finally {
      setUploading(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const activePreview   = tab === 0 ? preview    : ocrPreview;
  const activeParseErr  = tab === 0 ? parseError : ocrParseError;
  const canUpload       = !!activePreview && !activeParseErr;

  const cashIn      = activePreview?.entries.filter((e) => e.book === 'cash' && e.direction === 'in')  || [];
  const cashOut     = activePreview?.entries.filter((e) => e.book === 'cash' && e.direction === 'out') || [];
  const bankEntries = activePreview?.entries.filter((e) => e.book === 'bank') || [];

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Diary Upload</Typography>
          <Typography variant="body2" color="text.secondary">
            Upload today's diary — CSV, image, or PDF — to create draft entries
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate(ROUTES.DAY_BOOK)}>
          View Day Book
        </Button>
      </Stack>

      {/* Mode tabs */}
      <Paper variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}
        >
          <Tab icon={<UploadFileRoundedIcon fontSize="small" />} iconPosition="start" label="CSV File / Paste" />
          <Tab icon={<ImageRoundedIcon fontSize="small" />} iconPosition="start" label="Image / PDF (Gemini OCR)" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* ── CSV tab ─────────────────────────────────────────────────────── */}
          {tab === 0 && (
            <Stack spacing={2}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadFileRoundedIcon />}
                sx={{ alignSelf: 'flex-start' }}
              >
                Choose CSV File
                <input type="file" accept=".csv,text/csv" hidden onChange={handleCsvFileChange} />
              </Button>
              <Typography variant="caption" color="text.secondary">— or paste CSV text below —</Typography>
              <TextField
                multiline
                minRows={6}
                maxRows={14}
                fullWidth
                placeholder={`date,time,party,amount,direction,book,mode,checked,notes\n2026-04-09,OB,Opening Balance,305,in,cash,cash,no,\n2026-04-09,8,H.M.V.,3000,in,cash,cash,yes,\n2026-04-09,8,Cell,60,out,cash,cash,no,\n2026-04-09,6,Dr Vidya Sagan,18900,in,bank,cheque,yes,\n2026-04-09,CB,Closing Balance,1145,out,cash,cash,no,`}
                value={csvText}
                onChange={handleTextChange}
                size="small"
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
              />
            </Stack>
          )}

          {/* ── Image/PDF tab ────────────────────────────────────────────────── */}
          {tab === 1 && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Take a photo of your handwritten diary page (JPG/PNG/PDF). Gemini AI reads the text and extracts entries automatically.
                Review and edit the result before saving.
              </Typography>

              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<ImageRoundedIcon />}
                >
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

              {/* Image preview */}
              {imagePreviewUrl && (
                <Box
                  component="img"
                  src={imagePreviewUrl}
                  alt="diary page"
                  sx={{ maxHeight: 300, maxWidth: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider', objectFit: 'contain' }}
                />
              )}

              {ocrError && <Alert severity="error" sx={{ borderRadius: 2 }}>{ocrError}</Alert>}

              {/* Editable OCR result */}
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
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{activeParseErr}</Alert>
      )}

      {/* Preview */}
      {activePreview && !activeParseErr && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Preview: {activePreview.date}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Opening: {money(activePreview.openingBalance)} &nbsp;|&nbsp;
                Closing: {money(activePreview.closingBalance)} &nbsp;|&nbsp;
                {activePreview.entries.length} entries ({cashIn.length + cashOut.length} cash, {bankEntries.length} bank)
              </Typography>
            </Box>
            <Chip label={`${activePreview.entries.length} entries found`} color="primary" size="small" />
          </Stack>

          {/* Cash entries */}
          {(cashIn.length > 0 || cashOut.length > 0) && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Cash Entries
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 0.5 }}>
                <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'success.50' }}>
                        <TableCell colSpan={2} sx={{ fontWeight: 700, color: 'success.dark' }}>Cash Receipts (IN)</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Party</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cashIn.map((e, i) => (
                        <TableRow key={i} hover>
                          <TableCell>
                            {e.party}
                            {e.checked === 'yes' && (
                              <CheckCircleOutlineRoundedIcon sx={{ ml: 0.5, fontSize: 14, color: 'success.main', verticalAlign: 'middle' }} />
                            )}
                          </TableCell>
                          <TableCell align="right">{money(e.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {!cashIn.length && (
                        <TableRow><TableCell colSpan={2} align="center" sx={{ color: 'text.disabled' }}>None</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'error.50' }}>
                        <TableCell colSpan={2} sx={{ fontWeight: 700, color: 'error.dark' }}>Cash Payments (OUT)</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Party / Purpose</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cashOut.map((e, i) => (
                        <TableRow key={i} hover>
                          <TableCell>{e.party}</TableCell>
                          <TableCell align="right">{money(e.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {!cashOut.length && (
                        <TableRow><TableCell colSpan={2} align="center" sx={{ color: 'text.disabled' }}>None</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </Box>
          )}

          {/* Bank entries */}
          {bankEntries.length > 0 && (
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Bank Entries
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5, borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'info.50' }}>
                      <TableCell sx={{ fontWeight: 700, color: 'info.dark' }}>Party</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'info.dark' }}>Mode</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'info.dark' }}>Direction</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'info.dark' }}>Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bankEntries.map((e, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          {e.party}
                          {e.checked === 'yes' && (
                            <CheckCircleOutlineRoundedIcon sx={{ ml: 0.5, fontSize: 14, color: 'success.main', verticalAlign: 'middle' }} />
                          )}
                          {e.notes && <Typography variant="caption" color="text.secondary"> ({e.notes})</Typography>}
                        </TableCell>
                        <TableCell><Chip label={e.mode || 'cash'} size="small" variant="outlined" /></TableCell>
                        <TableCell>
                          <Chip label={e.direction === 'in' ? 'IN' : 'OUT'} size="small" color={e.direction === 'in' ? 'success' : 'error'} />
                        </TableCell>
                        <TableCell align="right">{money(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
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
          sx={{ borderRadius: 3, py: 1.5 }}
        >
          {uploading ? 'Saving Draft…' : `Save Draft — ${activePreview.entries.length} Entries for ${activePreview.date}`}
        </Button>
      )}
    </Box>
  );
}
