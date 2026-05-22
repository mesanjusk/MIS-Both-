import PropTypes from 'prop-types';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';

/* Icon map keyed by action label */
const ACTION_ICONS = {
  'New Order': <AddShoppingCartRoundedIcon fontSize="small" />,
  'Receipt':   <ReceiptLongRoundedIcon fontSize="small" />,
  'Payment':   <PaymentsRoundedIcon fontSize="small" />,
  'Followup':  <NotificationsActiveRoundedIcon fontSize="small" />,
  'Task':      <AddTaskRoundedIcon fontSize="small" />,
  'Add UPI':   <AddCardRoundedIcon fontSize="small" />,
};

/* Action accent colours */
const ACTION_COLORS = {
  'New Order': 'primary.main',
  'Receipt':   'success.main',
  'Payment':   'warning.main',
  'Followup':  'error.main',
  'Task':      'secondary.main',
  'Add UPI':   'info.main',
};

export default function FloatingButtons({ buttonsList = [] }) {
  return (
    <SpeedDial
      ariaLabel="quick actions"
      icon={<SpeedDialIcon openIcon={<AddCircleOutlineRoundedIcon />} />}
      direction="up"
      FabProps={{
        color: 'primary',
        sx: (t) => ({
          width: 48,
          height: 48,
          background: `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.primary.dark})`,
          boxShadow: `0 6px 20px ${t.palette.primary.main}50`,
          '&:hover': {
            background: `linear-gradient(135deg, ${t.palette.primary.dark}, ${t.palette.primary.dark})`,
            boxShadow: `0 8px 24px ${t.palette.primary.main}60`,
          },
        }),
      }}
      sx={{
        position: 'fixed',
        bottom: { xs: 82, md: 24 },
        right: { xs: 16, lg: 96 },
        zIndex: 1245,
      }}
    >
      {buttonsList.map((button) => (
        <SpeedDialAction
          key={button.label}
          icon={ACTION_ICONS[button.label] || <AddCircleOutlineRoundedIcon fontSize="small" />}
          tooltipTitle={button.label}
          tooltipOpen
          onClick={button.onClick}
          FabProps={{
            sx: (t) => ({
              width: 38,
              height: 38,
              bgcolor: 'background.paper',
              color: ACTION_COLORS[button.label] || 'text.primary',
              boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
              border: `1px solid ${t.palette.divider}`,
              transition: 'all 0.18s ease',
              '&:hover': {
                bgcolor: t.palette.background.default,
                boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
                transform: 'scale(1.05)',
              },
            }),
          }}
          TooltipProps={{
            componentsProps: {
              tooltip: {
                sx: {
                  bgcolor: 'rgba(15, 23, 42, 0.88)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  px: 1.25,
                  py: 0.4,
                  borderRadius: 1.5,
                  boxShadow: 6,
                  maxWidth: 'none',
                  whiteSpace: 'nowrap',
                },
              },
            },
          }}
        />
      ))}
    </SpeedDial>
  );
}

FloatingButtons.propTypes = {
  buttonsList: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      onClick: PropTypes.func.isRequired,
    }),
  ),
};
