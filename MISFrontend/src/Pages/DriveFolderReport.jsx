import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded';
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded';
import axios from '../apiClient';

const ROOT_CRUMB = { id: 'root', name: 'My Drive' };

/** Accepts a pasted Drive folder share link OR a bare folder ID and returns the ID. */
function extractFolderId(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const idMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return value;
}

const MIN_FOLDER_COLUMNS = 6;

function buildAndDownloadExcel(job) {
  const rows = job.rows || [];
  // Always show Folder 1..6 + File Name; only add Folder 7, 8, ... if a path actually goes deeper.
  const maxDepth = Math.max(MIN_FOLDER_COLUMNS, job.maxDepth || 1);

  const excelRows = rows.map((r) => {
    const row = {};
    for (let i = 0; i < maxDepth; i += 1) {
      row[`Folder ${i + 1}`] = r.pathSegments[i] || '';
    }
    row['File Name'] = r.fileName;
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(excelRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Files');
  const safeName = (job.folderName || 'Drive-Folder').replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(wb, `${safeName}-file-report.xlsx`);
}

/** Builds { rows, maxDepth, folderName } from a browser FileList picked via a folder input. */
function rowsFromLocalFiles(fileList) {
  let maxDepth = 0;
  const rows = fileList.map((file) => {
    const relPath = file.webkitRelativePath || file.name;
    const segments = relPath.split('/');
    const fileName = segments.pop();
    maxDepth = Math.max(maxDepth, segments.length);
    const extMatch = fileName.match(/\.([^.]+)$/);
    return {
      pathSegments: segments,
      fileName,
      extension: extMatch ? extMatch[1].toLowerCase() : '',
      modifiedTime: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      size: file.size || null,
    };
  });
  const folderName = fileList[0]?.webkitRelativePath?.split('/')[0] || 'Local-Folder';
  return { rows, maxDepth: Math.max(1, maxDepth), folderName };
}

export default function DriveFolderReport() {
  const [breadcrumbs, setBreadcrumbs] = useState([ROOT_CRUMB]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null); // { foldersScanned, filesFound }
  const [scanError, setScanError] = useState('');
  const pollRef = useRef(null);

  const [localError, setLocalError] = useState('');
  const localInputRef = useRef(null);

  const current = breadcrumbs[breadcrumbs.length - 1];

  const loadFolder = useCallback(async (folderId, folderName) => {
    setBrowseLoading(true);
    setBrowseError('');
    try {
      const res = await axios.get('/api/drive-folder-report/browse', { params: { folderId } });
      const data = res.data || {};
      setFolders(data.folders || []);
      setFiles(data.files || []);
      setReconnectRequired(false);
      return data.folderName || folderName || folderId;
    } catch (err) {
      if (err?.response?.data?.reconnectRequired) {
        setReconnectRequired(true);
      } else {
        setBrowseError(err?.response?.data?.message || err.message || 'Failed to load folder');
      }
      return null;
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolder(ROOT_CRUMB.id, ROOT_CRUMB.name);
  }, [loadFolder]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const openFolder = async (folder) => {
    const resolvedName = await loadFolder(folder.id, folder.name);
    if (resolvedName == null) return;
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: resolvedName }]);
  };

  const goToBreadcrumb = async (index) => {
    const target = breadcrumbs[index];
    const resolvedName = await loadFolder(target.id, target.name);
    if (resolvedName == null) return;
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const openPastedFolder = async () => {
    const folderId = extractFolderId(pasteValue);
    if (!folderId) return;
    const resolvedName = await loadFolder(folderId, folderId);
    if (resolvedName == null) return;
    setBreadcrumbs([ROOT_CRUMB, { id: folderId, name: resolvedName }]);
    setPasteValue('');
  };

  const pollJob = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/api/drive-folder-report/scan/${jobId}`);
        const job = res.data || {};
        setScanProgress({ foldersScanned: job.foldersScanned, filesFound: job.filesFound });

        if (job.status === 'done') {
          clearInterval(pollRef.current);
          setScanning(false);
          buildAndDownloadExcel(job);
        } else if (job.status === 'error') {
          clearInterval(pollRef.current);
          setScanning(false);
          setScanError(job.error || 'Scan failed');
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setScanning(false);
        setScanError(err?.response?.data?.message || err.message || 'Failed to check scan status');
      }
    }, 1500);
  };

  const generateReport = async () => {
    setScanning(true);
    setScanError('');
    setScanProgress({ foldersScanned: 0, filesFound: 0 });
    try {
      const res = await axios.post('/api/drive-folder-report/scan', {
        folderId: current.id,
        folderName: current.name,
      });
      pollJob(res.data.jobId);
    } catch (err) {
      setScanning(false);
      if (err?.response?.data?.reconnectRequired) {
        setReconnectRequired(true);
      } else {
        setScanError(err?.response?.data?.message || err.message || 'Failed to start scan');
      }
    }
  };

  const handleLocalFolderSelect = (e) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same folder later
    if (!fileList.length) return;
    setLocalError('');
    try {
      buildAndDownloadExcel(rowsFromLocalFiles(fileList));
    } catch (err) {
      setLocalError(err.message || 'Failed to build report');
    }
  };

  if (reconnectRequired) {
    return (
      <Box sx={{ p: { xs: 1, md: 2 } }}>
        <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'warning.300', p: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <ErrorOutlineRoundedIcon color="warning" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>Google Drive disconnected</Typography>
              <Typography variant="body2" color="text.secondary">Reconnect to browse Drive folders.</Typography>
            </Box>
            <Button size="small" variant="outlined" color="warning" onClick={() => window.open('/api/google-drive/connect', '_blank')}>
              Reconnect
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Drive Folder Report</Typography>
          <Typography variant="body2" color="text.secondary">
            Browse to any Google Drive folder and export every file underneath it to Excel — one column per folder level.
          </Typography>
        </Box>
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth size="small"
            label="Paste a Drive folder link or ID"
            placeholder="https://drive.google.com/drive/folders/…"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') openPastedFolder(); }}
          />
          <Button variant="outlined" onClick={openPastedFolder} disabled={!pasteValue.trim() || browseLoading}>
            Go
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
          {breadcrumbs.map((crumb, idx) => (
            <Stack key={`${crumb.id}-${idx}`} direction="row" alignItems="center" spacing={0.5}>
              {idx > 0 && <NavigateNextRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
              <Button
                size="small"
                onClick={() => goToBreadcrumb(idx)}
                disabled={idx === breadcrumbs.length - 1 || browseLoading}
                sx={{ textTransform: 'none', fontWeight: idx === breadcrumbs.length - 1 ? 700 : 400, minWidth: 0, px: 0.75 }}
              >
                {crumb.name}
              </Button>
            </Stack>
          ))}
          <Box sx={{ flex: 1 }} />
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={() => loadFolder(current.id, current.name)} disabled={browseLoading}>
            Refresh
          </Button>
        </Stack>

        {browseError && <Alert severity="error" sx={{ mb: 1 }}>{browseError}</Alert>}

        {browseLoading ? (
          <Stack alignItems="center" py={3}><CircularProgress size={24} /></Stack>
        ) : (
          <Stack spacing={0.4} sx={{ maxHeight: 420, overflowY: 'auto', pr: 0.5 }}>
            {folders.length === 0 && files.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No subfolders or files here.
              </Typography>
            )}
            {folders.map((folder) => (
              <Stack
                key={folder.id} direction="row" alignItems="center" spacing={1}
                onClick={() => openFolder(folder)}
                sx={{ py: 0.6, px: 1, borderRadius: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <FolderRoundedIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                <Typography variant="body2">{folder.name}</Typography>
              </Stack>
            ))}
            {files.map((file) => (
              <Stack key={file.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.6, px: 1, opacity: 0.7 }}>
                <InsertDriveFileRoundedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                <Typography variant="body2" color="text.secondary">{file.name}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <FolderOpenRoundedIcon color="action" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>Generate report for "{current.name}"</Typography>
            <Typography variant="caption" color="text.secondary">
              Scans every subfolder recursively and lists every file found, with full folder path split into columns.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={scanning ? <CircularProgress size={14} color="inherit" /> : <DownloadRoundedIcon />}
            onClick={generateReport}
            disabled={scanning}
          >
            {scanning ? 'Scanning…' : 'Generate Excel Report'}
          </Button>
        </Stack>

        {scanning && (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Scanned {scanProgress?.foldersScanned ?? 0} folders, found {scanProgress?.filesFound ?? 0} files…
            </Typography>
          </Box>
        )}
        {scanError && <Alert severity="error" sx={{ mt: 1.5 }}>{scanError}</Alert>}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5, mt: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <ComputerRoundedIcon color="action" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>This computer's folder (not Google Drive)</Typography>
            <Typography variant="caption" color="text.secondary">
              Pick a folder on this machine — only file names, folder paths, and sizes are read (in your browser).
              Nothing is uploaded anywhere.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<DownloadRoundedIcon />}
            onClick={() => localInputRef.current?.click()}
          >
            Choose Local Folder
          </Button>
          <input
            type="file"
            ref={localInputRef}
            onChange={handleLocalFolderSelect}
            style={{ display: 'none' }}
            webkitdirectory="true"
            directory="true"
            mozdirectory="true"
            multiple
          />
        </Stack>
        {localError && <Alert severity="error" sx={{ mt: 1.5 }}>{localError}</Alert>}
      </Paper>
    </Box>
  );
}
