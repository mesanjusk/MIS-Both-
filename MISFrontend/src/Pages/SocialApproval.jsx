import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, Stack, TextField, Typography,
} from '@mui/material';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import toast from 'react-hot-toast';
import { listPosts, approvePost, rejectPost } from '../services/socialMediaService';
import { ROUTES } from '../constants/routes';

function RejectDialog({ post, onClose, onRejected }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const handleReject = async () => {
    if (!reason.trim()) {
      toast.error('A rejection reason is required');
      return;
    }
    setBusy(true);
    try {
      await rejectPost(post._id, reason.trim());
      toast.success('Post rejected');
      onRejected();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Reject "{post.title || 'Untitled post'}"</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label="Rejection reason (required)"
          placeholder='e.g. "Please replace the first image and correct the price."'
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={busy} onClick={handleReject}>
          {busy ? 'Rejecting…' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function SocialApproval() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await listPosts({ approvalStatus: 'PENDING' });
      setPosts(data);
    } catch {
      toast.error('Failed to load posts pending approval');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (post) => {
    setBusyId(post._id);
    try {
      await approvePost(post._id);
      toast.success('Post approved');
      setPosts((prev) => prev.filter((p) => p._id !== post._id));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <FactCheckRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>Approval Queue</Typography>
          <Typography variant="caption" color="text.secondary">{posts.length} post(s) waiting on a decision</Typography>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        {posts.map((post) => (
          <Grid item xs={12} sm={6} md={4} key={post._id}>
            <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
              {post.assets?.[0] && (
                <Box
                  component="img"
                  src={post.assets[0].thumbnailUrl || post.assets[0].url}
                  alt=""
                  sx={{ width: '100%', height: 160, objectFit: 'cover', cursor: 'pointer' }}
                  onClick={() => navigate(`${ROUTES.SOCIAL_CREATE_POST}/${post._id}`)}
                />
              )}
              <CardContent>
                <Typography variant="subtitle2" fontWeight={800} noWrap>{post.title || 'Untitled post'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {post.caption}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" rowGap={0.5} sx={{ mb: 1 }}>
                  {post.platforms.map((p) => <Chip key={p} size="small" label={p} sx={{ textTransform: 'capitalize' }} />)}
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  by {post.createdByName} {post.scheduledAt ? `· scheduled ${new Date(post.scheduledAt).toLocaleString('en-IN')}` : ''}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<CheckRoundedIcon />}
                    disabled={busyId === post._id}
                    onClick={() => handleApprove(post)}
                  >
                    Approve
                  </Button>
                  <Button variant="outlined" color="error" size="small" startIcon={<CloseRoundedIcon />} onClick={() => setRejectTarget(post)}>
                    Reject
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {!posts.length && (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary" align="center">Nothing pending approval right now.</Typography>
          </Grid>
        )}
      </Grid>

      {rejectTarget && (
        <RejectDialog
          post={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => {
            setPosts((prev) => prev.filter((p) => p._id !== rejectTarget._id));
            setRejectTarget(null);
          }}
        />
      )}
    </Box>
  );
}
