import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, Tab, Typography,
} from '@mui/material';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import toast from 'react-hot-toast';
import { listPosts, retryPost, cancelPost } from '../services/socialMediaService';

const TABS = [
  { key: 'ACTIVE', label: 'Active', statuses: ['SCHEDULED', 'APPROVED', 'PUBLISHING'] },
  { key: 'FAILED', label: 'Failed', statuses: ['FAILED', 'PARTIALLY_PUBLISHED'] },
  { key: 'PUBLISHED', label: 'Published', statuses: ['PUBLISHED'] },
];

const RESULT_COLOR = { PENDING: 'default', PUBLISHING: 'info', PUBLISHED: 'success', FAILED: 'error', CANCELLED: 'default' };

export default function SocialPublishingQueue() {
  const [tab, setTab] = useState('ACTIVE');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = TABS.find((t) => t.key === tab).statuses;
      const results = await Promise.all(statuses.map((status) => listPosts({ status, limit: 100 })));
      const merged = results.flatMap((r) => r.data);
      merged.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setPosts(merged);
    } catch {
      toast.error('Failed to load publishing queue');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (post) => {
    setBusyId(post._id);
    try {
      await retryPost(post._id);
      toast.success('Retry queued');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Retry failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (post) => {
    if (!window.confirm('Cancel this post? Pending jobs will be stopped.')) return;
    setBusyId(post._id);
    try {
      await cancelPost(post._id);
      toast.success('Post cancelled');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Cancel failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" rowGap={1}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <PendingActionsRoundedIcon color="primary" sx={{ fontSize: 30 }} />
          <Typography variant="h5" fontWeight={900}>Publishing Queue</Typography>
        </Stack>
        <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        {TABS.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Post</TableCell>
                <TableCell>Scheduled</TableCell>
                <TableCell>Platforms</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post._id} hover>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{post.title || 'Untitled post'}</Typography>
                    <Typography variant="caption" color="text.secondary">{post.createdByName}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleString('en-IN') : '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      {post.platformResults?.map((r) => (
                        <Stack key={r.platform} direction="row" spacing={0.5} alignItems="center">
                          <Chip size="small" label={r.platform} sx={{ textTransform: 'capitalize', height: 18, fontSize: '0.62rem' }} />
                          <Chip size="small" label={r.status} color={RESULT_COLOR[r.status] || 'default'} sx={{ height: 18, fontSize: '0.62rem' }} />
                          {r.errorMessage && (
                            <Typography variant="caption" color="error.main" sx={{ maxWidth: 220 }} noWrap title={r.errorMessage}>
                              {r.errorMessage}
                            </Typography>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell><Chip size="small" label={post.status} /></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {(post.status === 'FAILED' || post.status === 'PARTIALLY_PUBLISHED') && (
                        <Button size="small" disabled={busyId === post._id} onClick={() => handleRetry(post)}>Retry</Button>
                      )}
                      {['SCHEDULED', 'APPROVED'].includes(post.status) && (
                        <Button size="small" color="error" disabled={busyId === post._id} onClick={() => handleCancel(post)}>Cancel</Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!posts.length && (
                <TableRow><TableCell colSpan={5} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Nothing here.</Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
