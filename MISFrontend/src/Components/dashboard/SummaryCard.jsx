import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Card, Stack, Typography } from '@mui/material';

const variantConfig = {
  primary: (theme) => ({ color: theme.palette.primary.main }),
  success: (theme) => ({ color: theme.palette.success.main }),
  warning: (theme) => ({ color: theme.palette.warning.dark }),
  danger: (theme) => ({ color: theme.palette.error.main }),
};

export default function SummaryCard({ title, value, icon: Icon, variant = 'primary', trend, sx }) {
  return (
    <Card
      elevation={0}
      sx={(theme) => {
        const cfg = (variantConfig[variant] || variantConfig.primary)(theme);
        return {
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          border: `1px solid ${theme.palette.divider}`,
          borderLeft: `4px solid ${cfg.color}`,
          borderRadius: 2,
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: `0 8px 24px ${alpha(cfg.color, 0.18)}`,
          },
          ...sx,
        };
      }}
    >
      <Box sx={{ p: { xs: 1.5, md: 1.75 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="span"
              sx={{
                display: 'block',
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: 0.9,
                fontWeight: 800,
                color: 'text.secondary',
                mb: 0.6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}
              noWrap
            >
              {value}
            </Typography>
            {trend ? (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.4, display: 'block' }}>
                {trend}
              </Typography>
            ) : null}
          </Box>
          {Icon ? (
            <Box
              sx={(theme) => {
                const cfg = (variantConfig[variant] || variantConfig.primary)(theme);
                return {
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(cfg.color, 0.1),
                  color: cfg.color,
                  flexShrink: 0,
                };
              }}
            >
              <Icon sx={{ fontSize: 20 }} />
            </Box>
          ) : null}
        </Stack>
      </Box>
    </Card>
  );
}

SummaryCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType,
  variant: PropTypes.oneOf(['primary', 'success', 'warning', 'danger']),
  trend: PropTypes.string,
  sx: PropTypes.object,
};
