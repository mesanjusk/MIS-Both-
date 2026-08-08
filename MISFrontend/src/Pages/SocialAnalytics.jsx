import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import toast from 'react-hot-toast';
import { getAnalytics } from '../services/socialMediaService';
import { SOCIAL_PLATFORMS } from '../constants/social';

const METRIC_LABELS = {
  impressions: 'Impressions', reach: 'Reach', likes: 'Likes', comments: 'Comments',
  shares: 'Shares', saves: 'Saves', engagement: 'Engagement', clicks: 'Clicks',
  videoViews: 'Video Views', followers: 'Followers', subscribers: 'Subscribers',
};

export default function SocialAnalytics() {
  const [platform, setPlatform] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (platform) params.platform = platform;
      const data = await getAnalytics(params);
      setSnapshots(data);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => { load(); }, [load]);

  const chartData = [...snapshots]
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .map((s) => ({
      date: new Date(s.capturedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      impressions: s.metrics?.impressions ?? null,
      engagement: s.metrics?.engagement ?? null,
    }));

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <InsightsRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>Social Analytics</Typography>
          <Typography variant="caption" color="text.secondary">Only metrics the platform API actually returned are shown — others read "Not available from API."</Typography>
        </Box>
      </Stack>

      <TextField
        select
        size="small"
        label="Platform"
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
        sx={{ minWidth: 180, mb: 2 }}
      >
        <MenuItem value="">All platforms</MenuItem>
        {SOCIAL_PLATFORMS.map((p) => <MenuItem key={p} value={p} sx={{ textTransform: 'capitalize' }}>{p}</MenuItem>)}
      </TextField>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {chartData.some((d) => d.impressions != null || d.engagement != null) && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2, height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="impressions" stroke="#16a34a" dot={false} name="Impressions" />
                  <Line type="monotone" dataKey="engagement" stroke="#0d9488" dot={false} name="Engagement" />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Captured</TableCell>
                  <TableCell>Platform</TableCell>
                  {Object.keys(METRIC_LABELS).map((k) => <TableCell key={k}>{METRIC_LABELS[k]}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshots.map((s) => (
                  <TableRow key={s._id} hover>
                    <TableCell><Typography variant="caption">{new Date(s.capturedAt).toLocaleString('en-IN')}</Typography></TableCell>
                    <TableCell><Chip size="small" label={s.platform} sx={{ textTransform: 'capitalize' }} /></TableCell>
                    {Object.keys(METRIC_LABELS).map((k) => (
                      <TableCell key={k}>
                        {s.metrics?.[k] != null ? s.metrics[k] : <Typography variant="caption" color="text.secondary">—</Typography>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!snapshots.length && (
                  <TableRow><TableCell colSpan={2 + Object.keys(METRIC_LABELS).length} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No analytics snapshots yet — open a published post and refresh its analytics.
                    </Typography>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
