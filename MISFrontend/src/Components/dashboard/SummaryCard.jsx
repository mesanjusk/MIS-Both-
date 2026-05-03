import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Card, Stack, Typography } from '@mui/material';

const variantStyles = {
  primary: (theme) => ({
    bg: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.14)}, ${alpha(theme.palette.info.main, 0.08)})`,
    color: theme.palette.primary.main,
    ring: alpha(theme.palette.primary.main, 0.16),
  }),
  success: (theme) => ({
    bg: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.14)}, ${alpha(theme.palette.secondary.main, 0.08)})`,
    color: theme.palette.success.main,
    ring: alpha(theme.palette.success.main, 0.16),
  }),
  warning: (theme) => ({
    bg: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.15)}, ${alpha(theme.palette.warning.light, 0.08)})`,
    color: theme.palette.warning.dark,
    ring: alpha(theme.palette.warning.main, 0.18),
  }),
  danger: (theme) => ({
    bg: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.14)}, ${alpha(theme.palette.error.light, 0.08)})`,
    color: theme.palette.error.main,
    ring: alpha(theme.palette.error.main, 0.16),
  }),
};

export default function SummaryCard({ title, value, icon: Icon, variant = 'primary', trend, sx }) {
  return (
    <Card
      elevation={0}
      sx={(theme) => {
        const v = (variantStyles[variant] || variantStyles.primary)(theme);
        return {
          p: { xs: 1.05, md: 1.2 },
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          background: v.bg,
          borderColor: v.ring,
          transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 18px 36px rgba(15,23,42,0.10)',
            borderColor: v.color,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 'auto -34px -42px auto',
            width: 105,
            height: 105,
            borderRadius: '50%',
            background: alpha(v.color, 0.08),
          },
          ...sx,
        };
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.1} sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={0.45} minWidth={0}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.55, fontWeight: 850 }} noWrap>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ lineHeight: 1, color: 'text.primary' }} noWrap>
            {value}
          </Typography>
          {trend ? <Typography variant="caption" color="text.secondary" noWrap>{trend}</Typography> : null}
        </Stack>
        {Icon ? (
          <Box
            sx={(theme) => {
              const v = (variantStyles[variant] || variantStyles.primary)(theme);
              return {
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha('#ffffff', 0.9),
                color: v.color,
                width: 38,
                height: 38,
                borderRadius: 2,
                border: `1px solid ${alpha(v.color, 0.14)}`,
                boxShadow: `0 10px 20px ${alpha(v.color, 0.10)}`,
                flexShrink: 0,
              };
            }}
          >
            <Icon sx={{ fontSize: 21 }} />
          </Box>
        ) : null}
      </Stack>
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
