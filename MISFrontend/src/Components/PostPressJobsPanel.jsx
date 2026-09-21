import { useMemo, useState } from 'react';
import {
  Box,
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
    <Box sx={{ p: 0.55, bgcolor: 'action.hover' }}>
      <Paper variant="outlined" sx={{ borderRadius: 1.75, overflow: 'hidden' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={0.5}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ px: 0.85, py: 0.55, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
              <Typography variant="caption" fontWeight={900}>Post Press</Typography>
              {jobs.length ? (
                <Chip
                  size="small"
                  color={completed === jobs.length ? 'success' : 'warning'}
                  label={`${completed}/${jobs.length} complete`}
                  sx={{ height: 18, fontSize: 9 }}
                />
              ) : (
                <Chip size="small" label="0" sx={{ height: 18, minWidth: 24, fontSize: 9 }} />
              )}
              {total > 0 ? (
                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                  Cost {money(total)}
                </Typography>
              ) : null}
            </Stack>
          </Box>

          <Stack direction="row" spacing={0.4}>
            <Tooltip title="Open Printing folder">
              <IconButton
                size="small"
                onClick={() => onOpenFolder?.(row)}
                sx={{ width: 28, height: 28, border: '1px solid', borderColor: 'divider' }}
                aria-label="open Printing folder"
              >
                <FolderOpenRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Add post-press service">
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => setEditorJob(null)}
                  disabled={!row?.orderUuid}
                  sx={{ width: 28, height: 28, border: '1px solid', borderColor: 'primary.light' }}
                  aria-label="add post-press service"
                >
                  <AddRoundedIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        {!jobs.length ? (
          <Box sx={{ px: 1, py: 1.1, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              No post-press service. Use + to add.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={0} divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
            {jobs.map((job) => (
              <Stack
                key={job.job_uuid}
                direction={{ xs: 'column', md: 'row' }}
                spacing={0.6}
                alignItems={{ xs: 'stretch', md: 'center' }}
                sx={{ px: 0.8, py: 0.55 }}
              >
                <Box sx={{ minWidth: { md: 120 }, flex: 1 }}>
                  <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
                    <Typography variant="caption" fontWeight={900}>
                      {typeLabel(job.job_type)}
                    </Typography>
                    <Chip
                      size="small"
                      color={statusColor(job.status)}
                      label={statusLabel(job.status)}
                      variant={job.status === 'completed' ? 'filled' : 'outlined'}
                      sx={{ height: 17, fontSize: 8.5 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 175, fontSize: 10 }}>
                    {job.payableVendorName || job.vendor_name || 'Vendor not set'} · #{job.job_number || '—'}
                  </Typography>
                </Box>

                <Typography variant="caption" fontWeight={900} sx={{ minWidth: { md: 74 }, whiteSpace: 'nowrap' }}>
                  {money(job.jobValue)}
                </Typography>

                <TextField
                  select
                  size="small"
                  value={job.status || 'draft'}
                  onChange={(e) => updateStatus(job, e.target.value)}
                  disabled={savingStatus === job.job_uuid}
                  sx={{
                    width: 108,
                    '& .MuiInputBase-root': { height: 30, fontSize: 11 },
                    '& .MuiSelect-select': { py: 0.45 },
                  }}
                >
                  {POST_PRESS_STATUS.map((item) => (
                    <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                  ))}
                </TextField>

                <Stack direction="row" spacing={0.35}>
                  <Tooltip title="Open Printing folder">
                    <IconButton
                      size="small"
                      onClick={() => onOpenFolder?.(row)}
                      sx={{ width: 28, height: 28, border: '1px solid', borderColor: 'divider' }}
                      aria-label="open Printing folder"
                    >
                      <FolderOpenRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={job.documentGenerated ? 'Edit job-work invoice' : 'Create job-work invoice'}>
                    <IconButton
                      size="small"
                      color={job.documentGenerated ? 'primary' : 'success'}
                      onClick={() => setEditorJob(job)}
                      sx={{
                        width: 28,
                        height: 28,
                        border: '1px solid',
                        borderColor: job.documentGenerated ? 'primary.light' : 'success.light',
                      }}
                      aria-label={job.documentGenerated ? 'edit job-work invoice' : 'create job-work invoice'}
                    >
                      {job.documentGenerated
                        ? <EditRoundedIcon sx={{ fontSize: 16 }} />
                        : <ReceiptLongRoundedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
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
