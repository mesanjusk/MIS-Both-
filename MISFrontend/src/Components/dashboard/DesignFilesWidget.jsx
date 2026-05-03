/**
 * DesignFilesWidget.jsx
 *
 * Dashboard widget — shows designer's Drive files auto-matched to MIS orders.
 * Files are matched automatically by the leading order number in the filename
 * (e.g. "153 - CustomerName - Details" → Order #153).
 *
 * No manual linking needed. Zero input from designer or office team.
 *
 * Usage in Dashboard.jsx:
 *   import DesignFilesWidget from '../Components/dashboard/DesignFilesWidget';
 *   <DesignFilesWidget />
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DesignServicesRoundedIcon from '@mui/icons-material/DesignServicesRounded';
import LocalPrintshopRoundedIcon from '@mui/icons-material/LocalPrintshopRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import axios from '../../apiClient';

// ─── Stage chip ───────────────────────────────────────────────────────────────
function StageChip({ stageNumber, stageLabel, stageColor }) {
  const theme = stageColor || { bg: '#F5F5F5', color: '#424242' };
  return (
    <Chip
      label={stageLabel}
      size="small"
      sx={{
        bgcolor: theme.bg,
        color: theme.color,
        fontWeight: 600,
        fontSize: 10,
        height: 20,
        borderRadius: 1,
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
}

// ─── Summary bar showing count per stage ─────────────────────────────────────
function StageSummaryBar({ summary }) {
  if (!summary?.byStage) return null;
  const stages = Object.entries(summary.byStage)
    .filter(([, v]) => v.count > 0)
    .sort(([a], [b]) => Number(a) - Number(b));

  if (!stages.length) return null;

  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ px: 2, pb: 1.5 }}>
      {stages.map(([num, info]) => (
        <Chip
          key={num}
          label={`${info.label} (${info.count})`}
          size="small"
          sx={{
            fontSize: 10,
            height: 20,
            bgcolor: 'action.hover',
            color: 'text.secondary',
            fontWeight: 500,
            '& .MuiChip-label': { px: 1 },
          }}
        />
      ))}
    </Stack>
  );
}

// ─── Single file row ──────────────────────────────────────────────────────────
function FileRow({ file }) {
  const isUnmatched = !file.matched;
  const isPrinting = file.stageNumber === 9;
  const isFinal = file.stageNumber === 8;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        py: 0.9,
        px: 1.5,
        borderRadius: 1.5,
        border: '0.5px solid',
        borderColor: isUnmatched ? 'warning.200' : 'divider',
        bgcolor: isUnmatched ? 'warning.50' : isPrinting ? 'success.50' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Icon */}
      <Box sx={{ flexShrink: 0 }}>
        {isPrinting
          ? <LocalPrintshopRoundedIcon sx={{ fontSize: 16, color: 'success.600' }} />
          : isFinal
          ? <DoneAllRoundedIcon sx={{ fontSize: 16, color: 'info.600' }} />
          : isUnmatched
          ? <ErrorOutlineRoundedIcon sx={{ fontSize: 16, color: 'warning.600' }} />
          : <DesignServicesRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
      </Box>

      {/* File name */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={500}
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
          title={file.fileName}
        >
          {file.fileName}
        </Typography>
        {isUnmatched && (
          <Typography variant="caption" color="warning.700" sx={{ fontSize: 10 }}>
            Order #{file.extractedOrderNumber || '?'} not found in MIS
          </Typography>
        )}
        {file.matched && file.orderStage && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
            MIS stage: {file.orderStage}
          </Typography>
        )}
      </Box>

      {/* Stage chip */}
      <StageChip
        stageNumber={file.stageNumber}
        stageLabel={file.stageLabel}
        stageColor={file.stageColor}
      />

      {/* Match indicator */}
      {file.matched && (
        <Tooltip title={`Matched to Order #${file.orderNumber}`}>
          <CheckCircleRoundedIcon sx={{ fontSize: 14, color: 'success.500', flexShrink: 0 }} />
        </Tooltip>
      )}
    </Stack>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function DesignFilesWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [configMissing, setConfigMissing] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unmatched' | 'printing' | 'final'

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cfgRes = await axios.get('/api/design-files/config-check');
      if (!cfgRes.data?.configured) { setConfigMissing(true); return; }
      const res = await axios.get('/api/design-files/scan');
      setData(res.data);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '';
      if (err?.response?.data?.reconnectRequired) { setReconnectRequired(true); return; }
      if (err?.response?.status === 400) { setConfigMissing(true); return; }
      setError(msg || 'Could not load Drive files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Config missing ────────────────────────────────────────────────────────
  if (configMissing) {
    return (
      <Box sx={{ borderRadius: 2, border: '0.5px solid', borderColor: 'divider', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <FolderOpenRoundedIcon color="action" sx={{ mt: 0.2 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>Design Files Tracker</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add <code>DRIVE_DAILY_FOLDER_ID</code> to your Render environment variables.
              Open your <strong>0 Today</strong> folder in Google Drive → copy the ID from the URL.
            </Typography>
          </Box>
        </Stack>
      </Box>
    );
  }

  // ── Drive disconnected ────────────────────────────────────────────────────
  if (reconnectRequired) {
    return (
      <Box sx={{ borderRadius: 2, border: '0.5px solid', borderColor: 'warning.300', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ErrorOutlineRoundedIcon color="warning" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>Google Drive disconnected</Typography>
            <Typography variant="body2" color="text.secondary">Reconnect to track design files.</Typography>
          </Box>
          <Button size="small" variant="outlined" color="warning"
            onClick={() => window.open('/api/google-drive/connect', '_blank')}>
            Reconnect
          </Button>
        </Stack>
      </Box>
    );
  }

  const files = data?.files || [];
  const summary = data?.summary;

  // Apply filter
  const filtered = files.filter((f) => {
    if (filter === 'unmatched') return !f.matched;
    if (filter === 'printing') return f.stageNumber === 9;
    if (filter === 'final') return f.stageNumber === 8;
    return true;
  });

  const unmatchedCount = summary?.unmatched || 0;
  const printingCount = summary?.byStage?.[9]?.count || 0;
  const finalCount = summary?.byStage?.[8]?.count || 0;

  return (
    <Box sx={{ borderRadius: 2, border: '0.5px solid', borderColor: 'divider', overflow: 'hidden' }}>

      {/* Header */}
      <Stack
        direction="row" alignItems="center" spacing={1}
        sx={{ px: 2, py: 1.5, borderBottom: '0.5px solid', borderColor: 'divider' }}
      >
        <FolderOpenRoundedIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Design Files — Today
        </Typography>

        {!loading && summary && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            {unmatchedCount > 0 && (
              <Chip label={`${unmatchedCount} unmatched`} size="small"
                sx={{ bgcolor: 'warning.100', color: 'warning.800', fontWeight: 600, fontSize: 10, height: 20 }} />
            )}
            {printingCount > 0 && (
              <Chip label={`${printingCount} printing`} size="small"
                sx={{ bgcolor: 'success.100', color: 'success.800', fontWeight: 600, fontSize: 10, height: 20 }} />
            )}
            <Chip label={`${summary.total} total`} size="small"
              sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 500, fontSize: 10, height: 20 }} />
          </Stack>
        )}

        <Tooltip title="Refresh from Drive">
          <IconButton size="small" onClick={load} disabled={loading}>
            {loading ? <CircularProgress size={14} /> : <RefreshRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Loading bar */}
      {loading && <LinearProgress sx={{ height: 2 }} />}

      {/* Stage summary pills */}
      {!loading && summary && (
        <Box sx={{ pt: 1.5 }}>
          <StageSummaryBar summary={summary} />
        </Box>
      )}

      {/* Filter tabs */}
      <Stack direction="row" spacing={0.5}
        sx={{ px: 2, pb: 1, borderBottom: '0.5px solid', borderColor: 'divider' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'unmatched', label: `Unmatched${unmatchedCount ? ` (${unmatchedCount})` : ''}` },
          { key: 'printing', label: `Printing${printingCount ? ` (${printingCount})` : ''}` },
          { key: 'final', label: `Final${finalCount ? ` (${finalCount})` : ''}` },
        ].map((tab) => (
          <Button key={tab.key} size="small"
            variant={filter === tab.key ? 'contained' : 'text'}
            onClick={() => setFilter(tab.key)}
            sx={{
              fontSize: 11, py: 0.4, px: 1.2, minWidth: 0,
              borderRadius: 5, boxShadow: 'none', textTransform: 'none',
              fontWeight: filter === tab.key ? 600 : 400,
            }}>
            {tab.label}
          </Button>
        ))}
      </Stack>

      {/* File list */}
      <Box sx={{ px: 1.5, py: 1, maxHeight: 360, overflowY: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1, py: 0.5 }}
            action={<Button size="small" onClick={load}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {filter === 'unmatched'
                ? 'All files matched to orders.'
                : filter === 'printing'
                ? 'No files in Printing folder.'
                : filter === 'final'
                ? 'No files in Final folder.'
                : 'No files found in Drive folder.'}
            </Typography>
          </Box>
        )}

        <Stack spacing={0.6}>
          {filtered.map((file) => (
            <FileRow key={file.fileId} file={file} />
          ))}
        </Stack>
      </Box>

      {/* Footer */}
      {!loading && files.length > 0 && (
        <>
          <Divider />
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Auto-matched by order number in filename. Refreshes when you click ↻.
              Unmatched = file has no matching order in MIS yet.
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
