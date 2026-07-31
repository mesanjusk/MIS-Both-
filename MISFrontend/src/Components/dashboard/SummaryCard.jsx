import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Card, Stack, Typography } from '@mui/material';

const variantConfig = {
  primary: (theme) => ({ color: theme.palette.primary.main }),
  success: (theme) => ({ color: theme.palette.success.main }),
  warning: (theme) => ({ color: theme.palette.warning.dark }),
  danger:  (theme) => ({ color: theme.palette.error.main }),
};

export default function SummaryCard({ title, value, icon: Icon, variant = 'primary', trend, onClick, sx }) {
  return (
    <Card
      elevation={0}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      sx={(theme) => {
        const cfg = (variantConfig[variant] || variantConfig.primary)(theme);
        return {
          height: '100%',
          position: 'relative',
          overflow: 'visible',
          bgcolor: 'background.paper',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 3,
          cursor: onClick ? 'pointer' : 'default',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: `0 8px 28px ${alpha(cfg.color, 0.14)}`,
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 12,
            right: 12,
            height: 3,
            borderRadius: '0 0 3px 3px',
            background: cfg.color,
          },
          ...sx,
        };
      }}
    >
      <Box sx={{ p: { xs: 1, md: 1.1 }, pt: { xs: 1.25, md: 1.35 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={0.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="span"
              sx={{
                display: 'block',
                fontSize: '0.56rem',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontWeight: 700,
                color: 'text.secondary',
                mb: 0.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.2, fontSize: { xs: '0.95rem', md: '1rem' } }}
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
                  width: 26,
                  height: 26,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(cfg.color, 0.1),
                  color: cfg.color,
                  flexShrink: 0,
                };
              }}
            >
              <Icon sx={{ fontSize: 14 }} />
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
  onClick: PropTypes.func,
  sx: PropTypes.object,
};
