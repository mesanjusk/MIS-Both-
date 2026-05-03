import { Box, Card, CardContent, Typography } from '@mui/material';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';

export default function KpiCard({ title, value, icon: Icon, color = '#6366f1', trend, trendLabel, onClick }) {
  const trendUp = typeof trend === 'number' ? trend >= 0 : undefined;
  return (
    <Card
      onClick={onClick}
      sx={{
        borderRadius: 3,
        boxShadow: '0 1px 6px rgba(0,0,0,.07)',
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.18s, transform 0.18s',
        '&:hover': onClick ? { boxShadow: '0 4px 16px rgba(0,0,0,.12)', transform: 'translateY(-1px)' } : {},
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={500} noWrap sx={{ flex: 1, pr: 1 }}>
            {title}
          </Typography>
          {Icon && (
            <Box sx={{ bgcolor: `${color}1a`, borderRadius: 2, p: 0.8, display: 'flex', flexShrink: 0 }}>
              <Icon sx={{ fontSize: 20, color }} />
            </Box>
          )}
        </Box>

        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.75, letterSpacing: '-0.5px' }}>
          {value}
        </Typography>

        {trendUp !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {trendUp
              ? <TrendingUpRoundedIcon sx={{ fontSize: 14, color: 'success.main' }} />
              : <TrendingDownRoundedIcon sx={{ fontSize: 14, color: 'error.main' }} />}
            <Typography variant="caption" color={trendUp ? 'success.main' : 'error.main'} fontWeight={600}>
              {Math.abs(trend)}%
            </Typography>
            {trendLabel && (
              <Typography variant="caption" color="text.disabled" sx={{ ml: 0.25 }}>
                {trendLabel}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
