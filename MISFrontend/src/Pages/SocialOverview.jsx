import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Chip, CircularProgress, Grid, Paper, Stack, Typography, Button,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import toast from 'react-hot-toast';
import { getOverview } from '../services/socialMediaService';
import { ROUTES } from '../constants/routes';

const STAT_TILES = [
  { key: 'scheduledToday', label: 'Scheduled Today', icon: EventAvailableRoundedIcon, color: 'info' },
  { key: 'pendingApproval', label: 'Pending Approval', icon: PendingActionsRoundedIcon, color: 'warning' },
  { key: 'publishing', label: 'Publishing', icon: CloudUploadRoundedIcon, color: 'secondary' },
  { key: 'publishedThisWeek', label: 'Published This Week', icon: CheckCircleRoundedIcon, color: 'success' },
  { key: 'failed', label: 'Failed', icon: ErrorRoundedIcon, color: 'error' },
  { key: 'connectedAccounts', label: 'Connected Accounts', icon: LinkRoundedIcon, color: 'primary' },
];

const platformStatusColor = (status) => {
  if (status === 'Connected') return 'success';
  if (status === 'Not connected') return 'default';
  if (status === 'Approval required') return 'warning';
  if (status === 'Reconnect required') return 'error';
  return 'default';
};

export default function SocialOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const overview = await getOverview();
      setData(overview);
    } catch {
      toast.error('Failed to load Social Media overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" rowGap={1}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <ShareRoundedIcon color="primary" sx={{ fontSize: 30 }} />
          <Box>
            <Typography variant="h5" fontWeight={900}>Social Media</Typography>
            <Typography variant="caption" color="text.secondary">Content, approvals, scheduling and publishing across all connected platforms</Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate(ROUTES.SOCIAL_CREATE_POST)}>
          Create Post
        </Button>
      </Stack>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {STAT_TILES.map(({ key, label, icon: Icon, color }) => (
          <Grid item xs={6} sm={4} md={2} key={key}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, height: '100%' }}>
              <Icon color={color} sx={{ fontSize: 22, mb: 0.5 }} />
              <Typography variant="h5" fontWeight={900}>{data?.[key] ?? 0}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>Platform Status</Typography>
              <Stack spacing={1}>
                {(data?.platformStatus || []).map((p) => (
                  <Stack key={p.platform} direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 700 }}>{p.platform}</Typography>
                    <Chip size="small" label={p.status} color={platformStatusColor(p.status)} variant={p.status === 'Connected' ? 'filled' : 'outlined'} />
                  </Stack>
                ))}
              </Stack>
              <Button size="small" sx={{ mt: 1.5 }} onClick={() => navigate(ROUTES.SOCIAL_ACCOUNTS)}>Manage accounts</Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>Recent Posts</Typography>
              <Stack spacing={1}>
                {(data?.recentPosts || []).map((p) => (
                  <Paper key={p._id} variant="outlined" sx={{ p: 1, borderRadius: 2, cursor: 'pointer' }} onClick={() => navigate(`${ROUTES.SOCIAL_CREATE_POST}/${p._id}`)}>
                    <Typography variant="body2" fontWeight={700} noWrap>{p.title || '(untitled post)'}</Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Chip size="small" label={p.status} sx={{ height: 18, fontSize: '0.62rem' }} />
                      <Typography variant="caption" color="text.secondary">{p.createdByName}</Typography>
                    </Stack>
                  </Paper>
                ))}
                {!data?.recentPosts?.length && <Typography variant="caption" color="text.secondary">No posts yet.</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>Upcoming Posts</Typography>
              <Stack spacing={1}>
                {(data?.upcomingPosts || []).map((p) => (
                  <Paper key={p._id} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{p.title || '(untitled post)'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.scheduledAt ? new Date(p.scheduledAt).toLocaleString('en-IN') : '-'} · {p.platforms?.join(', ')}
                    </Typography>
                  </Paper>
                ))}
                {!data?.upcomingPosts?.length && <Typography variant="caption" color="text.secondary">Nothing scheduled.</Typography>}
              </Stack>
              <Button size="small" sx={{ mt: 1.5 }} onClick={() => navigate(ROUTES.SOCIAL_CALENDAR)}>Open calendar</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
