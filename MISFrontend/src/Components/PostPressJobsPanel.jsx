import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import PostPressJobEditor, { POST_PRESS_STATUS, POST_PRESS_TYPES } from './PostPressJobEditor';

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const typeLabel = (value) =>
  POST_PRESS_TYPES.find((item) => item.value === value)?.label || value || 'Post Press';

const statusLabel = (value) =>
  POST_PRESS_STATUS.find((item) => item.value === value)?.label || value || 'Required';

const statusColor = (status) => {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'warning';
  if (status === 'sent') return 'info';
  return 'default';
};

export default function PostPressJobsPanel({
  row,
  parties = [],
  onRefresh,
  onOpenFolder,
}) {
  const jobs = Array.isArray(row?.postPressJobs) ? row.postPressJobs : [];
  const [editorJob, setEditorJob] = useState(undefined);
  const [savingStatus, setSavingStatus] = useState('');

  const total = useMemo(
    () => jobs.reduce((sum, job) => sum + Number(job.jobValue || 0), 0),
    [jobs]
  );
  const completed = jobs.filter((job) => job.status === 'completed').length;

  const updateStatus = async (job, status) => {
    setSavingStatus(job.job_uuid);
    try {
      const res = await axios.put(`/api/vendors/production-jobs/${job.job_uuid}/status`, { status });
      if (!res.data?.success) throw new Error(res.data?.message || 'Could not update status');
      toast.success(`Post-press status: ${statusLabel(status)}`);
      await onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not update status');
    } finally {
      setSavingStatus('');
    }
  };

  return (
    <Box sx={{ p: 1.25, bgcolor: 'action.hover' }}>
      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ px: 1.25, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2" fontWeight={900}>Post Press</Typography>
              {jobs.length ? (
                <Chip
                  size="small"
                  color={completed === jobs.length ? 'success' : 'warning'}
                  label={`${completed}/${jobs.length} complete`}
                  sx={{ height: 20, fontSize: 10 }}
                />
              ) : (
                <Chip size="small" label="No services added" sx={{ height: 20, fontSize: 10 }} />
              )}
              {total > 0 ? (
                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                  Cost {money(total)}
                </Typography>
              ) : null}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Same Printing order/folder · each service posts to its own vendor payable account
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.75}>
            <Tooltip title="Open the same synced/local Printing folder">
              <IconButton size="small" onClick={() => onOpenFolder?.(row)} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <FolderOpenRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => setEditorJob(null)}
              disabled={!row?.orderUuid}
              sx={{ textTransform: 'none', fontWeight: 800 }}
            >
              Add Service
            </Button>
          </Stack>
        </Stack>

        {!jobs.length ? (
          <Box sx={{ px: 1.5, py: 2.5, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Add lamination, cutting, binding, foiling, UV, packing or another post-press service.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={0} divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
            {jobs.map((job) => (
              <Stack
                key={job.job_uuid}
                direction={{ xs: 'column', md: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', md: 'center' }}
                sx={{ px: 1.25, py: 1 }}
              >
                <Box sx={{ minWidth: { md: 150 }, flex: 1 }}>
                  <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
                    <Typography variant="body2" fontWeight={900}>
                      {typeLabel(job.job_type)}
                    </Typography>
                    <Chip
                      size="small"
                      color={statusColor(job.status)}
                      label={statusLabel(job.status)}
                      variant={job.status === 'completed' ? 'filled' : 'outlined'}
                      sx={{ height: 19, fontSize: 9.5 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {job.vendor_name || 'Vendor not set'} · Job #{job.job_number || '—'}
                  </Typography>
                </Box>

                <Box sx={{ minWidth: { md: 105 } }}>
                  <Typography variant="caption" color="text.secondary">Vendor Cost</Typography>
                  <Typography variant="body2" fontWeight={900}>{money(job.jobValue)}</Typography>
                </Box>

                <TextField
                  select
                  size="small"
                  label="Status"
                  value={job.status || 'draft'}
                  onChange={(e) => updateStatus(job, e.target.value)}
                  disabled={savingStatus === job.job_uuid}
                  sx={{ minWidth: 130 }}
                >
                  {POST_PRESS_STATUS.map((item) => (
                    <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                  ))}
                </TextField>

                <Stack direction="row" spacing={0.6}>
                  <Tooltip title="Open Printing folder">
                    <IconButton size="small" onClick={() => onOpenFolder?.(row)} sx={{ border: '1px solid', borderColor: 'divider' }}>
                      <FolderOpenRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Button
                    size="small"
                    variant={job.documentGenerated ? 'outlined' : 'contained'}
                    startIcon={job.documentGenerated ? <EditRoundedIcon /> : <ReceiptLongRoundedIcon />}
                    onClick={() => setEditorJob(job)}
                    sx={{ textTransform: 'none', whiteSpace: 'nowrap', fontWeight: 800 }}
                  >
                    {job.documentGenerated ? 'Edit Invoice' : 'Create Invoice'}
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <PostPressJobEditor
        open={editorJob !== undefined}
        onClose={() => setEditorJob(undefined)}
        row={row}
        job={editorJob || null}
        parties={parties}
        onSaved={async () => {
          await onRefresh?.();
        }}
      />
    </Box>
  );
}
